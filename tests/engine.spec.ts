import { describe, expect, it } from 'vitest'
import type { Board } from '@/content/schema'
import { clueId, createGame, ddMaxWager, pickDailyDoubles, PRACTICE_ID, reduce, type Action } from '@/game/engine'
import { BUZZ_EMOJIS, pickBuzzTarget } from '@/game/buzzPad'
import { toPublicState } from '@/game/publicView'
import type { GameState } from '@/game/types'

const board: Board = {
  id: 'test',
  title: 'Test',
  rounds: [
    {
      name: 'R1',
      categories: [
        { name: 'A', clues: [{ value: 100, clue: 'a1', answer: 'A1' }, { value: 200, clue: 'a2', answer: 'A2', dailyDouble: true }] },
        { name: 'B', clues: [{ value: 100, clue: 'b1', answer: 'B1' }, { value: 200, clue: 'b2', answer: 'B2' }] },
      ],
    },
    { name: 'R2', categories: [{ name: 'C', clues: [{ value: 500, clue: 'c1', answer: 'C1' }] }] },
  ],
  final: { category: 'Fin', clue: 'final clue', answer: 'FINAL' },
}

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reduce, state)
}

function started(intro = false): GameState {
  return run(
    createGame('ABCD'),
    { type: 'loadBoard', board, dailyDoubles: pickDailyDoubles(board) },
    { type: 'playerJoined', id: 'p1', name: ' Ann  ', now: 0 },
    { type: 'playerJoined', id: 'p2', name: 'Bob', now: 0 },
    { type: 'playerJoined', id: 'p3', name: 'Cid', now: 0 },
    { type: 'startGame', intro },
  )
}

const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score

/** The emoji every test opens buzzers with, unless it says otherwise. */
const T = 4

/** Opens buzzers for the current clue as if the host's message came back with `seq`. */
function open(s: GameState, seq: number, target = T): GameState {
  s = reduce(s, { type: 'openBuzzers', target })
  return reduce(s, { type: 'buzzersOpened', clueId: s.current!.id, attempt: s.current!.attempt, seq, now: 0 })
}

describe('engine', () => {
  it('starts a game with players and gives control to the first player', () => {
    const s = started()
    expect(s.phase).toBe('board')
    expect(s.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cid'])
    expect(s.control).toBe('p1')
    expect(s.dailyDoubles).toEqual(['0-0-1'])
  })

  it('returns the same object for actions that do not apply', () => {
    const s = started()
    expect(reduce(s, { type: 'judge', correct: true })).toBe(s)
    expect(reduce(s, { type: 'selectClue', ref: { round: 1, category: 0, clue: 0 } })).toBe(s)
  })

  it('plays a clue: wrong answer locks out and reopens, correct answer scores and takes control', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })
    expect(s.current!.status).toBe('reading')
    s = open(s, 10)
    s = run(
      s,
      { type: 'buzz', playerId: 'p2', clueId: '0-1-0', attempt: 1, seq: 11, emoji: T, now: 0 },
      { type: 'buzz', playerId: 'p3', clueId: '0-1-0', attempt: 1, seq: 12, emoji: T, now: 0 },
    )
    expect(s.current!.buzzWinner).toBe('p2')
    s = reduce(s, { type: 'judge', correct: false })
    expect(score(s, 'p2')).toBe(-100)
    expect(s.current!.status).toBe('closed')
    s = open(s, 20)
    expect(s.current!.attempt).toBe(2)
    // p2 is locked out; a buzz from the previous attempt is stale.
    s = run(
      s,
      { type: 'buzz', playerId: 'p2', clueId: '0-1-0', attempt: 2, seq: 21, emoji: T, now: 0 },
      { type: 'buzz', playerId: 'p1', clueId: '0-1-0', attempt: 1, seq: 22, emoji: T, now: 0 },
      { type: 'buzz', playerId: 'p3', clueId: '0-1-0', attempt: 2, seq: 23, emoji: T, now: 0 },
    )
    expect(s.current!.buzzWinner).toBe('p3')
    s = reduce(s, { type: 'judge', correct: true })
    expect(score(s, 'p3')).toBe(100)
    expect(s.control).toBe('p3')
    expect(s.current!.status).toBe('revealed')
    s = reduce(s, { type: 'returnToBoard' })
    expect(s.phase).toBe('board')
    expect(s.used).toEqual(['0-1-0'])
    expect(reduce(s, { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })).toBe(s)
  })

  it('reveals automatically when everyone has answered wrong', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })
    for (const [i, id] of ['p1', 'p2', 'p3'].entries()) {
      s = open(s, i * 10 + 1)
      s = reduce(s, { type: 'buzz', playerId: id, clueId: '0-1-0', attempt: i + 1, seq: i * 10 + 2, emoji: T, now: 0 })
      s = reduce(s, { type: 'judge', correct: false })
    }
    expect(s.current!.status).toBe('revealed')
  })

  it('only accepts buzzes with the target emoji', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    s = open(s, 10, 7)
    expect(s.current!.target).toBe(7)
    expect(reduce(s, { type: 'buzz', playerId: 'p1', clueId: '0-0-0', attempt: 1, seq: 11, emoji: 6, now: 0 })).toBe(s)
    s = reduce(s, { type: 'buzz', playerId: 'p2', clueId: '0-0-0', attempt: 1, seq: 12, emoji: 7, now: 0 })
    expect(s.current!.buzzWinner).toBe('p2')
  })

  it('rejects an invalid target and picks a new one per attempt', () => {
    const s = run(started(), { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })
    expect(s.current!.target).toBeNull()
    for (const target of [-1, 9, 1.5]) expect(reduce(s, { type: 'openBuzzers', target })).toBe(s)
    let next = open(s, 10, 3)
    next = run(next, { type: 'buzz', playerId: 'p1', clueId: '0-1-0', attempt: 1, seq: 11, emoji: 3, now: 0 }, { type: 'judge', correct: false })
    next = open(next, 20, 5)
    expect(next.current!.target).toBe(5)
  })

  it('only shows the target to players while buzzers are opening or open', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })
    s = reduce(s, { type: 'openBuzzers', target: 2 })
    expect(toPublicState(s, 0).current!.target).toBe(2)
    s = reduce(s, { type: 'buzzersOpened', clueId: '0-1-0', attempt: 1, seq: 1, now: 0 })
    expect(toPublicState(s, 0).current!.target).toBe(2)
    s = reduce(s, { type: 'buzz', playerId: 'p1', clueId: '0-1-0', attempt: 1, seq: 2, emoji: 2, now: 0 })
    expect(toPublicState(s, 0).current!.target).toBeNull()
    s = reduce(s, { type: 'judge', correct: false })
    expect(toPublicState(s, 0).current!.target).toBeNull()
  })

  it('picks a buzz target that differs from the previous one', () => {
    for (let prev = 0; prev < BUZZ_EMOJIS.length; prev++) {
      for (const r of [0, 0.5, 0.999]) {
        const t = pickBuzzTarget(prev, () => r)
        expect(t).not.toBe(prev)
        expect(t).toBeGreaterThanOrEqual(0)
        expect(t).toBeLessThan(BUZZ_EMOJIS.length)
      }
    }
  })

  it('ignores buzzes with a seq not after the open message', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    s = open(s, 50)
    expect(reduce(s, { type: 'buzz', playerId: 'p1', clueId: '0-0-0', attempt: 1, seq: 49, emoji: T, now: 0 })).toBe(s)
  })

  it('plays a Daily Double for the player in control with a clamped wager', () => {
    let s = started()
    s.players[0]!.score = 50
    s = reduce(s, { type: 'selectClue', ref: { round: 0, category: 0, clue: 1 } })
    expect(s.current!.status).toBe('dd_wager')
    expect(s.current!.ddPlayer).toBe('p1')
    expect(toPublicState(s, 0).current!.text).toBeNull()
    expect(ddMaxWager(s, 'p1')).toBe(200)
    expect(reduce(s, { type: 'setDdWager', id: 'p2', amount: 100 })).toBe(s)
    s = run(s, { type: 'setDdWager', id: 'p1', amount: 99999 }, { type: 'showDdClue' })
    expect(s.current!.value).toBe(200)
    expect(s.current!.buzzWinner).toBe('p1')
    expect(reduce(s, { type: 'openBuzzers', target: T })).toBe(s)
    s = reduce(s, { type: 'judge', correct: false })
    expect(score(s, 'p1')).toBe(-150)
    expect(s.current!.status).toBe('revealed')
  })

  it('moves through rounds into the final and scores wagers', () => {
    let s = started()
    s = reduce(s, { type: 'endRound' })
    expect(s.round).toBe(1)
    s = run(s, { type: 'selectClue', ref: { round: 1, category: 0, clue: 0 } })
    s = open(s, 1)
    s = run(
      s,
      { type: 'buzz', playerId: 'p1', clueId: clueId({ round: 1, category: 0, clue: 0 }), attempt: 1, seq: 2, emoji: T, now: 0 },
      { type: 'judge', correct: true },
      { type: 'adjustScore', id: 'p2', delta: 300 },
      { type: 'returnToBoard' },
    )
    expect(s.phase).toBe('final_category')
    expect(s.final!.eligible).toEqual(['p1', 'p2'])
    s = run(
      s,
      { type: 'openFinalWagers' },
      { type: 'setFinalWager', id: 'p1', amount: 1000 },
      { type: 'setFinalWager', id: 'p2', amount: 100 },
      { type: 'setFinalWager', id: 'p3', amount: 100 },
      { type: 'showFinalClue', now: 1000, durationMs: 30_000 },
      { type: 'setFinalAnswer', id: 'p1', text: 'final', now: 2000 },
      { type: 'setFinalAnswer', id: 'p2', text: 'too late', now: 40_000 },
      { type: 'closeFinalAnswers' },
    )
    expect(s.final!.wagers).toEqual({ p1: 500, p2: 100 })
    expect(s.final!.answers).toEqual({ p1: 'final' })
    expect(s.final!.order).toEqual(['p2', 'p1'])
    let pub = toPublicState(s, 0).final!
    expect(pub.answer).toBeNull()
    expect(pub.judging).toEqual({ playerId: 'p2', response: null, wager: null, result: null })
    expect(reduce(s, { type: 'judgeFinal', correct: true })).toBe(s)
    s = run(s, { type: 'showFinalResponse' }, { type: 'judgeFinal', correct: false })
    s = run(s, { type: 'showFinalResponse' })
    expect(toPublicState(s, 0).final!.judging!.response).toBe('final')
    s = run(s, { type: 'judgeFinal', correct: true })
    expect(score(s, 'p1')).toBe(1000)
    expect(score(s, 'p2')).toBe(200)
    pub = toPublicState(s, 0).final!
    expect(pub.answer).toBe('FINAL')
    s = reduce(s, { type: 'endGame' })
    expect(s.phase).toBe('game_over')
  })

  it('never exposes the answer before it is revealed', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    expect(JSON.stringify(toPublicState(s, 0))).not.toContain('A1')
    s = reduce(s, { type: 'revealAnswer' })
    expect(toPublicState(s, 0).current!.answer).toBe('A1')
  })
})

describe('intro practice', () => {
  /** Opens a practice buzz as if the host's message came back with `seq` at host time `now`. */
  function openPractice(s: GameState, seq: number, now: number, target = T): GameState {
    s = reduce(s, { type: 'openPractice', target })
    return reduce(s, { type: 'buzzersOpened', clueId: PRACTICE_ID, attempt: s.practice!.attempt, seq, now })
  }
  const tap = (s: GameState, playerId: string, seq: number, now: number, emoji = T, attempt = s.practice!.attempt) =>
    reduce(s, { type: 'buzz', playerId, clueId: PRACTICE_ID, attempt, seq, emoji, now })

  it('starts in the intro only when asked', () => {
    expect(started().phase).toBe('board')
    expect(started().practice).toBeNull()
    const s = started(true)
    expect(s.phase).toBe('intro')
    expect(s.practice).toMatchObject({ attempt: 0, status: 'reading', hits: [] })
  })

  it('only opens a practice during the intro with a valid target', () => {
    const board = started()
    expect(reduce(board, { type: 'openPractice', target: T })).toBe(board)
    const s = started(true)
    expect(reduce(s, { type: 'openPractice', target: BUZZ_EMOJIS.length })).toBe(s)
    expect(reduce(s, { type: 'openPractice', target: T }).practice).toMatchObject({ status: 'opening', attempt: 1, target: T })
  })

  it('ranks players who tap the right emoji, once each, with reaction times', () => {
    let s = openPractice(started(true), 10, 1000)
    expect(s.practice!.status).toBe('open')
    s = tap(s, 'p2', 11, 1300)
    s = tap(s, 'p1', 12, 1450)
    expect(tap(s, 'p2', 13, 1500)).toBe(s)
    expect(s.practice!.hits).toEqual([
      { playerId: 'p2', ms: 300 },
      { playerId: 'p1', ms: 450 },
    ])
    expect(toPublicState(s, 0).practice).toMatchObject({ status: 'open', target: T, hits: s.practice!.hits })
    expect(s.players.every((p) => p.score === 0)).toBe(true)
    s = reduce(s, { type: 'removePlayer', id: 'p2' })
    expect(s.practice!.hits).toEqual([{ playerId: 'p1', ms: 450 }])
  })

  it('ignores wrong emojis, stale attempts and buzzes sent before the open message', () => {
    let s = openPractice(started(true), 10, 1000)
    expect(tap(s, 'p1', 11, 1100, T + 1)).toBe(s)
    expect(tap(s, 'p1', 9, 1100)).toBe(s)
    expect(tap(s, 'nobody', 11, 1100)).toBe(s)
    s = openPractice(s, 20, 2000, 1)
    expect(s.practice!.hits).toEqual([])
    expect(tap(s, 'p1', 21, 2100, 1, 1)).toBe(s)
  })

  it('numbers attempts game-wide, and a practice stuck opening can be reopened', () => {
    let s = openPractice(started(true), 10, 1000)
    expect(s.practice!.attempt).toBe(1)
    // The echo for attempt 2 never arrives (e.g. the bridge was down), so the host presses again.
    s = run(s, { type: 'openPractice', target: 1 }, { type: 'openPractice', target: 2 })
    expect(s.practice).toMatchObject({ status: 'opening', attempt: 3, target: 2 })
    expect(reduce(s, { type: 'buzzersOpened', clueId: PRACTICE_ID, attempt: 2, seq: 20, now: 0 })).toBe(s)
    s = reduce(s, { type: 'buzzersOpened', clueId: PRACTICE_ID, attempt: 3, seq: 21, now: 0 })
    expect(s.practice!.status).toBe('open')
    s = run(s, { type: 'endIntro' }, { type: 'selectClue', ref: { round: 0, category: 1, clue: 0 } })
    expect(open(s, 30).current!.attempt).toBe(4)
  })

  it('gives control to the first player when they only joined during the intro', () => {
    let s = run(createGame('ABCD'), { type: 'loadBoard', board, dailyDoubles: [] }, { type: 'startGame', intro: true })
    expect(s.control).toBeNull()
    s = run(s, { type: 'playerJoined', id: 'p1', name: 'Ann', now: 0 }, { type: 'endIntro' })
    expect(s.control).toBe('p1')
  })

  it('ends the intro on the board and clears practice on reset', () => {
    let s = openPractice(started(true), 10, 1000)
    s = reduce(s, { type: 'endIntro' })
    expect(s.phase).toBe('board')
    expect(s.practice).toBeNull()
    expect(toPublicState(s, 0).practice).toBeNull()
    s = run(started(true), { type: 'resetToLobby' })
    expect(s.phase).toBe('lobby')
    expect(s.practice).toBeNull()
  })
})
