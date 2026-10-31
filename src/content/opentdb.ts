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
/** When the last question request came back, shared by every generation (and tab) so a new one waits its turn. */
const LAST_REQUEST_KEY = 'ldtg:opentdbLastRequest'
const CLUES_PER_CATEGORY = 5
const CATEGORIES_PER_ROUND = 5
/** Tries per question request: rate-limit hits, a stale token and a used-up token each cost one. */
const MAX_TRIES = 4
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

export interface InstantResult {
  board: Board
  /** Picked categories that didn't have enough questions and were swapped for random ones. */
  skipped: string[]
}

interface OtdbDeps {
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  storage?: KeyValueStorage | null
  random?: () => number
  now?: () => Date
  /** Called at the start and after each request, for a progress bar. */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/** Stands in for blocked site data, so the token and the request gap still last for this page. */
const memory = new Map<string, string>()
const memoryStorage: KeyValueStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, value),
  removeItem: (key) => void memory.delete(key),
}

/** "Entertainment: Video Games" → "Video Games". */
export function displayName(name: string): string {
  return name.replace(/^[^:]+:\s*/, '')
}

const decode = (text: string) => decodeURIComponent(text)
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 } as const
/** Questions worded around their options ("Which of the following…") can't be answered without them. */
const NEEDS_OPTIONS = /\b(of|among) (the following|these|those)\b/i

/**
 * A question as a clue: decoded, with the wrong options as a host note and a source link. Questions that refer
 * to their options get them in the clue too, in alphabetical order so the right one doesn't stand out.
 */
export function toClue(q: OtdbQuestion, value: number): Clue {
  const question = decode(q.question)
  const answer = decode(q.correct_answer)
  const wrong = q.incorrect_answers.map(decode)
  const options = [answer, ...wrong].sort((a, b) => a.localeCompare(b))
  return {
    value,
    clue: NEEDS_OPTIONS.test(question) ? `${question} (${options.join(' / ')})` : question,
    answer,
    source: 'Open Trivia DB',
    sourceUrl: API,
    notes: `${q.difficulty} · wrong options: ${wrong.join(' / ')}`,
  }
}

/** Five questions as a column: easiest first, worth 200…1000 (× `multiplier`). */
export function toCategory(name: string, questions: OtdbQuestion[], multiplier = 1): Category {
  const sorted = [...questions].sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty])
  return { name, clues: sorted.map((q, i) => toClue(q, (i + 1) * 200 * multiplier)) }
}

function toFinal(category: string, q: OtdbQuestion): Final {
  const { clue, answer, source, sourceUrl, notes } = toClue(q, 0)
  return { category, clue, answer, source, sourceUrl, notes }
}

/** Fisher–Yates: every order equally likely. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

interface QuestionsResponse {
  response_code: number
  results?: OtdbQuestion[]
}

/**
 * Talks to the API. Question requests go one at a time, at least REQUEST_GAP_MS after the previous answer came
 * back (also one from an earlier generation); the token endpoint isn't rate-limited.
 */
class OtdbClient {
  private readonly storage: KeyValueStorage
  private savedToken: string | null
  private readonly now: () => number

  constructor(private readonly deps: OtdbDeps) {
    this.storage = deps.storage ?? memoryStorage
    this.savedToken = this.storage.getItem(TOKEN_KEY)
    const now = deps.now ?? (() => new Date())
    this.now = () => now().getTime()
  }

  private async fetchJson<T>(path: string): Promise<T> {
    if (this.deps.signal?.aborted) throw new Error('Cancelled')
    const response = await this.deps.fetch(`${API}${path}`, { credentials: 'omit', signal: this.deps.signal })
    // Too many requests comes back as HTTP 429 with code 5 in the body.
    if (!response.ok && response.status !== 429) throw new Error(`Open Trivia DB answered ${response.status}`)
    return response.json()
  }

  private async rateLimited(path: string): Promise<QuestionsResponse> {
    const last = Number(this.storage.getItem(LAST_REQUEST_KEY))
    const wait = last ? last + REQUEST_GAP_MS - this.now() : 0
    if (wait > 0) await this.deps.sleep(Math.min(wait, REQUEST_GAP_MS))
    try {
      return await this.fetchJson<QuestionsResponse>(path)
    } finally {
      this.storage.setItem(LAST_REQUEST_KEY, String(this.now()))
    }
  }

  /** The session token, or '' when the API won't hand one out (questions may then repeat). */
  private async token(fresh = false): Promise<string> {
    if (this.savedToken && !fresh) return this.savedToken
    const { response_code: code, token } = await this.fetchJson<{ response_code: number; token?: string }>('/api_token.php?command=request')
    if (code !== 0 || !token) return ''
    this.savedToken = token
    this.storage.setItem(TOKEN_KEY, token)
    return token
  }

  /** `amount` multiple-choice questions, or null when the category doesn't have enough. */
  async questions(category: number, amount: number, difficulty?: 'hard'): Promise<OtdbQuestion[] | null> {
    const query = `/api.php?amount=${amount}&category=${category}&type=multiple&encode=url3986${difficulty ? `&difficulty=${difficulty}` : ''}`
    let token = await this.token()
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const { response_code: code, results = [] } = await this.rateLimited(`${query}${token ? `&token=${token}` : ''}`)
      if (code === 0) return results.length >= amount ? results : null
      // 1: the category is too small even without a token.
      if (code === 1) return null
      // 3: unknown token: start a new session.
      if (code === 3) token = await this.token(true)
      // 4: this token has seen this category: try without it (questions may repeat), keeping it for the others.
      else if (code === 4) token = ''
      // 5: too many requests: the next try waits its turn.
      else if (code !== 5) throw new Error(`Open Trivia DB answered code ${code}`)
    }
    throw new Error('Open Trivia DB is busy, try again in a minute')
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
export async function generateBoard(categories: OtdbCategory[], options: InstantOptions, deps: OtdbDeps): Promise<InstantResult> {
  const client = new OtdbClient(deps)
  const needed = options.rounds * CATEGORIES_PER_ROUND
  // Wanted ones first (no more than the board has room for), then the rest in random order.
  const wanted = (options.categories ?? []).flatMap((id) => categories.filter((c) => c.id === id)).slice(0, needed)
  const queue = [...wanted, ...shuffle(categories.filter((c) => !wanted.includes(c)), deps.random ?? Math.random)]
  const total = needed + (options.final ? 1 : 0)
  let done = 0
  deps.onProgress?.(done, total)
  const progress = () => deps.onProgress?.(++done, total)
  const skipped: string[] = []

  const columns: Category[] = []
  while (columns.length < needed) {
    const category = queue.shift()
    if (!category) throw new Error('Open Trivia DB ran out of categories with enough questions')
    const multiplier = columns.length < CATEGORIES_PER_ROUND ? 1 : 2
    const questions = await client.questions(category.id, CLUES_PER_CATEGORY)
    if (questions) {
      columns.push(toCategory(category.name, questions, multiplier))
      progress()
    } else if (wanted.includes(category)) skipped.push(category.name)
  }

  let final: Final | undefined
  while (options.final && !final) {
    const category = queue.shift()
    if (!category) throw new Error('Open Trivia DB ran out of categories with a hard question for the final')
    const [question] = (await client.questions(category.id, 1, 'hard')) ?? []
    if (question) final = toFinal(category.name, question)
  }
  if (final) progress()

  const date = (deps.now ?? (() => new Date()))()
  const board: Board = {
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
  return { board, skipped }
}
