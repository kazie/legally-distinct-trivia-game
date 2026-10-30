import { describe, expect, it } from 'vitest'
import { toCsv } from '@/content/boards'
import { createGame } from '@/game/engine'
import { awards, gameResults, ranking, resultRows, streaks } from '@/game/stats'
import type { ClueResult, GameState } from '@/game/types'

const result = (attempts: [string, boolean, number | null][], extra: Partial<ClueResult> = {}): ClueResult => ({
  clueId: 'x',
  round: 0,
  category: 'C',
  value: 200,
  dailyDouble: false,
  attempts: attempts.map(([playerId, correct, ms]) => ({ playerId, correct, ms })),
  photoFinish: null,
  scoresAfter: {},
  ...extra,
})

function game(scores: Record<string, number>, history: ClueResult[] = []): GameState {
  const s = createGame('ABCD')
  s.players = Object.entries(scores).map(([id, score]) => ({ id, name: id.toUpperCase(), score, lastSeenAt: 0 }))
  s.history = history
  s.phase = 'game_over'
  return s
}

describe('stats', () => {
  it('counts streaks: winning extends yours and ends the others, a wrong answer ends yours, nobody right changes nothing', () => {
    const history = [
      result([['a', true, 100]]),
      result([['a', true, 100]]),
      result([['b', false, 100]]),
      result([['a', true, 100]]),
      result([['b', true, 100]]),
      result([['a', false, 100]]),
      result([['b', true, 100]]),
    ]
    expect(streaks(history)).toEqual({ current: { a: 0, b: 2 }, best: { a: 3, b: 2 } })
  })

  it('ranks by score with shared places for ties', () => {
    expect(ranking(game({ a: 100, b: 300, c: 100, d: -50 }).players)).toEqual([
      { playerId: 'b', rank: 1, score: 300 },
      { playerId: 'a', rank: 2, score: 100 },
      { playerId: 'c', rank: 2, score: 100 },
      { playerId: 'd', rank: 4, score: -50 },
    ])
  })

  it('gives awards only when there is something to give them for', () => {
    expect(awards(game({ a: 0, b: 0 }))).toEqual([])

    const s = game({ a: 1400, b: 200 }, [
      result([['b', false, 300], ['a', true, 500]], { scoresAfter: { a: 200, b: -200 } }),
      result([['a', true, 700]], { photoFinish: { playerIds: ['a', 'b'], gapMs: 40 }, scoresAfter: { a: 400, b: -200 } }),
      result([['a', true, 600]], { scoresAfter: { a: 600, b: -200 } }),
      result([['b', true, null]], { dailyDouble: true, value: 800, scoresAfter: { a: 600, b: 600 } }),
    ])
    s.falseStarts = [{ clueId: 'x', playerId: 'b', points: 100, seq: 1 }]
    s.final = { eligible: ['a', 'b'], wagers: { a: 800, b: 400 }, answers: {}, answerEndsAt: null, order: [], index: 2, responseShown: false, results: { a: true, b: false } }
    expect(awards(s).map((a) => `${a.key} ${a.playerIds.join('+')}: ${a.detail}`)).toEqual([
      'most-correct a: 3 right',
      'fastest a: 0.60 s on average',
      'photo-finish a+b: 0.04 s apart',
      'streak a: 3 in a row',
      'daily-double b: won 800 on a Daily Double',
      'comeback b: climbed 400 from the bottom',
      'false-starts b: 1 false start',
      'final-hero a: won a 800 wager in the final',
    ])
  })

  it('exports one row per player and the whole game', () => {
    const s = game({ a: 300, b: 300 }, [result([['a', true, 250]]), result([['b', true, 500]])])
    expect(resultRows(s)).toEqual([
      { rank: 1, name: 'A', score: 300, correct: 1, wrong: 0, falseStarts: 0, avgBuzzSeconds: 0.25, bestStreak: 1 },
      { rank: 1, name: 'B', score: 300, correct: 1, wrong: 0, falseStarts: 0, avgBuzzSeconds: 0.5, bestStreak: 1 },
    ])
    expect(gameResults(s)).toMatchObject({ history: s.history, playerNames: { a: 'A', b: 'B' }, final: null })
  })

  it('writes CSV that spreadsheets read safely', () => {
    expect(toCsv([['Name', 'Score'], ['Ann, "the brain"', 300], ['=HYPERLINK("x")', -100], [null, 0]])).toBe(
      'Name,Score\r\n"Ann, ""the brain""",300\r\n"\'=HYPERLINK(""x"")",-100\r\n,0\r\n',
    )
  })
})
