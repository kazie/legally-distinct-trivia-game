import { describe, expect, it } from 'vitest'
import { validateBoard, type Board } from '@/content/schema'
import { ANSWER_GRACE_MS, createGame, pickDailyDoubles, reduce, type Action } from '@/game/engine'
import { toPublicState } from '@/game/publicView'
import type { GameSettings } from '@/game/settings'
import type { GameState } from '@/game/types'

const board: Board = {
  id: 'kinds',
  title: 'Kinds',
  rounds: [
    {
      name: 'R1',
      randomDailyDoubles: 1,
      categories: [
        {
          name: 'Mixed',
          clues: [
            { value: 100, clue: 'buzz', answer: 'B' },
            { value: 200, clue: 'Ship that sank in 1912', answer: 'Titanic', kind: 'allPlay', acceptedAnswers: ['RMS Titanic'], seconds: 10 },
            { value: 300, clue: 'Keys on a piano', answer: '88', kind: 'closest', number: 88 },
          ],
        },
      ],
    },
  ],
}
const ALL_PLAY = { round: 0, category: 0, clue: 1 }
const CLOSEST = { round: 0, category: 0, clue: 2 }

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reduce, state)
}

function started(settings: Partial<GameSettings> = {}): GameState {
  return run(
    createGame('ABCD'),
    { type: 'loadBoard', board, dailyDoubles: [] },
    ...['Ann', 'Bob', 'Cid'].map((name, i): Action => ({ type: 'playerJoined', id: `p${i + 1}`, name, now: 0 })),
    { type: 'startGame', settings: { roundIntro: false, ...settings } },
  )
}

const answer = (s: GameState, id: string, value: string | number, now: number) =>
  reduce(s, { type: 'setClueAnswer', id, clueId: s.current!.id, ...(typeof value === 'number' ? { number: value } : { text: value }), now })
const scores = (s: GameState) => s.players.map((p) => p.score)

describe('board schema: clue kinds', () => {
  it('needs a number on closest clues, and keeps Daily Doubles on buzzer clues', () => {
    expect(validateBoard(board).ok).toBe(true)
    const bad = structuredClone(board)
    delete bad.rounds[0]!.categories[0]!.clues[2]!.number
    bad.rounds[0]!.categories[0]!.clues[1]!.dailyDouble = true
    const result = validateBoard(bad)
    expect(result.ok ? [] : result.issues.map((i) => i.path).sort()).toEqual([
      'rounds.0.categories.0.clues.1.dailyDouble',
      'rounds.0.categories.0.clues.2.number',
    ])
  })

  it('never picks an all-play or closest clue as a random Daily Double', () => {
    // The only buzzer clue is in the top row, where random Daily Doubles never go: nothing qualifies.
    for (let i = 0; i < 20; i++) expect(pickDailyDoubles(board, Math.random)).toEqual([])
  })
})

describe('all-play clues', () => {
  it('collects answers until the deadline, pre-ticks exact matches and scores every right one', () => {
    let s = reduce(started(), { type: 'selectClue', ref: ALL_PLAY })
    expect(s.current).toMatchObject({ kind: 'allPlay', status: 'reading' })
    expect(reduce(s, { type: 'openBuzzers', target: 0 })).toBe(s)
    expect(answer(s, 'p1', 'early', 0)).toBe(s)

    s = reduce(s, { type: 'openAnswers', now: 1000 })
    expect(s.current!.answerEndsAt).toBe(11_000)
    s = answer(s, 'p2', 'titanik', 3000)
    s = answer(s, 'p1', ' rms titanic! ', 4000)
    s = answer(s, 'p3', 'Lusitania', 5000)
    expect(answer(s, 'p3', 'Titanic', 11_000 + ANSWER_GRACE_MS + 1)).toBe(s)
    // Nobody sees the others' answers while they're open.
    expect(toPublicState(s, 0).current).toMatchObject({ answered: ['p2', 'p1', 'p3'], results: null })

    s = reduce(s, { type: 'closeAnswers' })
    expect(s.current).toMatchObject({ status: 'judging', marks: { p1: true, p2: false, p3: false } })
    s = run(s, { type: 'markAnswer', id: 'p2', correct: true }, { type: 'finishJudging' })
    expect(s.current!.status).toBe('revealed')
    expect(scores(s)).toEqual([200, 200, 0])
    // Bob answered right first.
    expect(s.control).toBe('p2')
    expect(toPublicState(s, 0).current!.results).toEqual([
      { playerId: 'p2', text: 'titanik', number: null, correct: true },
      { playerId: 'p1', text: 'rms titanic!', number: null, correct: true },
      { playerId: 'p3', text: 'Lusitania', number: null, correct: false },
    ])
    s = reduce(s, { type: 'returnToBoard' })
    expect(s.history[0]!.attempts.map((a) => [a.playerId, a.correct, a.ms])).toEqual([
      ['p2', true, null],
      ['p1', true, null],
      ['p3', false, null],
    ])
  })

  it('never opens buzzers, even in quick draw', () => {
    const s = reduce(started({ openMode: 'instant' }), { type: 'selectClue', ref: ALL_PLAY, target: 2 })
    expect(s.current).toMatchObject({ status: 'reading', attempt: 0 })
    expect(reduce(s, { type: 'buzz', playerId: 'p1', clueId: s.current!.id, attempt: 0, seq: 1, now: 0 })).toBe(s)
  })
})

describe('closest clues', () => {
  it('scores the closest guess right away, ties share, and the earliest winner gets control', () => {
    let s = run(started(), { type: 'selectClue', ref: CLOSEST }, { type: 'openAnswers', now: 0 })
    expect(s.current!.answerEndsAt).toBe(20_000)
    expect(answer(s, 'p1', Number.NaN, 1)).toBe(s)
    s = answer(s, 'p1', 92, 3000)
    s = answer(s, 'p2', 84, 2000)
    s = answer(s, 'p3', 120, 1000)
    s = reduce(s, { type: 'closeAnswers' })
    expect(s.current!.status).toBe('revealed')
    expect(scores(s)).toEqual([300, 300, 0])
    expect(s.control).toBe('p2')
    expect(toPublicState(s, 0).current).toMatchObject({ number: 88, answer: '88' })
  })

  it('reveals with nobody scoring when nobody guessed', () => {
    const s = run(started(), { type: 'selectClue', ref: CLOSEST }, { type: 'openAnswers', now: 0 }, { type: 'closeAnswers' })
    expect(s.current!.status).toBe('revealed')
    expect(scores(s)).toEqual([0, 0, 0])
  })
})
