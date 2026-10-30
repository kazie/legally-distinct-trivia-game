import { containsWords, normalizeAnswer } from '@/content/normalize'

/** How a typed answer compares to the right ones: a hint for the host, who still decides. */
export type AnswerMatch = 'exact' | 'close' | 'no'

/** Edits (insert, delete, replace a letter) to turn `a` into `b`. */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = row
  }
  return previous[b.length]!
}

/**
 * Same after normalizing ("the Beatles!" = "Beatles") is exact. A small typo (up to 1 edit, or 20% of the
 * answer's length) or the whole answer inside a longer one ("I think it's Mars") is close.
 */
export function matchAnswer(typed: string, answers: string[]): AnswerMatch {
  const t = normalizeAnswer(typed)
  if (!t) return 'no'
  let close = false
  for (const answer of answers.map(normalizeAnswer).filter(Boolean)) {
    if (t === answer) return 'exact'
    close ||= levenshtein(t, answer) <= Math.max(1, Math.floor(answer.length * 0.2)) || containsWords(t, answer)
  }
  return close ? 'close' : 'no'
}

/** The answer and the extra ones the board accepts. */
export function allAnswers(item: { answer: string; acceptedAnswers?: string[] }): string[] {
  return [item.answer, ...(item.acceptedAnswers ?? [])]
}
