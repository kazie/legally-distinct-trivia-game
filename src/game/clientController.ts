import { computed, ref, shallowRef } from 'vue'
import type { BridgeClient, ConnectionStatus } from '@/net/bridgeClient'
import { decode, encode, type OutgoingMessage } from '@/net/protocol'
import { PRACTICE_ID } from './engine'
import type { KeyValueStorage } from './hostController'
import { MAX_REACTIONS, REACTION_INTERVAL_MS, REACTION_SHOW_MS, type FloatingReaction } from './reactions'
import { liveClueValue, revealProgress } from './reveal'
import { roomTopic } from './roomCode'
import { DEFAULT_SETTINGS } from './settings'
import type { PracticeHit, PublicCurrentClue, PublicState } from './types'

export const PING_MS = 5000
/** Without a state snapshot for this long the host is shown as offline (host heartbeats every 3 s). */
export const HOST_TIMEOUT_MS = 8000

export type ClientRole = 'player' | 'board'

/** What a tap on the buzz pad did. */
export type PressResult = 'buzzed' | 'stunned' | 'ignored'

export interface ClientControllerOptions {
  bridge: BridgeClient
  roomCode: string
  role: ClientRole
  storage?: KeyValueStorage | null
  now?: () => number
  createId?: () => string
}

/** Whatever the buzz pad currently plays for: the clue on screen, or the intro's practice buzz. */
export type Buzzable = Pick<PublicCurrentClue, 'id' | 'attempt' | 'status' | 'target' | 'dailyDouble' | 'lockedOut' | 'lockedUntil'>

export const PLAYER_ID_KEY = 'ldtg:playerId'
export const joinedKey = (room: string) => `ldtg:joined:${room}`

/** Player phone or board screen: mirrors the host's public state and sends intents. */
export class ClientController {
  readonly role: ClientRole
  readonly roomCode: string
  readonly playerId: string
  readonly state = shallowRef<PublicState | null>(null)
  readonly connection = ref<ConnectionStatus>('closed')
  /** Name this device joined with in this room, if any. */
  readonly joinedName = ref<string | null>(null)
  readonly clock = ref(0)
  /** Host clock minus local clock, to show the host's timers correctly. */
  readonly clockOffset = ref(0)
  private readonly lastStateAt = ref(0)
  /** Set from the `buzzers_open` message so the button lights up without waiting for the next snapshot. */
  private readonly openedLocally = shallowRef<{ clueId: string; attempt: number } | null>(null)
  private readonly buzzedFor = shallowRef<{ clueId: string; attempt: number } | null>(null)
  /** True for the configured lockout after tapping the wrong emoji or pressing before buzzers open. */
  readonly stunned = ref(false)
  private readonly stunEndsAt = ref(0)
  private stunTimer: ReturnType<typeof setTimeout> | null = null
  /** Board screens: reactions floating on screen right now. */
  readonly reactions = shallowRef<FloatingReaction[]>([])
  private reactionCount = 0
  /** When each player (or, on a phone, this player) last reacted. */
  private lastReactionAt = new Map<string, number>()

  private readonly bridge: BridgeClient
  private readonly topic: string
  private readonly storage: KeyValueStorage | null
  private readonly now: () => number
  private timers: ReturnType<typeof setInterval>[] = []
  private cleanups: (() => void)[] = []
  private wasListed = false

  readonly hostOnline = computed(() => this.lastStateAt.value > 0 && this.clock.value - this.lastStateAt.value < HOST_TIMEOUT_MS)
  readonly me = computed(() => this.state.value?.players.find((p) => p.id === this.playerId) ?? null)
  readonly buzzWinnerName = computed(() => this.nameOf(this.state.value?.current?.buzzWinner ?? null))
  readonly settings = computed(() => this.state.value?.settings ?? DEFAULT_SETTINGS)
  /** The host's clock, as far as this device can tell. */
  readonly hostClock = computed(() => this.clock.value + this.clockOffset.value)

  /** How sharp a blur-reveal picture on the clue is right now (0–1), or null when there's none. */
  readonly revealProgress = computed(() => {
    const reveal = this.state.value?.current?.reveal
    return reveal ? revealProgress(reveal, this.hostClock.value) : null
  })

  /** What the clue is worth right now: it drops while a shrinking blur reveal sharpens. */
  readonly clueValue = computed(() => {
    const cur = this.state.value?.current
    return cur ? liveClueValue(cur, this.hostClock.value) : 0
  })

  readonly buzzable = computed((): Buzzable | null => {
    const state = this.state.value
    if (state?.phase === 'intro' && state.practice) {
      return { ...state.practice, id: PRACTICE_ID, dailyDouble: false, lockedOut: [] }
    }
    return state?.current ?? null
  })

  /** This player's practice result, once they tapped the right emoji. */
  readonly practiceHit = computed((): PracticeHit | null => {
    return this.state.value?.practice?.hits.find((h) => h.playerId === this.playerId) ?? null
  })

  readonly buzzersOpen = computed(() => {
    const cur = this.buzzable.value
    if (!cur) return false
    if (cur.status === 'open') return true
    const local = this.openedLocally.value
    return cur.status === 'opening' && local?.clueId === cur.id && local.attempt === cur.attempt
  })

  /** Whether this player has already buzzed in the current attempt. */
  readonly hasBuzzed = computed(() => {
    const cur = this.buzzable.value
    const buzzed = this.buzzedFor.value
    return !!cur && buzzed?.clueId === cur.id && buzzed.attempt === cur.attempt
  })

  /** Lockout left after a false start: this phone's own, or the host's (which survives a reload). */
  readonly lockMs = computed(() => {
    const own = this.stunned.value ? Math.max(0, this.stunEndsAt.value - this.clock.value) : 0
    const host = this.remainingMs(this.buzzable.value?.lockedUntil[this.playerId] ?? null) ?? 0
    return Math.max(own, host)
  })

  readonly canBuzz = computed(() => {
    const cur = this.buzzable.value
    if (!cur || !this.me.value || !this.buzzersOpen.value || this.stunned.value || this.lockMs.value > 0) return false
    return !cur.lockedOut.includes(this.playerId) && !this.hasBuzzed.value
  })

  /** The emoji to tap, for the phone to show itself when the host turned on emoji on phones. */
  readonly phoneTarget = computed((): number | null => {
    if (!this.settings.value.emojiOnPhones || !this.buzzersOpen.value) return null
    return this.buzzable.value?.target ?? null
  })

  constructor(options: ClientControllerOptions) {
    this.bridge = options.bridge
    this.roomCode = options.roomCode
    this.role = options.role
    this.topic = roomTopic(options.roomCode)
    this.storage = options.storage ?? null
    this.now = options.now ?? Date.now
    this.clock.value = this.now()
    this.playerId = this.loadPlayerId(options.createId ?? (() => crypto.randomUUID()))
    this.joinedName.value = this.read(joinedKey(this.roomCode))
  }

  start(): void {
    this.cleanups.push(this.bridge.subscribe(this.topic, (data) => this.receive(data)))
    this.cleanups.push(
      this.bridge.onStatus((status) => {
        this.connection.value = status
        if (status === 'open') this.greet()
      }),
    )
    this.timers.push(setInterval(() => (this.clock.value = this.now()), 250))
    if (this.role === 'player') {
      this.timers.push(
        setInterval(() => {
          if (this.joinedName.value) this.send({ type: 'ping', from: 'player', playerId: this.playerId })
        }, PING_MS),
      )
    }
  }

  stop(): void {
    if (this.stunTimer) clearTimeout(this.stunTimer)
    this.stunTimer = null
    this.stunned.value = false
    this.timers.forEach(clearInterval)
    this.timers = []
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
  }

  join(name: string): void {
    const trimmed = name.trim()
    if (!trimmed) return
    this.joinedName.value = trimmed
    this.write(joinedKey(this.roomCode), trimmed)
    this.send({ type: 'join', from: 'player', playerId: this.playerId, name: trimmed })
  }

  leave(): void {
    this.joinedName.value = null
    this.wasListed = false
    this.storage?.removeItem(joinedKey(this.roomCode))
  }

  /**
   * A press of the big button, or a tap on the emoji pad (`emoji`).
   * - Buzzers open (and, on the pad, the right emoji): buzzes in.
   * - Pad: a wrong emoji or any tap before buzzers open blocks this phone for the lockout time.
   * - Button: a press before buzzers open is a false start. It still goes to the host, which takes the
   *   penalty points; this phone blocks itself right away so the feedback is instant.
   * Presses that can't matter (locked out, someone answering, quick draw still opening…) do nothing.
   */
  press(emoji?: number): PressResult {
    const cur = this.buzzable.value
    if (!cur || !this.me.value || cur.dailyDouble || this.stunned.value || this.lockMs.value > 0) return 'ignored'
    if (cur.status !== 'reading' && cur.status !== 'closed' && cur.status !== 'opening' && cur.status !== 'open') return 'ignored'
    if (cur.lockedOut.includes(this.playerId) || this.hasBuzzed.value) return 'ignored'
    const button = this.settings.value.buzzStyle === 'button'
    const buzz = { type: 'buzz', from: 'player', playerId: this.playerId, clueId: cur.id, attempt: cur.attempt } as const
    if (this.buzzersOpen.value && (button || emoji === cur.target)) {
      this.buzzedFor.value = { clueId: cur.id, attempt: cur.attempt }
      this.send(button ? buzz : { ...buzz, emoji })
      return 'buzzed'
    }
    if (button) {
      // Quick draw has no "too early": the clue's buzzers are about to open anyway. While closed (after a wrong
      // answer) the host can't tell an early press from a late one, so it ignores them: do the same here.
      if (cur.id !== PRACTICE_ID && this.settings.value.openMode !== 'host') return 'ignored'
      if (cur.status === 'closed') return 'ignored'
      this.send(buzz)
    }
    this.stun()
    return 'stunned'
  }

  wager(kind: 'daily' | 'final', amount: number): boolean {
    return this.send({ type: 'wager', from: 'player', playerId: this.playerId, kind, amount })
  }

  /** Sends a reaction to the TV, at most one per second. */
  react(emoji: number): boolean {
    if (!this.settings.value.reactions || !this.me.value || !this.allowReaction(this.playerId)) return false
    return this.send({ type: 'react', from: 'player', playerId: this.playerId, emoji })
  }

  /** Rate limit per player: one reaction per REACTION_INTERVAL_MS. */
  private allowReaction(playerId: string): boolean {
    const now = this.now()
    if (now - (this.lastReactionAt.get(playerId) ?? -Infinity) < REACTION_INTERVAL_MS) return false
    this.lastReactionAt.set(playerId, now)
    return true
  }

  /** Board screens show reactions from players in the game, when the host allows them. */
  private showReaction(playerId: string, emoji: number) {
    const state = this.state.value
    if (this.role !== 'board' || !state?.settings.reactions || !state.players.some((p) => p.id === playerId)) return
    if (!this.allowReaction(playerId)) return
    const now = this.now()
    const live = this.reactions.value.filter((r) => now - r.at < REACTION_SHOW_MS).slice(-(MAX_REACTIONS - 1))
    this.reactions.value = [...live, { id: ++this.reactionCount, playerId, emoji, at: now }]
  }

  /** An all-play answer (text) or a closest guess (number) for the clue on screen. */
  clueAnswer(answer: string | number): boolean {
    const cur = this.state.value?.current
    if (!cur || cur.status !== 'collecting') return false
    const value = typeof answer === 'number' ? { number: answer } : { text: answer }
    return this.send({ type: 'clue_answer', from: 'player', playerId: this.playerId, clueId: cur.id, ...value })
  }

  finalAnswer(text: string): boolean {
    return this.send({ type: 'final_answer', from: 'player', playerId: this.playerId, text })
  }

  nameOf(playerId: string | null): string | null {
    if (!playerId) return null
    return this.state.value?.players.find((p) => p.id === playerId)?.name ?? null
  }

  /** Milliseconds left until a host-clock deadline. */
  remainingMs(hostDeadline: number | null): number | null {
    if (hostDeadline === null) return null
    return Math.max(0, hostDeadline - this.hostClock.value)
  }

  private stun() {
    const ms = this.settings.value.lockoutMs
    this.stunned.value = true
    this.stunEndsAt.value = this.now() + ms
    this.clock.value = this.now()
    this.stunTimer = setTimeout(() => {
      this.stunned.value = false
      this.stunTimer = null
    }, ms)
  }

  private greet() {
    this.send({ type: 'hello', from: this.role, playerId: this.role === 'player' ? this.playerId : undefined })
    // Rejoin after reconnects or a host reload so the host (re)learns our name.
    if (this.role === 'player' && this.joinedName.value) {
      this.send({ type: 'join', from: 'player', playerId: this.playerId, name: this.joinedName.value })
    }
  }

  private receive(data: unknown) {
    const message = decode(data)
    if (!message) return
    if (message.type === 'buzzers_open') {
      this.openedLocally.value = { clueId: message.clueId, attempt: message.attempt }
      return
    }
    if (message.type === 'react') return this.showReaction(message.playerId, message.emoji)
    if (message.type !== 'state' || message.state.roomCode !== this.roomCode) return
    const state = message.state as unknown as PublicState
    const now = this.now()
    this.state.value = state
    this.lastStateAt.value = now
    this.clock.value = now
    this.clockOffset.value = state.hostTime - now

    if (this.role === 'player' && this.joinedName.value) {
      const listed = state.players.some((p) => p.id === this.playerId)
      // Kicked by the host: back to the join form instead of silently rejoining.
      if (this.wasListed && !listed) this.leave()
      else this.wasListed = listed
    }
  }

  private send(message: OutgoingMessage): boolean {
    return this.bridge.publish(this.topic, encode(message), { echo: false })
  }

  private loadPlayerId(createId: () => string): string {
    const existing = this.read(PLAYER_ID_KEY)
    if (existing) return existing
    const id = createId()
    this.write(PLAYER_ID_KEY, id)
    return id
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  private write(key: string, value: string) {
    try {
      this.storage?.setItem(key, value)
    } catch {
      // Ignore: identity just won't survive a reload.
    }
  }
}
