/** The emoji players can send to the TV: a fixed list, so no free text ever reaches the screen. */
export const REACTIONS = ['😂', '🔥', '😱', '👏', '🤯', '😬'] as const

/** A player can send one reaction per this long (checked on the phone and again on the TV). */
export const REACTION_INTERVAL_MS = 1000
/** How long a reaction floats on the TV. */
export const REACTION_SHOW_MS = 4000
/** Most reactions on the TV at once; the oldest make way. */
export const MAX_REACTIONS = 30

export interface FloatingReaction {
  /** Unique on this screen, for keys and the float position. */
  id: number
  playerId: string
  emoji: number
  at: number
}
