// @vitest-environment happy-dom
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InstantBoard from '@/components/InstantBoard.vue'
import { loadDrafts, saveDraft, saveNewDraft } from '@/content/boards'
import { CREDIT } from '@/content/opentdb'
import type { Board } from '@/content/schema'

enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const q = (n: number) => ({ difficulty: 'easy', question: `Q${n}`, correct_answer: `A${n}`, incorrect_answers: ['x', 'y', 'z'] })

describe('InstantBoard', () => {
  it('makes a board with the defaults, showing progress, and hands it over', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(input)
      if (url.pathname === '/api_category.php') {
        return Response.json({ trivia_categories: Array.from({ length: 12 }, (_, i) => ({ id: i + 9, name: `Science: Topic ${i}` })) })
      }
      if (url.pathname === '/api_token.php') return Response.json({ response_code: 0, token: 'T' })
      const amount = Number(url.searchParams.get('amount'))
      return Response.json({ response_code: 0, results: Array.from({ length: amount }, (_, i) => q(i)) })
    })
    const ready: Board[] = []
    const w = mount(InstantBoard, { props: { onReady: (board: Board) => void ready.push(board) } })
    await w.find('button').trigger('click')
    await flushPromises()
    // The token isn't rate-limited, so the first category comes right away; the next waits its turn.
    expect(w.find('.progress').text()).toContain('1/11')
    await vi.advanceTimersByTimeAsync(6000)
    expect(w.find('.progress').text()).toContain('2/11')
    await vi.advanceTimersByTimeAsync(80_000)
    const [board] = ready as [Board]
    expect(board.credit).toBe(CREDIT)
    expect(board.rounds).toHaveLength(2)
    expect(board.rounds[0]!.categories[0]!.name).toMatch(/^Topic \d+$/)
    expect(w.find('.progress').exists()).toBe(false)
  })

  it('shows an error when the board cannot be used', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(input)
      if (url.pathname === '/api_category.php') return Response.json({ trivia_categories: Array.from({ length: 12 }, (_, i) => ({ id: i + 9, name: `C${i}` })) })
      if (url.pathname === '/api_token.php') return Response.json({ response_code: 0, token: 'T' })
      return Response.json({ response_code: 0, results: Array.from({ length: Number(url.searchParams.get('amount')) }, (_, i) => q(i)) })
    })
    const w = mount(InstantBoard, {
      props: {
        onReady: () => {
          throw new Error('storage is full')
        },
      },
    })
    await w.find('button').trigger('click')
    await vi.advanceTimersByTimeAsync(80_000)
    expect(w.find('.error').text()).toContain('storage is full')
    expect(w.emitted('update:busy')).toEqual([[true], [false]])
  })
})

describe('saveNewDraft', () => {
  it('never replaces a draft with the same id', () => {
    saveDraft('opentdb-20261030-2105', { id: 'opentdb-20261030-2105', title: 'Mine' })
    expect(saveNewDraft({ title: 'Instant' }, 'opentdb-20261030-2105')).toBe('opentdb-20261030-2105-2')
    expect(loadDrafts()).toMatchObject({ 'opentdb-20261030-2105': { title: 'Mine' }, 'opentdb-20261030-2105-2': { title: 'Instant' } })
  })
})
