/**
 * Instant boards from Open Trivia DB (https://opentdb.com, questions under CC BY-SA 4.0). The API sends
 * `access-control-allow-origin: *`, so the browser calls it directly. It allows one request per 5 seconds per
 * IP, so requests go one after another with a gap, and a session token (kept in storage) avoids repeating
 * questions across games.
 */
import type { KeyValueStorage } from '@/game/hostController'
import type { Board, Category, Clue, Final } from './schema'

const API = 'https://opentdb.com'
export const REQUEST_GAP_MS = 5200
export const TOKEN_KEY = 'ldtg:opentdbToken'
export const CLUES_PER_CATEGORY = 5
export const CATEGORIES_PER_ROUND = 5
export const CREDIT = 'Questions from Open Trivia DB (opentdb.com), CC BY-SA 4.0'

export interface OtdbCategory {
  id: number
  /** Without prefixes like "Entertainment: ". */
  name: string
}

/** One question as the API sends it with `encode=url3986`. */
export interface OtdbQuestion {
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  correct_answer: string
  incorrect_answers: string[]
}

export interface InstantOptions {
  rounds: 1 | 2
  /** Category ids to use first; random ones fill the rest (and replace any without enough questions). */
  categories?: number[]
  final: boolean
}

export interface OtdbDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  storage?: KeyValueStorage | null
  random?: () => number
  now?: () => Date
  /** Called after each request, for a progress bar. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** "Entertainment: Video Games" → "Video Games". */
export function displayName(name: string): string {
  return name.replace(/^[^:]+:\s*/, '')
}

const decode = (text: string) => decodeURIComponent(text)
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const

/** A question as a clue: decoded, with the wrong options as a host note and a source link. */
export function toClue(q: OtdbQuestion, value: number): Clue {
  return {
    value,
    clue: decode(q.question),
    answer: decode(q.correct_answer),
    source: 'Open Trivia DB',
    sourceUrl: API,
    notes: `${q.difficulty} · wrong options: ${q.incorrect_answers.map(decode).join(' / ')}`,
  }
}

/** Five questions as a column: easiest first, worth 200…1000 (× `multiplier`). */
export function toCategory(name: string, questions: OtdbQuestion[], multiplier = 1): Category {
  const sorted = [...questions].sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
  return { name, clues: sorted.map((q, i) => toClue(q, (i + 1) * 200 * multiplier)) }
}

export function toFinal(category: string, q: OtdbQuestion): Final {
  const { clue, answer, source, sourceUrl, notes } = toClue(q, 0)
  return { category, clue, answer, source, sourceUrl, notes }
}

/** Talks to the API: one request at a time, at least REQUEST_GAP_MS apart, with a session token. */
class OtdbClient {
  private lastRequestAt: number | null = null
  constructor(private readonly deps: OtdbDeps) {}

  async get<T>(path: string): Promise<T & { response_code?: number }> {
    if (this.lastRequestAt !== null) {
      const wait = this.lastRequestAt + REQUEST_GAP_MS - Date.now()
      if (wait > 0) await this.deps.sleep(wait)
    }
    if (this.deps.signal?.aborted) throw new Error('Cancelled')
    this.lastRequestAt = Date.now()
    const response = await this.deps.fetch(`${API}${path}`, { credentials: 'omit', signal: this.deps.signal })
    if (!response.ok) throw new Error(`Open Trivia DB answered ${response.status}`)
    return response.json()
  }

  async token(fresh = false): Promise<string> {
    const saved = fresh ? null : this.deps.storage?.getItem(TOKEN_KEY)
    if (saved) return saved
    const { token } = await this.get<{ token: string }>('/api_token.php?command=request')
    this.deps.storage?.setItem(TOKEN_KEY, token)
    return token
  }

  /** `amount` multiple-choice questions, or null when the category doesn't have enough. */
  async questions(category: number, amount: number, difficulty?: 'hard'): Promise<OtdbQuestion[] | null> {
    const query = `/api.php?amount=${amount}&category=${category}&type=multiple&encode=url3986${difficulty ? `&difficulty=${difficulty}` : ''}`
    let token = await this.token()
    for (let attempt = 0; attempt < 3; attempt++) {
      const { response_code: code, results } = await this.get<{ results: OtdbQuestion[] }>(`${query}${token ? `&token=${token}` : ''}`)
      if (code === 0 && results.length >= amount) return results
      // 3: unknown token, 4: this token has seen every question: start a new session.
      if (code === 3 || code === 4) token = await this.token(true)
      // 1: too few questions left for this token: try without it (questions may repeat), then give up.
      else if (code === 1 && token) token = ''
      else if (code === 1) return null
      // 5: too many requests: the next try waits its turn anyway.
      else if (code !== 5) throw new Error(`Open Trivia DB answered code ${code}`)
    }
    return null
  }
}

export async function fetchCategories(deps: Pick<OtdbDeps, 'fetch'>): Promise<OtdbCategory[]> {
  const response = await deps.fetch(`${API}/api_category.php`, { credentials: 'omit' })
  if (!response.ok) throw new Error(`Open Trivia DB answered ${response.status}`)
  const { trivia_categories } = (await response.json()) as { trivia_categories: OtdbCategory[] }
  return trivia_categories.map((c) => ({ id: c.id, name: displayName(c.name) }))
}

/** `2026-10-30 21:05` → `opentdb-20261030-2105`. */
function boardId(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `opentdb-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

/**
 * A ready-to-play board: `rounds` × 5 categories of 5 questions (round 2 worth double), plus a hard final
 * question from another category. Categories without enough questions are swapped for random others.
 */
export async function generateBoard(categories: OtdbCategory[], options: InstantOptions, deps: OtdbDeps): Promise<Board> {
  const random = deps.random ?? Math.random
  const client = new OtdbClient(deps)
  // Wanted ones first, then the rest in random order.
  const wanted = (options.categories ?? []).flatMap((id) => categories.filter((c) => c.id === id))
  const rest = categories.filter((c) => !wanted.includes(c)).sort(() => random() - 0.5)
  const queue = [...wanted, ...rest]
  const needed = options.rounds * CATEGORIES_PER_ROUND
  const total = needed + (options.final ? 1 : 0)
  let done = 0
  const progress = () => deps.onProgress?.(++done, total)

  const columns: Category[] = []
  while (columns.length < needed) {
    const category = queue.shift()
    if (!category) throw new Error('Open Trivia DB ran out of categories with enough questions')
    const multiplier = columns.length < CATEGORIES_PER_ROUND ? 1 : 2
    const questions = await client.questions(category.id, CLUES_PER_CATEGORY)
    if (questions) {
      columns.push(toCategory(category.name, questions, multiplier))
      progress()
    }
  }

  let final: Final | undefined
  while (options.final && !final) {
    const category = queue.shift()
    if (!category) break
    const [question] = (await client.questions(category.id, 1, 'hard')) ?? []
    if (question) final = toFinal(category.name, question)
  }
  if (options.final) progress()

  const date = (deps.now ?? (() => new Date()))()
  return {
    id: boardId(date),
    title: `Open Trivia DB · ${date.toLocaleDateString()}`,
    credit: CREDIT,
    rounds: Array.from({ length: options.rounds }, (_, r) => ({
      name: `Round ${r + 1}`,
      randomDailyDoubles: r + 1,
      categories: columns.slice(r * CATEGORIES_PER_ROUND, (r + 1) * CATEGORIES_PER_ROUND),
    })),
    ...(final ? { final } : {}),
  }
}
