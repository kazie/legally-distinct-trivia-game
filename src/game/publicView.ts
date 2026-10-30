import type { Clue, Final } from '@/content/schema'
import { clueId, ddMaxWager, falseStartsOn } from './engine'
import { awards, ranking, streaks } from './stats'
import type { BuzzWindow, GameState, PublicCurrentClue, PublicFinal, PublicPractice, PublicState } from './types'

/** A player counts as connected if the host heard from them this recently. */
export const PLAYER_TIMEOUT_MS = 12_000

/** Strips everything players must not see yet (answers, notes, other players' final responses). */
export function toPublicState(state: GameState, now: number): PublicState {
  const board = state.board
  const round = board?.rounds[state.round]
  const streak = streaks(state.history).current

  return {
    roomCode: state.roomCode,
    title: board?.title ?? null,
    hasFinal: !!board?.final,
    phase: state.phase,
    round:
      board && round
        ? {
            index: state.round,
            count: board.rounds.length,
            name: round.name,
            categories: round.categories.map((category, c) => ({
              name: category.name,
              clues: category.clues.map((clue, i) => ({
                value: clue.value,
                used: state.used.includes(clueId({ round: state.round, category: c, clue: i })),
              })),
            })),
          }
        : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      connected: now - p.lastSeenAt < PLAYER_TIMEOUT_MS,
      streak: streak[p.id] ?? 0,
    })),
    control: state.control,
    current: publicCurrent(state),
    final: publicFinal(state),
    practice: publicPractice(state),
    gameOver: state.phase === 'game_over' ? { ranking: ranking(state.players), awards: awards(state) } : null,
    settings: state.settings,
    hostTime: now,
  }
}

/** What only shows with the answer: the answer itself, answer media and the source. */
function answerExtras(item: Clue | Final, revealed: boolean) {
  return {
    answer: revealed ? item.answer : null,
    answerMedia: revealed ? (item.answerMedia ?? null) : null,
    source: revealed ? (item.source ?? null) : null,
    sourceUrl: revealed ? (item.sourceUrl ?? null) : null,
  }
}

/** Players only learn which emoji to tap once buzzers are opening, so nobody can tap early. No emoji for the big button. */
function visibleTarget(state: GameState, w: BuzzWindow): number | null {
  if (state.settings.buzzStyle !== 'emoji') return null
  return w.status === 'opening' || w.status === 'open' ? w.target : null
}

function publicCurrent(state: GameState): PublicCurrentClue | null {
  const cur = state.current
  if (!cur || !state.board) return null
  const category = state.board.rounds[cur.ref.round]?.categories[cur.ref.category]
  const clue = category?.clues[cur.ref.clue]
  if (!category || !clue) return null
  // Quick draw: whoever buzzed answers from memory.
  const quickDrawHidden = state.settings.openMode === 'instant' && cur.status === 'answering' && !cur.dailyDouble
  const hidden = cur.status === 'dd_wager' || quickDrawHidden
  return {
    id: cur.id,
    category: category.name,
    status: cur.status,
    dailyDouble: cur.dailyDouble,
    value: cur.value,
    attempt: cur.attempt,
    target: visibleTarget(state, cur),
    text: hidden ? null : clue.clue,
    media: hidden ? null : (clue.media ?? null),
    reveal: cur.status === 'revealed' ? null : cur.reveal,
    ...answerExtras(clue, cur.status === 'revealed'),
    buzzWinner: cur.buzzWinner,
    lockedOut: cur.lockedOut,
    correctPlayer: cur.correctPlayer,
    ddPlayer: cur.ddPlayer,
    ddMaxWager: cur.dailyDouble ? ddMaxWager(state, cur.ddPlayer) : null,
    lockedUntil: cur.lockedUntil,
    falseStarts: falseStartsOn(state, cur.id),
    buzzOrder: cur.buzzOrder,
    answerEndsAt: cur.answerEndsAt,
  }
}

function publicPractice(state: GameState): PublicPractice | null {
  const p = state.practice
  if (!p || state.phase !== 'intro') return null
  return {
    attempt: p.attempt,
    status: p.status,
    target: visibleTarget(state, p),
    hits: p.hits,
    lockedUntil: p.lockedUntil,
  }
}

function publicFinal(state: GameState): PublicFinal | null {
  const f = state.final
  const final = state.board?.final
  if (!f || !final) return null
  const showClue = state.phase === 'final_answer' || state.phase === 'final_judging' || state.phase === 'game_over'
  const judgingDone = f.index >= f.order.length
  const judgedId = state.phase === 'final_judging' && !judgingDone ? f.order[f.index] : undefined
  return {
    category: final.category,
    clue: showClue ? final.clue : null,
    media: showClue ? (final.media ?? null) : null,
    eligible: f.eligible,
    wagered: Object.keys(f.wagers),
    answered: Object.keys(f.answers),
    answerEndsAt: f.answerEndsAt,
    judging: judgedId
      ? {
          playerId: judgedId,
          response: f.responseShown ? (f.answers[judgedId] ?? '') : null,
          wager: f.responseShown ? (f.wagers[judgedId] ?? 0) : null,
          result: f.results[judgedId] ?? null,
        }
      : null,
    results: f.results,
    ...answerExtras(final, (state.phase === 'final_judging' && judgingDone) || state.phase === 'game_over'),
  }
}
