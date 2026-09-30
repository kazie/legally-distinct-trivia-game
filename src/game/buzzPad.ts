/** The buzz pad every phone shows: same emojis, same order, for everyone. */
export const BUZZ_EMOJIS = ['🫠', '🧟', '😹', '🤔', '👀', '👻', '😎', '😭', '🦝'] as const

/** How long a player is blocked after tapping the wrong emoji (or tapping before buzzers open). */
export const STUN_MS = 200

/** A reaction time for display, e.g. `0.41 s`. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

export function isBuzzTarget(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < BUZZ_EMOJIS.length
}

/** A random pad index, never the same as the previous attempt's target. */
export function pickBuzzTarget(previous: number | null, random: () => number = Math.random): number {
  const options = BUZZ_EMOJIS.map((_, i) => i).filter((i) => i !== previous)
  return options[Math.floor(random() * options.length)]!
}
