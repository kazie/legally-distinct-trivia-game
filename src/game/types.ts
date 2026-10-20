import type { Board, Media } from '@/content/schema'
import type { GameSettings } from './settings'

export interface Player {
  id: string
  name: string
  score: number
  /** Host clock time of the last message from this player. */
  lastSeenAt: number
}

export interface ClueRef {
  round: number
  category: number
  clue: number
}

export type Phase =
  | 'lobby'
  | 'intro'
  | 'board'
  | 'clue'
  | 'final_category'
  | 'final_wager'
  | 'final_answer'
  | 'final_judging'
  | 'game_over'

/**
 * Life cycle of the clue on screen:
 * dd_wager → answering (Daily Double), or reading → opening → open → answering → (closed → opening …) → revealed.
 */
export type ClueStatus = 'dd_wager' | 'reading' | 'opening' | 'open' | 'answering' | 'closed' | 'revealed'

/** Buzzers that open with an emoji to tap: the clue on screen, or a practice buzz in the intro. */
export interface BuzzWindow {
  status: ClueStatus
  /** Set from `GameState.buzzRound` every time buzzers (re)open, so stale buzzes can be told apart. */
  attempt: number
  /** Bridge seq of the host's `buzzers_open` message for the current attempt. */
  openSeq: number | null
  /** Index into BUZZ_EMOJIS that players must tap to buzz in this attempt. */
  target: number | null
  /** Host clock time until which a player can't buzz, after a false start. */
  lockedUntil: Record<string, number>
}

export interface FalseStart {
  playerId: string
  /** Points it cost. */
  points: number
}

/** A false start in the game-wide log. */
export interface LoggedFalseStart extends FalseStart {
  clueId: string
  /** Bridge seq of the press: unique, so undo can tell which penalties it already has. */
  seq: number
}

export interface CurrentClue extends BuzzWindow {
  ref: ClueRef
  id: string
  dailyDouble: boolean
  /** Points at stake: the clue value, or the wager for a Daily Double. */
  value: number
  buzzWinner: string | null
  lockedOut: string[]
  /** Who answered correctly, if anyone. */
  correctPlayer: string | null
  ddPlayer: string | null
  ddWager: number | null
}

export interface FinalState {
  eligible: string[]
  wagers: Record<string, number>
  answers: Record<string, string>
  answerEndsAt: number | null
  /** Order the host reveals responses in (lowest score first). */
  order: string[]
  index: number
  responseShown: boolean
  results: Record<string, boolean>
}

/** A practice buzz during the intro: same emoji pad, no points. */
export interface Practice extends BuzzWindow {
  status: 'reading' | 'opening' | 'open'
  /** Host clock time the buzzers opened, for reaction times. */
  openedAt: number
  /** Players who tapped the right emoji, fastest first. */
  hits: PracticeHit[]
}

export interface PracticeHit {
  playerId: string
  ms: number
}

export interface GameState {
  roomCode: string
  board: Board | null
  phase: Phase
  round: number
  /** Ids of used clues, `round-category-clue`. */
  used: string[]
  /** Ids of Daily Double clues (flagged in the board + randomly picked). */
  dailyDoubles: string[]
  players: Player[]
  control: string | null
  current: CurrentClue | null
  final: FinalState | null
  practice: Practice | null
  /** Counts every buzzer opening in the game. Never goes back, not even on undo, so attempts are never reused. */
  buzzRound: number
  settings: GameSettings
  /**
   * Every false start this game, in order. Players were told what it cost them right away, so these
   * penalties survive the host's undo (see `HostController.undo`).
   */
  falseStarts: LoggedFalseStart[]
}

/* ---------- What gets broadcast to players and the board screen (no unrevealed answers) ---------- */

export interface PublicClueCell {
  value: number
  used: boolean
}

export interface PublicCurrentClue {
  id: string
  category: string
  status: ClueStatus
  dailyDouble: boolean
  value: number
  attempt: number
  /** Emoji to tap (index into BUZZ_EMOJIS); only present while buzzers are opening or open. */
  target: number | null
  /** Hidden while a Daily Double wager is pending, and while someone answers in quick draw. */
  text: string | null
  media: Media | null
  /** Only present once revealed. */
  answer: string | null
  buzzWinner: string | null
  lockedOut: string[]
  correctPlayer: string | null
  ddPlayer: string | null
  ddMaxWager: number | null
  lockedUntil: Record<string, number>
  falseStarts: FalseStart[]
}

export interface PublicFinal {
  category: string
  clue: string | null
  eligible: string[]
  wagered: string[]
  answered: string[]
  answerEndsAt: number | null
  judging: {
    playerId: string
    response: string | null
    wager: number | null
    result: boolean | null
  } | null
  results: Record<string, boolean>
  answer: string | null
}

export interface PublicPractice {
  attempt: number
  status: Practice['status']
  /** Only present while buzzers are opening or open. */
  target: number | null
  hits: PracticeHit[]
  lockedUntil: Record<string, number>
}

export interface PublicPlayer {
  id: string
  name: string
  score: number
  connected: boolean
}

export interface PublicState {
  roomCode: string
  title: string | null
  hasFinal: boolean
  phase: Phase
  round: {
    index: number
    count: number
    name: string
    categories: { name: string; clues: PublicClueCell[] }[]
  } | null
  players: PublicPlayer[]
  control: string | null
  current: PublicCurrentClue | null
  final: PublicFinal | null
  practice: PublicPractice | null
  settings: GameSettings
  hostTime: number
}
