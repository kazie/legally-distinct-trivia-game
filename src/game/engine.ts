import type { Board } from '@/content/schema'
import { isBuzzTarget } from './buzzPad'
import type { ClueRef, CurrentClue, GameState, Player } from './types'

export type Action =
  | { type: 'loadBoard'; board: Board; dailyDoubles: string[] }
  | { type: 'startGame' }
  | { type: 'resetToLobby' }
  | { type: 'playerJoined'; id: string; name: string; now: number }
  | { type: 'playerSeen'; id: string; now: number }
  | { type: 'removePlayer'; id: string }
  | { type: 'renamePlayer'; id: string; name: string }
  | { type: 'adjustScore'; id: string; delta: number }
  | { type: 'setControl'; id: string | null }
  | { type: 'selectClue'; ref: ClueRef }
  | { type: 'setDdPlayer'; id: string }
  | { type: 'setDdWager'; id: string; amount: number }
  | { type: 'showDdClue' }
  | { type: 'openBuzzers'; target: number }
  | { type: 'buzzersOpened'; clueId: string; attempt: number; seq: number }
  | { type: 'buzz'; playerId: string; clueId: string; attempt: number; seq: number; emoji: number }
  | { type: 'closeBuzzers' }
  | { type: 'judge'; correct: boolean }
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

/** Answers that arrive this long after the final timer ran out are still accepted (network slack). */
export const FINAL_ANSWER_GRACE_MS = 2000
export const MAX_NAME_LENGTH = 24
export const MAX_FINAL_ANSWER_LENGTH = 200

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

/** Moves on after a round is finished: next round, the final, or the end of the game. */
function advanceRound(s: GameState) {
  s.current = null
  if (s.board && s.round + 1 < s.board.rounds.length) {
    s.round += 1
    s.phase = 'board'
    s.control = lowestScorer(s.players) ?? s.control
  } else if (s.board?.final) {
    startFinal(s)
  } else {
    s.phase = 'game_over'
  }
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
      s.phase = 'board'
      s.round = 0
      s.used = []
      s.current = null
      s.final = null
      s.control = s.control ?? s.players[0]?.id ?? null
      return true

    case 'resetToLobby':
      s.phase = 'lobby'
      s.round = 0
      s.used = []
      s.current = null
      s.final = null
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
      if (cur?.buzzWinner === action.id && cur.status === 'answering' && !cur.dailyDouble) {
        cur.buzzWinner = null
        cur.status = 'closed'
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
      if (s.phase !== 'board' || cur || !s.board) return false
      const { ref } = action
      if (ref.round !== s.round) return false
      const clue = s.board.rounds[ref.round]?.categories[ref.category]?.clues[ref.clue]
      const id = clueId(ref)
      if (!clue || s.used.includes(id)) return false
      const dailyDouble = s.dailyDoubles.includes(id)
      s.phase = 'clue'
      s.current = {
        ref,
        id,
        status: dailyDouble ? 'dd_wager' : 'reading',
        dailyDouble,
        value: clue.value,
        attempt: 0,
        openSeq: null,
        target: null,
        buzzWinner: null,
        lockedOut: [],
        correctPlayer: null,
        ddPlayer: dailyDouble && findPlayer(s, s.control) ? s.control : null,
        ddWager: null,
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
      return true

    case 'openBuzzers':
      if (!cur || cur.dailyDouble || (cur.status !== 'reading' && cur.status !== 'closed')) return false
      if (!isBuzzTarget(action.target)) return false
      cur.status = 'opening'
      cur.attempt += 1
      cur.openSeq = null
      cur.target = action.target
      cur.buzzWinner = null
      return true

    case 'buzzersOpened':
      if (cur?.status !== 'opening' || cur.id !== action.clueId || cur.attempt !== action.attempt) return false
      cur.status = 'open'
      cur.openSeq = action.seq
      return true

    case 'buzz': {
      if (cur?.status !== 'open' || cur.id !== action.clueId || cur.attempt !== action.attempt) return false
      if (cur.openSeq === null || action.seq <= cur.openSeq) return false
      if (action.emoji !== cur.target) return false
      if (!findPlayer(s, action.playerId) || cur.lockedOut.includes(action.playerId)) return false
      cur.status = 'answering'
      cur.buzzWinner = action.playerId
      return true
    }

    case 'closeBuzzers':
      if (cur?.status !== 'open' && cur?.status !== 'opening') return false
      cur.status = 'closed'
      return true

    case 'judge': {
      if (cur?.status !== 'answering' || !cur.buzzWinner) return false
      const player = findPlayer(s, cur.buzzWinner)
      if (!player) return false
      if (action.correct) {
        player.score += cur.value
        cur.correctPlayer = player.id
        cur.status = 'revealed'
        s.control = player.id
      } else {
        player.score -= cur.value
        cur.lockedOut.push(player.id)
        cur.buzzWinner = null
        const anyoneLeft = s.players.some((p) => !cur.lockedOut.includes(p.id))
        cur.status = cur.dailyDouble || !anyoneLeft ? 'revealed' : 'closed'
      }
      return true
    }

    case 'revealAnswer':
      if (!cur || cur.status === 'revealed') return false
      cur.status = 'revealed'
      cur.buzzWinner = null
      return true

    case 'returnToBoard':
      if (cur?.status !== 'revealed') return false
      s.used.push(cur.id)
      s.current = null
      if (isRoundComplete(s)) advanceRound(s)
      else s.phase = 'board'
      return true

    case 'endRound':
      if (s.phase !== 'board' && s.phase !== 'clue') return false
      if (cur) s.used.push(cur.id)
      advanceRound(s)
      return true

    case 'startFinal':
      if (!s.board?.final || s.phase === 'lobby' || s.phase.startsWith('final') || s.phase === 'game_over') return false
      startFinal(s)
      return true

    case 'openFinalWagers':
      if (s.phase !== 'final_category') return false
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

    case 'endGame':
      if (s.phase === 'lobby' || s.phase === 'game_over') return false
      s.current = null
      s.phase = 'game_over'
      return true
  }
}
