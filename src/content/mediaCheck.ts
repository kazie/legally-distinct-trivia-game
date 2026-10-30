import { cluePath, type Board, type Clue, type Final, type Media } from './schema'

export interface MediaItem {
  /** Validation-style path, so the editor can jump to it: `rounds.0.categories.1.clues.2.media`. */
  path: string
  /** Where it is, for people: `Round 1 · Animals · 400 (answer)`. */
  label: string
  media: Media
}

export type MediaStatus = 'ok' | 'broken' | 'timeout'

/** Every clue and answer media in a board, in board order. */
export function collectMedia(board: Board): MediaItem[] {
  const items: MediaItem[] = []
  const add = (path: string, label: string, item: Clue | Final) => {
    if (item.media) items.push({ path: `${path}.media`, label, media: item.media })
    if (item.answerMedia) items.push({ path: `${path}.answerMedia`, label: `${label} (answer)`, media: item.answerMedia })
  }
  board.rounds.forEach((round, r) =>
    round.categories.forEach((category, c) =>
      category.clues.forEach((clue, i) => add(cluePath(r, c, i), `${round.name} · ${category.name} · ${clue.value}`, clue)),
    ),
  )
  if (board.final) add('final', 'Final round', board.final)
  if (board.tiebreaker) add('tiebreaker', 'Tie-breaker', board.tiebreaker)
  return items
}

/**
 * Loads one media file the way the screens will: a picture in full (which also puts it in the browser's cache),
 * audio and video just far enough to read their length.
 */
export function checkMedia(media: Media, timeoutMs = 15_000): Promise<MediaStatus> {
  return new Promise((resolve) => {
    const el = media.type === 'image' ? new Image() : document.createElement(media.type)
    const done = (status: MediaStatus) => {
      clearTimeout(timer)
      el.onload = el.onerror = null
      if (!(el instanceof HTMLImageElement)) el.onloadedmetadata = null
      resolve(status)
    }
    const timer = setTimeout(() => done('timeout'), timeoutMs)
    if (el instanceof HTMLImageElement) {
      el.onload = () => done('ok')
    } else {
      el.preload = 'metadata'
      el.onloadedmetadata = () => done('ok')
    }
    el.onerror = () => done('broken')
    el.src = media.src
  })
}

/** Checks each distinct link once, a few at a time. Results by `src`. */
export async function checkAllMedia(
  media: Media[],
  check: (media: Media) => Promise<MediaStatus> = (m) => checkMedia(m),
  concurrency = 4,
): Promise<Map<string, MediaStatus>> {
  const queue = [...new Map(media.map((m) => [m.src, m])).values()]
  const results = new Map<string, MediaStatus>()
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) results.set(m.src, await check(m))
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return results
}
