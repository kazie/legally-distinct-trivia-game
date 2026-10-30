/** How players buzz: one big button, or tapping the emoji shown on the TV. */
export type BuzzStyle = 'button' | 'emoji'
/** Who opens the buzzers: the host after reading the clue, or nobody (`instant`, "quick draw": open as soon as the clue shows). */
export type OpenMode = 'host' | 'instant'

export interface GameSettings {
  buzzStyle: BuzzStyle
  openMode: OpenMode
  /** Share of the clue value a false start (button pressed before buzzers open) costs. */
  falseStartPenalty: number
  /** How long a false start or a wrong emoji blocks a player. */
  lockoutMs: number
  /** Phones show the emoji to tap too, so remote players watching a delayed stream of the TV aren't behind. */
  emojiOnPhones: boolean
  /** A wrong answer costs the clue's value. Off for kids or casual games; Daily Double and final wagers always count. */
  wrongAnswerPenalty: boolean
  /** Phones show pictures and video too (audio always plays there), for players following the TV over a video call. */
  mediaOnPhones: boolean
  /** Time to answer after buzzing in, shown as a countdown (0 = no timer). The host still judges. */
  answerTimerMs: number
}

export const PENALTY_CHOICES = [0, 0.25, 0.5, 1] as const
export const LOCKOUT_CHOICES = [250, 500, 1000, 2000, 3000] as const
export const ANSWER_TIMER_CHOICES = [0, 5000, 10_000, 15_000, 30_000] as const

export const DEFAULT_SETTINGS: GameSettings = {
  buzzStyle: 'button',
  openMode: 'host',
  falseStartPenalty: 0.5,
  lockoutMs: 1000,
  emojiOnPhones: false,
  wrongAnswerPenalty: true,
  mediaOnPhones: false,
  answerTimerMs: 0,
}

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback)

function pick<T>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? (value as T) : fallback
}

/** Settings from anywhere (storage, an action, an old save): known values kept, anything else replaced by the default. */
export function normalizeSettings(raw: unknown): GameSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_SETTINGS
  return {
    buzzStyle: pick(r.buzzStyle, ['button', 'emoji'] as const, d.buzzStyle),
    openMode: pick(r.openMode, ['host', 'instant'] as const, d.openMode),
    falseStartPenalty: pick(r.falseStartPenalty, PENALTY_CHOICES, d.falseStartPenalty as (typeof PENALTY_CHOICES)[number]),
    lockoutMs: pick(r.lockoutMs, LOCKOUT_CHOICES, d.lockoutMs as (typeof LOCKOUT_CHOICES)[number]),
    emojiOnPhones: flag(r.emojiOnPhones, d.emojiOnPhones),
    wrongAnswerPenalty: flag(r.wrongAnswerPenalty, d.wrongAnswerPenalty),
    mediaOnPhones: flag(r.mediaOnPhones, d.mediaOnPhones),
    answerTimerMs: pick(r.answerTimerMs, ANSWER_TIMER_CHOICES, d.answerTimerMs as (typeof ANSWER_TIMER_CHOICES)[number]),
  }
}

/** Points a false start costs on a clue worth `value`. */
export function falseStartPoints(settings: GameSettings, value: number): number {
  return Math.round(value * settings.falseStartPenalty)
}

/** Points a wrong answer costs. Daily Double wagers are always at stake, like the final round's. */
export function wrongAnswerPoints(settings: GameSettings, value: number, dailyDouble: boolean): number {
  return settings.wrongAnswerPenalty || dailyDouble ? value : 0
}

/** E.g. `1 s`, `0.25 s`. */
export function formatLockout(ms: number): string {
  return `${ms / 1000} s`
}
