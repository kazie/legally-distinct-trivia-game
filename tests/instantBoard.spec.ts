// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InstantBoard from '@/components/InstantBoard.vue'
import { CREDIT } from '@/content/opentdb'
import type { Board } from '@/content/schema'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
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
    const w = mount(InstantBoard)
    await w.find('button').trigger('click')
    await flushPromises()
    expect(w.find('.progress').text()).toContain('0/11')
    await vi.advanceTimersByTimeAsync(6000)
    expect(w.find('.progress').text()).toMatch(/[12]\/11/)
    await vi.advanceTimersByTimeAsync(80_000)
    const [[board]] = w.emitted('ready') as [[Board]]
    expect(board.credit).toBe(CREDIT)
    expect(board.rounds).toHaveLength(2)
    expect(board.rounds[0]!.categories[0]!.name).toMatch(/^Topic \d+$/)
    expect(w.find('.progress').exists()).toBe(false)
  })
})
