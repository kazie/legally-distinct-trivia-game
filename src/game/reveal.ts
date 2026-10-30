import { DEFAULT_REVEAL_SECONDS, type Media } from '@/content/schema'

/** A picture that sharpens while buzzers are open. Times are host clock. */
export interface BlurReveal {
  seconds: number
  shrinkPoints: boolean
  /** The clue's full value, which `shrinkPoints` counts down from. */
  baseValue: number
  /** Buzzer-open time already used up by earlier openings. */
  elapsedMs: number
  /** When the current opening started; null while paused. */
  runningSince: number | null
}

/** The reveal a clue's media asks for, ready to run (paused at the start). */
export function blurRevealFor(media: Media | undefined, baseValue: number): BlurReveal | null {
  const reveal = media?.type === 'image' ? media.reveal : undefined
  if (!reveal) return null
  return {
    seconds: reveal.seconds ?? DEFAULT_REVEAL_SECONDS,
    shrinkPoints: !!reveal.shrinkPoints,
    baseValue,
    elapsedMs: 0,
    runningSince: null,
  }
}

/** How sharp the picture is: 0 fully blurred, 1 sharp. */
export function revealProgress(r: BlurReveal, now: number): number {
  const ms = r.elapsedMs + (r.runningSince === null ? 0 : Math.max(0, now - r.runningSince))
  return Math.min(1, ms / (r.seconds * 1000))
}

/** What a buzz right now is worth: with `shrinkPoints`, from the full value down to half once the picture is sharp. */
export function revealValue(r: BlurReveal, now: number): number {
  return r.shrinkPoints ? Math.round(r.baseValue * (1 - revealProgress(r, now) / 2)) : r.baseValue
}

/** What the clue on screen is worth at host time `now`: its value drops while a shrinking reveal sharpens. */
export function liveClueValue(clue: { value: number; reveal: BlurReveal | null }, now: number): number {
  return clue.reveal?.shrinkPoints ? revealValue(clue.reveal, now) : clue.value
}

export function resumeReveal(r: BlurReveal | null, now: number): void {
  if (r && r.runningSince === null) r.runningSince = now
}

export function pauseReveal(r: BlurReveal | null, now: number): void {
  if (!r || r.runningSince === null) return
  r.elapsedMs += Math.max(0, now - r.runningSince)
  r.runningSince = null
}
