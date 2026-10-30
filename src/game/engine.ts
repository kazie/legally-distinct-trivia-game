import type { Board, Clue, Final, Media } from '@/content/schema'
import { isBuzzTarget } from './buzzPad'
import { blurRevealFor, pauseReveal, resumeReveal, revealValue } from './reveal'
import { DEFAULT_SETTINGS, falseStartPoints, normalizeSettings, wrongAnswerPoints, type GameSettings } from './settings'
import type { BuzzWindow, ClueRef, CurrentClue, FalseStart, GameState, Player } from './types'

export type Action =
  | { type: 'loadBoard'; board: Board; dailyDoubles: string[] }
  | { type: 'startGame'; intro?: boolean; settings?: Partial<GameSettings> }
  | { type: 'resetToLobby' }
  | { type: 'playerJoined'; id: string; name: string; now: number }
  | { type: 'playerSeen'; id: string; now: number }
  | { type: 'removePlayer'; id: string }
  | { type: 'renamePlayer'; id: string; name: string }
  | { type: 'adjustScore'; id: string; delta: number }
  | { type: 'setControl'; id: string | null }
  /** `target`: the emoji to open buzzers with right away in quick draw. */
  | { type: 'selectClue'; ref: ClueRef; target?: number }
  | { type: 'setDdPlayer'; id: string }
  | { type: 'setDdWager'; id: string; amount: number }
  | { type: 'showDdClue'; now: number }
  | { type: 'openBuzzers'; target: number }
  | { type: 'buzzersOpened'; clueId: string; attempt: number; seq: number; now: number }
  | { type: 'buzz'; playerId: string; clueId: string; attempt: number; seq: number; emoji?: number; now: number }
  | { type: 'openPractice'; target: number }
  | { type: 'endIntro' }
  | { type: 'closeBuzzers'; now: number }
  /** `target`: the emoji to reopen buzzers with right away after a wrong answer in quick draw. */
  | { type: 'judge'; correct: boolean; target?: number }
  | { type: 'revealAnswer' }
  | { type: 'returnToBoard' }
  | { type: 'endRound' }
  | { type: 'startFinal' }
  | { type: 'openFinalWagers' }
  | { type: 'setFinalWager'; id: string; amount: number }
  | { type: 'showFinalClue'; now: number; durationMs: number }
  | { type: 'setFinalAnswer'; id: string; text: string; now: number }
  | { type: 'closeFinalAnswers' }
  | { type: 'showFinalResponse' }
  | { type: 'judgeFinal'; correct: boolean }
  | { type: 'endGame' }
  | { type: 'showNextCategory' }
  | { type: 'showAllCategories' }
  | { type: 'pause'; message: string; until: number | null }
  | { type: 'resume' }

/** Answers that arrive this long after the final timer ran out are still accepted (network slack). */
export const FINAL_ANSWER_GRACE_MS = 2000
export const MAX_NAME_LENGTH = 24
export const MAX_FINAL_ANSWER_LENGTH = 200
export const MAX_PAUSE_MESSAGE_LENGTH = 80
/** The clue id practice buzzes use in `buzzers_open` and `buzz` messages. */
export const PRACTICE_ID = 'practice'
/** The id of the tie-breaker clue, which isn't on the board. */
export const TIEBREAK_ID = 'tiebreak'

export function clueId(ref: ClueRef): string {
  return `${ref.round}-${ref.category}-${ref.clue}`
}

export function createGame(roomCode: string): GameState {
  return {
    roomCode,
    board: null,
    phase: 'lobby',
    round: 0,
    used: [],
    dailyDoubles: [],
    players: [],
    control: null,
    current: null,
    final: null,
    practice: null,
    buzzRound: 0,
    settings: { ...DEFAULT_SETTINGS },
    falseStarts: [],
    history: [],
    tiebreak: null,
    categoriesShown: null,
    pause: null,
  }
}

/** Flagged Daily Doubles plus `randomDailyDoubles` random picks per round (never in the first row). */
export function pickDailyDoubles(board: Board, random: () => number = Math.random): string[] {
  const picks: string[] = []
  board.rounds.forEach((round, r) => {
    const candidates: string[] = []
    round.categories.forEach((category, c) =>
      category.clues.forEach((clue, i) => {
        const id = clueId({ round: r, category: c, clue: i })
        if (clue.dailyDouble) picks.push(id)
        else if (i > 0 || category.clues.length === 1) candidates.push(id)
      }),
    )
    for (let n = 0; n < (round.randomDailyDoubles ?? 0) && candidates.length > 0; n++) {
      const [id] = candidates.splice(Math.floor(random() * candidates.length), 1)
      picks.push(id!)
    }
  })
  return picks
}

export function ddMaxWager(state: GameState, playerId: string | null): number {
  const round = state.board?.rounds[state.round]
  const top = Math.max(0, ...(round?.categories.flatMap((c) => c.clues.map((clue) => clue.value)) ?? []))
  const score = state.players.find((p) => p.id === playerId)?.score ?? 0
  return Math.max(score, top)
}

export function isRoundComplete(state: GameState): boolean {
  const round = state.board?.rounds[state.round]
  if (!round) return true
  return round.categories.every((category, c) =>
    category.clues.every((_, i) => state.used.includes(clueId({ round: state.round, category: c, clue: i }))),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function findPlayer(state: GameState, id: string | null): Player | undefined {
  return state.players.find((p) => p.id === id)
}

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
}

function lowestScorer(players: Player[]): string | null {
  if (players.length === 0) return null
  return players.reduce((low, p) => (p.score < low.score ? p : low)).id
}

/** The category and clue on screen: a cell of the board, or the tie-breaker. */
export function clueOf(state: GameState, cur: CurrentClue): { category: string; clue: Clue | Final } | null {
  const board = state.board
  if (cur.id === TIEBREAK_ID) return board?.tiebreaker ? { category: board.tiebreaker.category, clue: board.tiebreaker } : null
  const category = board?.rounds[cur.ref.round]?.categories[cur.ref.category]
  const clue = category?.clues[cur.ref.clue]
  return category && clue ? { category: category.name, clue } : null
}

/** A clue that just went up, waiting for the host to read it. */
function newClue(ref: ClueRef, id: string, value: number, media: Media | undefined): CurrentClue {
  return {
    ref,
    id,
    status: 'reading',
    dailyDouble: false,
    value,
    attempt: 0,
    openSeq: null,
    target: null,
    lockedUntil: {},
    buzzWinner: null,
    lockedOut: [],
    correctPlayer: null,
    ddPlayer: null,
    ddWager: null,
    reveal: blurRevealFor(media, value),
    openedAt: null,
    buzzOrder: [],
    attempts: [],
    photoFinish: null,
    answerEndsAt: null,
  }
}

/** Files the clue on screen into the game's history, for stats and the results export. */
function recordClue(s: GameState, cur: CurrentClue) {
  s.history.push({
    clueId: cur.id,
    round: cur.ref.round,
    category: clueOf(s, cur)?.category ?? '',
    value: cur.value,
    dailyDouble: cur.dailyDouble,
    attempts: cur.attempts,
    photoFinish: cur.photoFinish,
    scoresAfter: Object.fromEntries(s.players.map((p) => [p.id, p.score])),
  })
}

/** Someone is answering: start the answer timer, if the host uses one. */
function startAnswerTimer(s: GameState, cur: CurrentClue, now: number) {
  cur.answerEndsAt = s.settings.answerTimerMs ? now + s.settings.answerTimerMs : null
}

/** How long after the buzzers opened a press reached the host. */
function buzzMs(cur: CurrentClue, now: number): number {
  return Math.max(0, now - (cur.openedAt ?? now))
}

/**
 * A right press on the same opening that reached the host just after the winner's: a photo finish. Phones stop
 * sending once they see someone answering, so these only come from near-simultaneous presses.
 */
function runnerUp(cur: CurrentClue, playerId: string, now: number): boolean {
  if (cur.buzzOrder.length >= 3 || cur.buzzOrder.some((b) => b.playerId === playerId)) return false
  const ms = buzzMs(cur, now)
  const winner = cur.buzzOrder[0]!
  cur.buzzOrder.push({ playerId, ms })
  const gapMs = ms - winner.ms
  if (cur.buzzOrder.length === 2 && (!cur.photoFinish || gapMs < cur.photoFinish.gapMs)) {
    cur.photoFinish = { playerIds: [winner.playerId, playerId], gapMs }
  }
  return true
}

/** A round begins on the board: with the round intro on, its categories start hidden. */
function startRound(s: GameState) {
  s.phase = 'board'
  s.categoriesShown = s.settings.roundIntro ? 0 : null
}

/** Moves on after a round is finished: next round, the final, or the end of the game. */
function advanceRound(s: GameState) {
  s.current = null
  if (s.board && s.round + 1 < s.board.rounds.length) {
    s.round += 1
    startRound(s)
    s.control = lowestScorer(s.players) ?? s.control
  } else if (s.board?.final) {
    startFinal(s)
  } else {
    finishGame(s)
  }
}

/**
 * Ends the game, unless first place is tied (with points) and the board has a tie-breaker that hasn't been
 * played: then the tied players buzz for it (everyone else is locked out) and the game ends after it.
 */
function finishGame(s: GameState) {
  s.current = null
  const top = Math.max(...s.players.map((p) => p.score))
  const tied = s.players.filter((p) => p.score === top).map((p) => p.id)
  const tiebreaker = s.board?.tiebreaker
  if (tiebreaker && !s.tiebreak && tied.length > 1 && top > 0) {
    s.tiebreak = { players: tied, winner: null }
    s.phase = 'clue'
    s.current = newClue({ round: s.round, category: -1, clue: -1 }, TIEBREAK_ID, 0, tiebreaker.media)
    s.current.lockedOut = s.players.filter((p) => !tied.includes(p.id)).map((p) => p.id)
    return
  }
  s.phase = 'game_over'
}

function startFinal(s: GameState) {
  s.current = null
  s.phase = 'final_category'
  s.final = {
    eligible: s.players.filter((p) => p.score > 0).map((p) => p.id),
    wagers: {},
    answers: {},
    answerEndsAt: null,
    order: [],
    index: 0,
    responseShown: false,
    results: {},
  }
}

/** Starts opening buzzers with a new target and an attempt number never used before in this game. */
function openWindow(s: GameState, w: BuzzWindow, target: number) {
  s.buzzRound += 1
  w.status = 'opening'
  w.attempt = s.buzzRound
  w.openSeq = null
  w.target = target
  if (w === s.current) s.current.buzzOrder = []
}

/** The id `buzzers_open` and `buzz` messages use for the buzzers in play: the practice during the intro, or the clue on screen. */
export function buzzWindowId(s: GameState): string | null {
  if (s.phase === 'intro') return s.practice ? PRACTICE_ID : null
  return s.current?.id ?? null
}

function windowFor(s: GameState, id: string): BuzzWindow | null {
  if (id !== buzzWindowId(s)) return null
  return id === PRACTICE_ID ? s.practice : s.current
}

/**
 * A big-button press before the buzzers opened: blocks the player for a moment and, on a clue, costs a share
 * of its value. Messages reach the host in bridge order, so a press seen while still `opening` was sent before
 * the `buzzers_open` message: it is early too.
 *
 * A press seen while `closed` is not: it may have been sent while the buzzers were open and arrived just after
 * the host closed them (or ruled a wrong answer), and nothing tells the two apart. Those are ignored.
 */
function falseStart(s: GameState, w: BuzzWindow, playerId: string, seq: number, now: number): boolean {
  if (w.status !== 'reading' && w.status !== 'opening') return false
  const cur = s.current
  const onClue = w !== s.practice
  if (onClue && (!cur || cur.dailyDouble || s.settings.openMode !== 'host')) return false
  w.lockedUntil[playerId] = now + s.settings.lockoutMs
  if (onClue && cur) {
    const points = falseStartPoints(s.settings, cur.value)
    findPlayer(s, playerId)!.score -= points
    s.falseStarts.push({ clueId: cur.id, playerId, points, seq })
  }
  return true
}

/** The false starts on one clue, in order. */
export function falseStartsOn(s: GameState, id: string): FalseStart[] {
  return s.falseStarts.filter((f) => f.clueId === id).map(({ playerId, points }) => ({ playerId, points }))
}

/**
 * Pure game reducer. Returns the same object when the action does not apply,
 * so callers can cheaply detect no-ops (e.g. a late or duplicate buzz).
 */
export function reduce(state: GameState, action: Action): GameState {
  const s = structuredClone(state)
  const cur = s.current
  const changed = apply(s, cur, action)
  return changed ? s : state
}

function apply(s: GameState, cur: CurrentClue | null, action: Action): boolean {
  switch (action.type) {
    case 'loadBoard':
      if (s.phase !== 'lobby') return false
      s.board = action.board
      s.dailyDoubles = action.dailyDoubles
      return true

    case 'startGame':
      if (s.phase !== 'lobby' || !s.board) return false
      s.settings = normalizeSettings(action.settings)
      if (action.intro) s.phase = 'intro'
      else startRound(s)
      s.falseStarts = []
      s.history = []
      s.tiebreak = null
      s.pause = null
      s.round = 0
      s.used = []
      s.current = null
      s.final = null
      s.control = s.control ?? s.players[0]?.id ?? null
      s.practice = action.intro
        ? { status: 'reading', attempt: 0, openSeq: null, target: null, lockedUntil: {}, openedAt: 0, hits: [] }
        : null
      return true

    case 'openPractice':
      // Allowed at any time, even while still opening: if the `buzzers_open` echo got lost, pressing again is the way out.
      if (s.phase !== 'intro' || !s.practice || !isBuzzTarget(action.target)) return false
      openWindow(s, s.practice, action.target)
      s.practice.hits = []
      return true

    case 'endIntro':
      if (s.phase !== 'intro') return false
      startRound(s)
      s.practice = null
      // Players may have joined during the intro, after startGame found nobody to give control to.
      s.control ??= s.players[0]?.id ?? null
      return true

    case 'resetToLobby':
      s.phase = 'lobby'
      s.round = 0
      s.used = []
      s.current = null
      s.final = null
      s.practice = null
      s.falseStarts = []
      s.history = []
      s.tiebreak = null
      s.categoriesShown = null
      s.pause = null
      s.players.forEach((p) => (p.score = 0))
      return true

    case 'playerJoined': {
      const name = cleanName(action.name)
      if (!name) return false
      const existing = findPlayer(s, action.id)
      if (existing) {
        existing.name = name
        existing.lastSeenAt = action.now
      } else {
        s.players.push({ id: action.id, name, score: 0, lastSeenAt: action.now })
      }
      return true
    }

    case 'playerSeen': {
      const player = findPlayer(s, action.id)
      if (!player) return false
      player.lastSeenAt = action.now
      return true
    }

    case 'removePlayer':
      if (!findPlayer(s, action.id)) return false
      s.players = s.players.filter((p) => p.id !== action.id)
      if (s.control === action.id) s.control = null
      if (s.practice) s.practice.hits = s.practice.hits.filter((h) => h.playerId !== action.id)
      if (cur?.buzzWinner === action.id && cur.status === 'answering' && !cur.dailyDouble) {
        cur.buzzWinner = null
        cur.status = 'closed'
        cur.answerEndsAt = null
      }
      return true

    case 'renamePlayer': {
      const player = findPlayer(s, action.id)
      const name = cleanName(action.name)
      if (!player || !name) return false
      player.name = name
      return true
    }

    case 'adjustScore': {
      const player = findPlayer(s, action.id)
      if (!player || !Number.isFinite(action.delta)) return false
      player.score += Math.round(action.delta)
      return true
    }

    case 'setControl':
      if (action.id !== null && !findPlayer(s, action.id)) return false
      s.control = action.id
      return true

    case 'selectClue': {
      if (s.phase !== 'board' || cur || !s.board || s.categoriesShown !== null || s.pause) return false
      const { ref } = action
      if (ref.round !== s.round) return false
      const clue = s.board.rounds[ref.round]?.categories[ref.category]?.clues[ref.clue]
      const id = clueId(ref)
      if (!clue || s.used.includes(id)) return false
      const dailyDouble = s.dailyDoubles.includes(id)
      s.phase = 'clue'
      s.current = newClue(ref, id, clue.value, clue.media)
      if (dailyDouble) {
        s.current.status = 'dd_wager'
        s.current.dailyDouble = true
        s.current.ddPlayer = findPlayer(s, s.control) ? s.control : null
        // A Daily Double is worth the wager, whenever it's answered.
        if (s.current.reveal) s.current.reveal.shrinkPoints = false
      }
      // Quick draw: no waiting for the host to read, buzzers open with the clue.
      if (!dailyDouble && s.settings.openMode === 'instant' && action.target !== undefined && isBuzzTarget(action.target)) {
        openWindow(s, s.current, action.target)
      }
      return true
    }

    case 'setDdPlayer':
      if (cur?.status !== 'dd_wager' || !findPlayer(s, action.id)) return false
      cur.ddPlayer = action.id
      cur.ddWager = null
      return true

    case 'setDdWager':
      if (cur?.status !== 'dd_wager' || cur.ddPlayer !== action.id || !Number.isFinite(action.amount)) return false
      cur.ddWager = clamp(action.amount, 0, ddMaxWager(s, action.id))
      return true

    case 'showDdClue':
      if (cur?.status !== 'dd_wager' || cur.ddWager === null || !cur.ddPlayer) return false
      cur.value = cur.ddWager
      cur.status = 'answering'
      cur.buzzWinner = cur.ddPlayer
      startAnswerTimer(s, cur, action.now)
      // No buzzers on a Daily Double: the picture sharpens while the player thinks.
      resumeReveal(cur.reveal, action.now)
      return true

    case 'openBuzzers':
      if (!cur || cur.dailyDouble || (cur.status !== 'reading' && cur.status !== 'closed')) return false
      if (!isBuzzTarget(action.target)) return false
      openWindow(s, cur, action.target)
      cur.buzzWinner = null
      return true

    case 'buzzersOpened': {
      const w = windowFor(s, action.clueId)
      if (w?.status !== 'opening' || w.attempt !== action.attempt) return false
      w.status = 'open'
      w.openSeq = action.seq
      if (w === s.practice) {
        s.practice.openedAt = action.now
      } else {
        cur!.openedAt = action.now
        resumeReveal(cur!.reveal, action.now)
      }
      return true
    }

    case 'buzz': {
      const w = windowFor(s, action.clueId)
      const id = action.playerId
      if (!w || !findPlayer(s, id) || (w.lockedUntil[id] ?? 0) > action.now) return false
      const practicing = w === s.practice
      if (practicing ? s.practice!.hits.some((h) => h.playerId === id) : !cur || cur.lockedOut.includes(id)) return false
      const sameOpening = w.attempt === action.attempt && w.openSeq !== null && action.seq > w.openSeq
      const open = w.status === 'open' && sameOpening
      const rightTap = s.settings.buzzStyle === 'button' || action.emoji === w.target
      if (!practicing && cur!.status === 'answering' && sameOpening && rightTap) return runnerUp(cur!, id, action.now)
      if (s.settings.buzzStyle === 'button') {
        if (!open) return falseStart(s, w, id, action.seq, action.now)
      } else if (!open || !rightTap) {
        // Emoji pads stun themselves for early or wrong taps; only right taps ever count here.
        return false
      }
      if (practicing) {
        s.practice!.hits.push({ playerId: id, ms: Math.max(0, action.now - s.practice!.openedAt) })
        return true
      }
      cur!.status = 'answering'
      cur!.buzzWinner = id
      cur!.buzzOrder = [{ playerId: id, ms: buzzMs(cur!, action.now) }]
      startAnswerTimer(s, cur!, action.now)
      pauseReveal(cur!.reveal, action.now)
      // The sooner the buzz, the blurrier the picture and (with shrinkPoints) the more it's worth.
      if (cur!.reveal) cur!.value = revealValue(cur!.reveal, action.now)
      return true
    }

    case 'closeBuzzers':
      if (cur?.status !== 'open' && cur?.status !== 'opening') return false
      cur.status = 'closed'
      cur.answerEndsAt = null
      pauseReveal(cur.reveal, action.now)
      return true

    case 'judge': {
      if (cur?.status !== 'answering' || !cur.buzzWinner) return false
      const player = findPlayer(s, cur.buzzWinner)
      if (!player) return false
      cur.attempts.push({ playerId: player.id, correct: action.correct, ms: cur.dailyDouble ? null : (cur.buzzOrder[0]?.ms ?? null) })
      cur.answerEndsAt = null
      if (action.correct) {
        player.score += cur.value
        cur.correctPlayer = player.id
        if (cur.id === TIEBREAK_ID) s.tiebreak!.winner = player.id
        cur.status = 'revealed'
        s.control = player.id
      } else {
        player.score -= wrongAnswerPoints(s.settings, cur.value, cur.dailyDouble)
        cur.lockedOut.push(player.id)
        cur.buzzWinner = null
        const anyoneLeft = s.players.some((p) => !cur.lockedOut.includes(p.id))
        cur.status = cur.dailyDouble || !anyoneLeft ? 'revealed' : 'closed'
        const reopen = s.settings.openMode === 'instant' && action.target !== undefined && isBuzzTarget(action.target)
        if (cur.status === 'closed' && reopen) openWindow(s, cur, action.target!)
      }
      return true
    }

    case 'revealAnswer':
      if (!cur || cur.status === 'revealed') return false
      cur.status = 'revealed'
      cur.buzzWinner = null
      cur.answerEndsAt = null
      return true

    case 'returnToBoard':
      if (cur?.status !== 'revealed') return false
      recordClue(s, cur)
      if (cur.id === TIEBREAK_ID) {
        s.current = null
        s.phase = 'game_over'
        return true
      }
      s.used.push(cur.id)
      s.current = null
      if (isRoundComplete(s)) advanceRound(s)
      else s.phase = 'board'
      return true

    case 'endRound':
      if ((s.phase !== 'board' && s.phase !== 'clue') || s.tiebreak) return false
      if (cur) {
        recordClue(s, cur)
        s.used.push(cur.id)
      }
      advanceRound(s)
      return true

    case 'startFinal':
      if (!s.board?.final || s.tiebreak || s.phase === 'lobby' || s.phase.startsWith('final') || s.phase === 'game_over') return false
      startFinal(s)
      return true

    case 'openFinalWagers':
      if (s.phase !== 'final_category' || s.pause) return false
      s.phase = 'final_wager'
      return true

    case 'setFinalWager': {
      if (s.phase !== 'final_wager' || !s.final?.eligible.includes(action.id)) return false
      const player = findPlayer(s, action.id)
      if (!player || !Number.isFinite(action.amount)) return false
      s.final.wagers[action.id] = clamp(action.amount, 0, Math.max(0, player.score))
      return true
    }

    case 'showFinalClue':
      if (s.phase !== 'final_wager' || !s.final) return false
      s.phase = 'final_answer'
      s.final.answerEndsAt = action.now + action.durationMs
      return true

    case 'setFinalAnswer': {
      const f = s.final
      if (s.phase !== 'final_answer' || !f?.eligible.includes(action.id)) return false
      if (f.answerEndsAt !== null && action.now > f.answerEndsAt + FINAL_ANSWER_GRACE_MS) return false
      f.answers[action.id] = action.text.trim().slice(0, MAX_FINAL_ANSWER_LENGTH)
      return true
    }

    case 'closeFinalAnswers': {
      const f = s.final
      if (s.phase !== 'final_answer' || !f) return false
      s.phase = 'final_judging'
      f.order = s.players
        .filter((p) => f.eligible.includes(p.id))
        .sort((a, b) => a.score - b.score)
        .map((p) => p.id)
      f.index = 0
      f.responseShown = false
      return true
    }

    case 'showFinalResponse':
      if (s.phase !== 'final_judging' || !s.final || s.final.index >= s.final.order.length) return false
      if (s.final.responseShown) return false
      s.final.responseShown = true
      return true

    case 'judgeFinal': {
      const f = s.final
      if (s.phase !== 'final_judging' || !f || !f.responseShown) return false
      const id = f.order[f.index]
      const player = findPlayer(s, id ?? null)
      if (!id || !player) {
        f.index += 1
        f.responseShown = false
        return true
      }
      const wager = f.wagers[id] ?? 0
      player.score += action.correct ? wager : -wager
      f.results[id] = action.correct
      f.index += 1
      f.responseShown = false
      return true
    }

    case 'showNextCategory': {
      const count = s.board?.rounds[s.round]?.categories.length ?? 0
      if (s.phase !== 'board' || s.categoriesShown === null) return false
      s.categoriesShown = s.categoriesShown + 1 >= count ? null : s.categoriesShown + 1
      return true
    }

    case 'showAllCategories':
      if (s.categoriesShown === null) return false
      s.categoriesShown = null
      return true

    case 'pause':
      // Only between clues, so nobody is mid-buzz.
      if (s.phase !== 'board' && s.phase !== 'final_category') return false
      s.pause = { message: action.message.trim().slice(0, MAX_PAUSE_MESSAGE_LENGTH), until: action.until }
      return true

    case 'resume':
      if (!s.pause) return false
      s.pause = null
      return true

    case 'endGame':
      if (s.phase === 'lobby' || s.phase === 'game_over') return false
      if (cur) recordClue(s, cur)
      // Ending during the tie-breaker skips the rest of it: a shared win.
      finishGame(s)
      return true
  }
}
