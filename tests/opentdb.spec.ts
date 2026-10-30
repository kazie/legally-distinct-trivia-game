import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '@/dev/fakeBridge'
import {
  CREDIT,
  displayName,
  fetchCategories,
  generateBoard,
  REQUEST_GAP_MS,
  toCategory,
  toClue,
  TOKEN_KEY,
  type OtdbCategory,
  type OtdbQuestion,
} from '@/content/opentdb'
import { validateBoard } from '@/content/schema'

const enc = encodeURIComponent
const question = (n: number, difficulty: OtdbQuestion['difficulty'] = 'easy'): OtdbQuestion => ({
  difficulty,
  question: enc(`Question ${n}: what's "this"?`),
  correct_answer: enc(`Answer ${n}`),
  incorrect_answers: [enc('Wrong & one'), enc('Wrong two'), enc('Wrong three')],
})
const five = (base: number) => (['hard', 'easy', 'medium', 'easy', 'hard'] as const).map((d, i) => question(base + i, d))

const CATEGORIES: OtdbCategory[] = Array.from({ length: 14 }, (_, i) => ({ id: 9 + i, name: `Cat ${9 + i}` }))

/** A fake API: `answer` decides the response per request; every request and sleep is recorded. */
function fakeApi(answer: (url: URL) => unknown) {
  const urls: URL[] = []
  const sleeps: number[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    expect(init?.credentials).toBe('omit')
    const url = new URL(String(input))
    urls.push(url)
    return new Response(JSON.stringify(answer(url)))
  }) as typeof globalThis.fetch
  const sleep = async (ms: number) => void sleeps.push(ms)
  return { urls, sleeps, deps: { fetch, sleep, storage: new MemoryStorage(), random: () => 0.5, now: () => new Date(2026, 9, 30, 21, 5) } }
}

const questionsFor = (url: URL) => {
  const amount = Number(url.searchParams.get('amount'))
  const category = Number(url.searchParams.get('category'))
  return { response_code: 0, results: amount === 1 ? [question(category * 100, 'hard')] : five(category * 100) }
}

describe('Open Trivia DB mapping', () => {
  it('decodes questions into clues with the wrong options as a host note', () => {
    expect(toClue(question(1), 400)).toEqual({
      value: 400,
      clue: 'Question 1: what\'s "this"?',
      answer: 'Answer 1',
      source: 'Open Trivia DB',
      sourceUrl: 'https://opentdb.com',
      notes: 'easy · wrong options: Wrong & one / Wrong two / Wrong three',
    })
  })

  it('orders a category from easy to hard, worth 200–1000 or double', () => {
    const category = toCategory('Film', five(0), 2)
    expect(category.clues.map((c) => [c.value, c.notes!.split(' ')[0]])).toEqual([
      [400, 'easy'],
      [800, 'easy'],
      [1200, 'medium'],
      [1600, 'hard'],
      [2000, 'hard'],
    ])
  })

  it('drops category prefixes', async () => {
    expect(displayName('Entertainment: Video Games')).toBe('Video Games')
    expect(displayName('General Knowledge')).toBe('General Knowledge')
    const { deps } = fakeApi(() => ({ trivia_categories: [{ id: 15, name: 'Entertainment: Video Games' }] }))
    expect(await fetchCategories(deps)).toEqual([{ id: 15, name: 'Video Games' }])
  })
})

describe('generateBoard', () => {
  it('builds a valid two-round board with a final, one request at a time and 5 seconds apart', async () => {
    const api = fakeApi((url) => (url.pathname === '/api_token.php' ? { response_code: 0, token: 'T1' } : questionsFor(url)))
    const progress: number[] = []
    const board = await generateBoard(CATEGORIES, { rounds: 2, final: true, categories: [20] }, { ...api.deps, onProgress: (done) => progress.push(done) })

    const result = validateBoard(board)
    expect(result.ok ? [] : result.issues).toEqual([])
    expect(board).toMatchObject({ id: 'opentdb-20261030-2105', credit: CREDIT })
    expect(board.rounds.map((r) => r.categories.length)).toEqual([5, 5])
    // The picked category comes first; round 2 is worth double.
    expect(board.rounds[0]!.categories[0]!.name).toBe('Cat 20')
    expect(board.rounds[1]!.categories[0]!.clues.map((c) => c.value)).toEqual([400, 800, 1200, 1600, 2000])
    expect(board.final).toMatchObject({ source: 'Open Trivia DB' })
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])

    // Token, 10 categories and the final, every one after the first waiting its turn.
    expect(api.urls).toHaveLength(12)
    expect(api.sleeps).toHaveLength(11)
    expect(api.sleeps.every((ms) => ms > REQUEST_GAP_MS - 200 && ms <= REQUEST_GAP_MS)).toBe(true)
    expect(api.urls.slice(1).every((u) => u.searchParams.get('token') === 'T1' && u.searchParams.get('encode') === 'url3986')).toBe(true)
    expect(api.deps.storage.getItem(TOKEN_KEY)).toBe('T1')
  })

  it('retries without the token when a category runs short, then skips it for another', async () => {
    const api = fakeApi((url) => {
      const category = Number(url.searchParams.get('category'))
      // Category 9 has too few questions left for this token, but enough without it. Category 10 has too few at all.
      if (category === 9 && url.searchParams.has('token')) return { response_code: 1, results: [] }
      if (category === 10) return { response_code: 1, results: [] }
      return questionsFor(url)
    })
    api.deps.storage.setItem(TOKEN_KEY, 'OLD')
    const board = await generateBoard(CATEGORIES, { rounds: 1, final: false, categories: [9, 10] }, api.deps)
    expect(board.rounds[0]!.categories.map((c) => c.name)).toContain('Cat 9')
    expect(board.rounds[0]!.categories.map((c) => c.name)).not.toContain('Cat 10')
    expect(board.rounds[0]!.categories).toHaveLength(5)
    expect(board.final).toBeUndefined()
  })

  it('gets a new token when the old one is unknown or used up', async () => {
    let tokens = 0
    const api = fakeApi((url) => {
      if (url.pathname === '/api_token.php') return { response_code: 0, token: `NEW${++tokens}` }
      if (url.searchParams.get('token') === 'STALE') return { response_code: 4, results: [] }
      return questionsFor(url)
    })
    api.deps.storage.setItem(TOKEN_KEY, 'STALE')
    await generateBoard(CATEGORIES, { rounds: 1, final: false }, api.deps)
    expect(api.deps.storage.getItem(TOKEN_KEY)).toBe('NEW1')
    expect(api.urls.filter((u) => u.searchParams.get('token') === 'NEW1')).toHaveLength(5)
  })

  it('gives up with a clear message when the API is unhappy', async () => {
    const api = fakeApi(() => ({ response_code: 2, results: [] }))
    api.deps.storage.setItem(TOKEN_KEY, 'T')
    await expect(generateBoard(CATEGORIES, { rounds: 1, final: false }, api.deps)).rejects.toThrow('code 2')
  })
})
