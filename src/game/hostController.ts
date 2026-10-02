import { shallowRef, type ShallowRef } from 'vue'
import type { BridgeClient } from '@/net/bridgeClient'
import { decode, encode, type Message, type OutgoingMessage } from '@/net/protocol'
import { buzzWindowId, createGame, reduce, type Action } from './engine'
import { toPublicState } from './publicView'
import { roomTopic } from './roomCode'
import type { GameState } from './types'

export const HEARTBEAT_MS = 3000
const HISTORY_LIMIT = 50

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface HostControllerOptions {
  bridge: BridgeClient
  roomCode: string
  storage?: KeyValueStorage | null
  now?: () => number
  heartbeatMs?: number
}

/**
 * Buzzers can't stay opening or open when the host steps back (undo) or reloads: the `buzzers_open` echo
 * already came or never will, and buzzes may have raced it. Close them so the host reopens explicitly.
 */
function settleBuzzers(s: GameState): GameState {
  if (s.current?.status === 'opening' || s.current?.status === 'open') s.current.status = 'closed'
  if (s.practice) s.practice.status = 'reading'
  return s
}

export function hostStorageKey(roomCode: string): string {
  return `ldtg:host:${roomCode}`
}

/**
 * The host tab is the game server: it owns the full GameState (answers included), applies player intents
 * received through the bridge, persists itself to storage and broadcasts a public snapshot.
 */
export class HostController {
  readonly state: ShallowRef<GameState>
  readonly canUndo = shallowRef(false)
  private history: GameState[] = []
  private readonly bridge: BridgeClient
  private readonly topic: string
  private readonly storage: KeyValueStorage | null
  private readonly now: () => number
  private readonly heartbeatMs: number
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private cleanups: (() => void)[] = []

  constructor(options: HostControllerOptions) {
    this.bridge = options.bridge
    this.topic = roomTopic(options.roomCode)
    this.storage = options.storage ?? null
    this.now = options.now ?? Date.now
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS
    this.state = shallowRef(this.restore(options.roomCode) ?? createGame(options.roomCode))
  }

  start(): void {
    this.cleanups.push(this.bridge.subscribe(this.topic, (data, seq) => this.receive(data, seq)))
    this.cleanups.push(
      this.bridge.onStatus((status) => {
        if (status === 'open') this.broadcast()
      }),
    )
    this.heartbeat = setInterval(() => this.broadcast(), this.heartbeatMs)
    this.broadcast()
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.cleanups.forEach((fn) => fn())
    this.cleanups = []
  }

  /** Applies a host action. Returns whether anything changed. */
  dispatch(action: Action, options: { undoable?: boolean } = {}): boolean {
    const before = this.state.value
    const after = reduce(before, action)
    if (after === before) return false
    if (options.undoable ?? true) {
      this.history.push(before)
      if (this.history.length > HISTORY_LIMIT) this.history.shift()
      this.canUndo.value = true
    }
    this.commit(after)
    const opened = after.buzzRound !== before.buzzRound ? buzzWindowId(after) : null
    if (opened) {
      // Buzzers only count as open once this message comes back from the bridge with its seq;
      // buzzes with a higher seq on the same topic are guaranteed to have been sent after it.
      this.send({ type: 'buzzers_open', from: 'host', clueId: opened, attempt: after.buzzRound }, true)
    }
    return true
  }

  undo(): void {
    const popped = this.history.pop()
    this.canUndo.value = this.history.length > 0
    if (!popped) return
    const previous = settleBuzzers(structuredClone(popped))
    // Players remember which attempts they buzzed in, so the next opening must not reuse a number.
    previous.buzzRound = this.state.value.buzzRound
    this.commit(previous)
  }

  /** Forgets the persisted game for this room. */
  clearSaved(): void {
    this.storage?.removeItem(hostStorageKey(this.state.value.roomCode))
  }

  private commit(next: GameState) {
    this.state.value = next
    this.persist()
    this.broadcast()
  }

  private receive(data: unknown, seq: number) {
    const message = decode(data)
    if (!message) return
    this.handle(message, seq)
  }

  private handle(message: Message, seq: number) {
    const now = this.now()
    switch (message.type) {
      case 'buzzers_open':
        this.apply({ type: 'buzzersOpened', clueId: message.clueId, attempt: message.attempt, seq, now })
        return
      case 'hello':
        if (message.playerId) this.apply({ type: 'playerSeen', id: message.playerId, now }, false)
        this.broadcast()
        return
      case 'ping':
        this.apply({ type: 'playerSeen', id: message.playerId, now }, false)
        return
      case 'join':
        this.apply({ type: 'playerJoined', id: message.playerId, name: message.name, now })
        return
      case 'buzz':
        this.markSeen(message.playerId, now)
        this.apply({
          type: 'buzz',
          playerId: message.playerId,
          clueId: message.clueId,
          attempt: message.attempt,
          seq,
          emoji: message.emoji,
          now,
        })
        return
      case 'wager':
        this.markSeen(message.playerId, now)
        this.apply(
          message.kind === 'daily'
            ? { type: 'setDdWager', id: message.playerId, amount: message.amount }
            : { type: 'setFinalWager', id: message.playerId, amount: message.amount },
        )
        return
      case 'final_answer':
        this.markSeen(message.playerId, now)
        this.apply({ type: 'setFinalAnswer', id: message.playerId, text: message.text, now })
        return
      case 'state':
        return
    }
  }

  /** Applies an action caused by a remote message; these are never undo steps of their own. */
  private apply(action: Action, broadcast = true) {
    const before = this.state.value
    const after = reduce(before, action)
    if (after === before) return
    this.state.value = after
    this.persist()
    if (broadcast) this.broadcast()
  }

  private markSeen(playerId: string, now: number) {
    this.apply({ type: 'playerSeen', id: playerId, now }, false)
  }

  private broadcast() {
    this.send({ type: 'state', from: 'host', state: toPublicState(this.state.value, this.now()) }, false)
  }

  private send(message: OutgoingMessage, echo: boolean) {
    this.bridge.publish(this.topic, encode(message), { echo })
  }

  private persist() {
    try {
      this.storage?.setItem(hostStorageKey(this.state.value.roomCode), JSON.stringify(this.state.value))
    } catch {
      // Storage full or unavailable; the game still works, it just can't be resumed after a reload.
    }
  }

  private restore(roomCode: string): GameState | null {
    try {
      const raw = this.storage?.getItem(hostStorageKey(roomCode))
      if (!raw) return null
      const saved = JSON.parse(raw) as GameState
      if (saved.roomCode !== roomCode) return null
      // Games saved before the intro, the game-wide buzz counter and emoji on phones existed.
      saved.practice ??= null
      saved.buzzRound ??= saved.current?.attempt ?? 0
      saved.emojiOnPhones ??= false
      // Buzzes that raced a reload are gone.
      return settleBuzzers(saved)
    } catch {
      return null
    }
  }
}
