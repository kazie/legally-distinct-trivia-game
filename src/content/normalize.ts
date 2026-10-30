/** Text helpers for comparing answers: the giveaway checker now, answer matching later. */

const LEADING_ARTICLE = /^(the|a|an) /

/** Lowercase, no accents or punctuation, single spaces, no leading "the/a/an". "The Beatles!" → "beatles". */
export function normalizeAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(LEADING_ARTICLE, '')
}

const STOPWORDS = new Set([
  'and', 'that', 'this', 'with', 'from', 'what', 'which', 'were', 'they', 'their', 'there', 'have', 'into',
  'about', 'than', 'then', 'when', 'where', 'some', 'also', 'only', 'over', 'under', 'very', 'most', 'many',
])

/** The words of a normalized answer worth looking for elsewhere: 4+ letters and not a common filler word. */
export function significantWords(normalized: string): string[] {
  return [...new Set(normalized.split(' '))].filter((w) => w.length >= 4 && !STOPWORDS.has(w))
}

/** Whether `needle` (already normalized) appears in normalized `haystack` as whole words. */
export function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false
  return ` ${haystack} `.includes(` ${needle} `)
}
