import { formatSeconds } from './buzzPad'
import type { Award, ClueResult, GameState, Player, RankedPlayer } from './types'

/** Per-player numbers for the awards and the results export. */
export interface PlayerStats {
  correct: number
  wrong: number
  falseStarts: number
  /** Average time from buzzers opening to their buzz, over the clues they buzzed in on. */
  avgBuzzMs: number | null
  buzzes: number
  bestStreak: number
}

/** Who got a clue right, if anyone. */
const winnerOf = (result: ClueResult) => result.attempts.find((a) => a.correct)?.playerId ?? null

/**
 * Clues won in a row, now and at best. Winning a clue extends your streak and ends everyone else's (on an
 * all-play clue, everyone right wins it); a wrong answer ends yours. Clues nobody got don't change anything.
 */
export function streaks(history: ClueResult[]): { current: Record<string, number>; best: Record<string, number> } {
  const current: Record<string, number> = {}
  const best: Record<string, number> = {}
  for (const result of history) {
    const winners = new Set(result.attempts.filter((a) => a.correct).map((a) => a.playerId))
    for (const a of result.attempts) if (!a.correct) current[a.playerId] = 0
    if (!winners.size) continue
    for (const id of Object.keys(current)) if (!winners.has(id)) current[id] = 0
    for (const id of winners) {
      current[id] = (current[id] ?? 0) + 1
      best[id] = Math.max(best[id] ?? 0, current[id])
    }
  }
  return { current, best }
}

/** Highest score first; tied players share a rank, except that the tie-breaker winner beats those tied with them. */
export function ranking(players: Player[], tiebreakWinner: string | null = null): RankedPlayer[] {
  const ahead = (a: Player, b: Player) => a.score > b.score || (a.score === b.score && a.id === tiebreakWinner && b.id !== tiebreakWinner)
  return [...players]
    .sort((a, b) => (ahead(a, b) ? -1 : ahead(b, a) ? 1 : 0))
    .map((p) => ({ playerId: p.id, rank: 1 + players.filter((o) => ahead(o, p)).length, score: p.score }))
}

export function playerStats(state: GameState): Record<string, PlayerStats> {
  const { best } = streaks(state.history)
  const stats: Record<string, PlayerStats> = {}
  const buzzTimes: Record<string, number[]> = {}
  for (const p of state.players) {
    stats[p.id] = { correct: 0, wrong: 0, falseStarts: 0, avgBuzzMs: null, buzzes: 0, bestStreak: best[p.id] ?? 0 }
    buzzTimes[p.id] = []
  }
  for (const a of state.history.flatMap((r) => r.attempts)) {
    const st = stats[a.playerId]
    if (!st) continue
    if (a.correct) st.correct++
    else st.wrong++
    if (a.ms !== null) buzzTimes[a.playerId]!.push(a.ms)
  }
  for (const f of state.falseStarts) if (stats[f.playerId]) stats[f.playerId]!.falseStarts++
  for (const [id, times] of Object.entries(buzzTimes)) {
    stats[id]!.buzzes = times.length
    if (times.length) stats[id]!.avgBuzzMs = times.reduce((sum, ms) => sum + ms, 0) / times.length
  }
  return stats
}

/** The players with the best `score` (higher is better), or nobody when no one qualifies. */
function leaders(ids: string[], score: (id: string) => number | null): { ids: string[]; value: number } | null {
  const scored = ids.flatMap((id) => {
    const value = score(id)
    return value === null ? [] : [{ id, value }]
  })
  if (!scored.length) return null
  const top = Math.max(...scored.map((s) => s.value))
  return { ids: scored.filter((s) => s.value === top).map((s) => s.id), value: top }
}

/** Fun awards for the end of the game; each only appears when there's something to give it for. */
export function awards(state: GameState): Award[] {
  const ids = state.players.map((p) => p.id)
  const stats = playerStats(state)
  const list: Award[] = []
  const add = (key: string, emoji: string, title: string, best: { ids: string[]; value: number } | null, detail: (v: number) => string) => {
    if (best) list.push({ key, emoji, title, playerIds: best.ids, detail: detail(best.value) })
  }

  add('most-correct', '🧠', 'Know-it-all', leaders(ids, (id) => stats[id]!.correct || null), (n) => `${n} right`)
  add(
    'fastest',
    '⚡',
    'Fastest finger',
    // Lower is better: negate, and only for players with a few buzzes.
    leaders(ids, (id) => (stats[id]!.buzzes >= 2 ? -stats[id]!.avgBuzzMs! : null)),
    (v) => `${formatSeconds(-v)} on average`,
  )
  const photo = state.history.flatMap((r) => (r.photoFinish ? [r.photoFinish] : [])).sort((a, b) => a.gapMs - b.gapMs)[0]
  if (photo) {
    list.push({ key: 'photo-finish', emoji: '📸', title: 'Photo finish', playerIds: photo.playerIds, detail: `${formatSeconds(photo.gapMs)} apart` })
  }
  add('streak', '🔥', 'On fire', leaders(ids, (id) => (stats[id]!.bestStreak >= 3 ? stats[id]!.bestStreak : null)), (n) => `${n} in a row`)
  const ddWins = state.history.filter((r) => r.dailyDouble && winnerOf(r))
  add(
    'daily-double',
    '🎲',
    'High roller',
    leaders(ids, (id) => Math.max(0, ...ddWins.filter((r) => winnerOf(r) === id).map((r) => r.value)) || null),
    (v) => `won ${v} on a Daily Double`,
  )
  add(
    'comeback',
    '🚀',
    'Comeback',
    leaders(ids, (id) => {
      const low = Math.min(0, ...state.history.map((r) => r.scoresAfter[id] ?? 0))
      const score = state.players.find((p) => p.id === id)!.score
      return low < 0 && score > low ? score - low : null
    }),
    (v) => `climbed ${v} from the bottom`,
  )
  add('false-starts', '🏃', 'Jumped the gun', leaders(ids, (id) => stats[id]!.falseStarts || null), (n) => `${n} false start${n === 1 ? '' : 's'}`)
  const f = state.final
  add(
    'final-hero',
    '🦸',
    'Final hero',
    leaders(ids, (id) => (f?.results[id] && f.wagers[id] ? f.wagers[id]! : null)),
    (v) => `won a ${v} wager in the final`,
  )
  return list
}

/** One row per player for the results export, best first. */
export function resultRows(state: GameState) {
  const stats = playerStats(state)
  return ranking(state.players, state.tiebreak?.winner).map((r) => {
    const st = stats[r.playerId]!
    return {
      rank: r.rank,
      name: state.players.find((p) => p.id === r.playerId)!.name,
      score: r.score,
      correct: st.correct,
      wrong: st.wrong,
      falseStarts: st.falseStarts,
      avgBuzzSeconds: st.avgBuzzMs === null ? null : Math.round(st.avgBuzzMs) / 1000,
      bestStreak: st.bestStreak,
    }
  })
}

/** Everything about a finished game, for the JSON download. */
export function gameResults(state: GameState) {
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? id
  return {
    board: state.board?.title ?? null,
    players: resultRows(state),
    awards: awards(state).map((a) => ({ ...a, players: a.playerIds.map(nameOf) })),
    history: state.history,
    final: state.final && {
      wagers: state.final.wagers,
      answers: state.final.answers,
      results: state.final.results,
    },
    playerNames: Object.fromEntries(state.players.map((p) => [p.id, p.name])),
  }
}
