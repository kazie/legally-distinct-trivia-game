/**
 * Ready-made game states for stories: each one is built by running real engine actions,
 * so they stay valid when the engine changes.
 */
import sample from '../../boards/sample.json'
import { BoardSchema } from '@/content/schema'
import { createGame, PRACTICE_ID, reduce, type Action } from '@/game/engine'
import type { GameState } from '@/game/types'

export const DEMO_ROOM = 'DEMO'
export const board = BoardSchema.parse(sample)

export const PLAYERS = [
  { id: 'p-ann', name: 'Ann' },
  { id: 'p-bob', name: 'Bob' },
  { id: 'p-cid', name: 'Cid' },
] as const
export const [ANN, BOB, CID] = PLAYERS.map((p) => p.id) as [string, string, string]

export interface Scenario {
  state: GameState
  /** Actions the story's host performs once running (things that need the bridge, like opening buzzers). */
  live?: Action[]
}

function run(state: GameState, actions: Action[]): GameState {
  return actions.reduce(reduce, state)
}

function lobby(players = true, b = board): GameState {
  const now = Date.now()
  return run(createGame(DEMO_ROOM), [
    { type: 'loadBoard', board: b, dailyDoubles: ['0-1-3', '1-1-2', '1-3-4'] },
    ...(players ? PLAYERS.map((p): Action => ({ type: 'playerJoined', id: p.id, name: p.name, now })) : []),
  ])
}

function midRound(b = board): GameState {
  const s = run(lobby(true, b), [{ type: 'startGame' }])
  // A few clues already played.
  s.used = ['0-0-0', '0-0-1', '0-1-0', '0-2-0', '0-2-1', '0-3-0', '0-4-0', '0-4-2']
  s.players[0]!.score = 1400
  s.players[1]!.score = 600
  s.players[2]!.score = -200
  s.control = ANN
  return s
}

function intro(): GameState {
  return run(lobby(), [{ type: 'startGame', intro: true }])
}

function practiceResults(): GameState {
  const openedAt = Date.now()
  return run(intro(), [
    { type: 'openPractice', target: DEMO_TARGET },
    { type: 'buzzersOpened', clueId: PRACTICE_ID, attempt: 1, seq: 1, now: openedAt },
    { type: 'buzz', playerId: ANN, clueId: PRACTICE_ID, attempt: 1, seq: 2, emoji: DEMO_TARGET, now: openedAt + 410 },
    { type: 'buzz', playerId: CID, clueId: PRACTICE_ID, attempt: 1, seq: 3, emoji: DEMO_TARGET, now: openedAt + 630 },
  ])
}

const CLUE = { round: 0, category: 2, clue: 2 } // Food & Drink, 600
const CLUE_ID = '0-2-2'
/** The emoji (index into BUZZ_EMOJIS) players must tap in the scenarios. */
export const DEMO_TARGET = 2

function clue(): GameState {
  return run(midRound(), [{ type: 'selectClue', ref: CLUE }])
}

/** A short-ish Commons recording (MP3 transcode, so it plays in every browser). */
export const DEMO_AUDIO =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Mozart_-_Eine_kleine_Nachtmusik_-_1._Allegro.ogg/Mozart_-_Eine_kleine_Nachtmusik_-_1._Allegro.ogg.mp3'

/** The sample board has no audio, so this copy swaps one into Food & Drink, 800. */
const AUDIO_CLUE = { round: 0, category: 2, clue: 3 }
const audioBoard = (() => {
  const b = structuredClone(board)
  b.rounds[AUDIO_CLUE.round]!.categories[AUDIO_CLUE.category]!.clues[AUDIO_CLUE.clue] = {
    value: 800,
    clue: 'Name the composer of this little night music',
    answer: 'Wolfgang Amadeus Mozart',
    media: { type: 'audio', src: DEMO_AUDIO },
  }
  return BoardSchema.parse(b)
})()

function audioClue(): GameState {
  return run(midRound(audioBoard), [{ type: 'selectClue', ref: AUDIO_CLUE }])
}

/** The clue, in a game where phones show the emoji to tap too (for players on a video call). */
function clueEmojiOnPhones(): GameState {
  return run(lobby(), [{ type: 'startGame', emojiOnPhones: true }, { type: 'selectClue', ref: CLUE }])
}

function answering(by = BOB): GameState {
  return run(clue(), [
    { type: 'openBuzzers', target: DEMO_TARGET },
    { type: 'buzzersOpened', clueId: CLUE_ID, attempt: 1, seq: 1, now: 0 },
    { type: 'buzz', playerId: by, clueId: CLUE_ID, attempt: 1, seq: 2, emoji: DEMO_TARGET, now: 0 },
  ])
}

function final(): GameState {
  return run(midRound(), [{ type: 'startFinal' }])
}

function finalAnswer(): GameState {
  return run(final(), [
    { type: 'openFinalWagers' },
    { type: 'setFinalWager', id: ANN, amount: 1000 },
    { type: 'setFinalWager', id: BOB, amount: 600 },
    { type: 'showFinalClue', now: Date.now(), durationMs: 30_000 },
  ])
}

export const scenarios = {
  'Lobby (empty)': () => ({ state: lobby(false) }),
  Lobby: () => ({ state: lobby() }),
  Intro: () => ({ state: intro() }),
  'Intro: practice open': () => ({ state: intro(), live: [{ type: 'openPractice', target: DEMO_TARGET }] }),
  'Intro: practice results': () => ({ state: practiceResults() }),
  Board: () => ({ state: midRound() }),
  'Clue: reading': () => ({ state: clue() }),
  'Clue: buzzers open': () => ({ state: clue(), live: [{ type: 'openBuzzers', target: DEMO_TARGET }] }),
  'Clue: buzzers open, emoji on phones': () => ({
    state: clueEmojiOnPhones(),
    live: [{ type: 'openBuzzers', target: DEMO_TARGET }],
  }),
  'Clue: audio': () => ({ state: audioClue() }),
  'Clue: Bob answering': () => ({ state: answering(BOB) }),
  'Clue: Ann answering': () => ({ state: answering(ANN) }),
  'Clue: Bob was wrong': () => ({ state: run(answering(BOB), [{ type: 'judge', correct: false }]) }),
  'Clue: revealed': () => ({ state: run(answering(ANN), [{ type: 'judge', correct: true }]) }),
  'Daily Double: wager': () => ({
    state: run(midRound(), [{ type: 'selectClue', ref: { round: 0, category: 1, clue: 3 } }]),
  }),
  'Daily Double: answering': () => ({
    state: run(midRound(), [
      { type: 'selectClue', ref: { round: 0, category: 1, clue: 3 } },
      { type: 'setDdWager', id: ANN, amount: 1000 },
      { type: 'showDdClue' },
    ]),
  }),
  'Round 2': () => ({ state: run(midRound(), [{ type: 'endRound' }]) }),
  'Final: category': () => ({ state: final() }),
  'Final: wagers': () => ({
    state: run(final(), [{ type: 'openFinalWagers' }, { type: 'setFinalWager', id: BOB, amount: 300 }]),
  }),
  'Final: answering': () => ({
    state: run(finalAnswer(), [{ type: 'setFinalAnswer', id: BOB, text: 'Nobel', now: Date.now() }]),
  }),
  'Final: judging': () => ({
    state: run(finalAnswer(), [
      { type: 'setFinalAnswer', id: ANN, text: 'Alfred Nobel', now: Date.now() },
      { type: 'setFinalAnswer', id: BOB, text: 'Edison?', now: Date.now() },
      { type: 'closeFinalAnswers' },
      { type: 'showFinalResponse' },
    ]),
  }),
  'Game over': () => ({ state: run(midRound(), [{ type: 'endGame' }]) }),
} satisfies Record<string, () => Scenario>

export type ScenarioName = keyof typeof scenarios
export const scenarioNames = Object.keys(scenarios) as ScenarioName[]
