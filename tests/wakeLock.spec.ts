// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '@/composables/useWakeLock'

function fakeWakeLock() {
  const sentinels: { released: boolean; release: () => Promise<void>; addEventListener: () => void }[] = []
  const api = {
    request: vi.fn(async () => {
      const s = { released: false, release: async () => void (s.released = true), addEventListener: () => {} }
      sentinels.push(s)
      return s
    }),
  }
  Object.defineProperty(navigator, 'wakeLock', { value: api, configurable: true })
  return { api, sentinels }
}

function mountWithLock() {
  let lock!: ReturnType<typeof useWakeLock>
  const wrapper = mount(defineComponent(() => ((lock = useWakeLock()), () => h('div'))))
  return { wrapper, lock: () => lock }
}

afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).wakeLock
  document.body.innerHTML = ''
})

describe('useWakeLock', () => {
  it('takes one native lock however often it is enabled, and releases it on unmount', async () => {
    const { api, sentinels } = fakeWakeLock()
    const { wrapper, lock } = mountWithLock()
    await Promise.all([lock().enable(), lock().enable()])
    await lock().enable()
    expect(api.request).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(sentinels.every((s) => s.released)).toBe(true)
  })

  it('falls back to a muted inline video on the page, and removes it on unmount', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { wrapper, lock } = mountWithLock()
    await lock().enable()
    const video = document.querySelector('video')!
    expect(video.muted).toBe(true)
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(play).toHaveBeenCalled()
    wrapper.unmount()
    expect(document.querySelector('video')).toBeNull()
    play.mockRestore()
  })

  it('falls back to the video when the native lock is refused, and re-takes a lock released while visible', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const refused = { request: vi.fn().mockRejectedValue(new Error('NotAllowed')) }
    Object.defineProperty(navigator, 'wakeLock', { value: refused, configurable: true })
    const first = mountWithLock()
    await first.lock().enable()
    expect(play).toHaveBeenCalled()
    first.wrapper.unmount()
    play.mockRestore()

    let onRelease = () => {}
    const api = {
      request: vi.fn(async () => ({ released: false, release: async () => {}, addEventListener: (_: string, fn: () => void) => (onRelease = fn) })),
    }
    Object.defineProperty(navigator, 'wakeLock', { value: api, configurable: true })
    const second = mountWithLock()
    await second.lock().enable()
    onRelease()
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2))
    second.wrapper.unmount()
  })

  it('retries on the next click when the browser refuses', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('NotAllowed')).mockResolvedValue(undefined)
    const { wrapper, lock } = mountWithLock()
    await lock().enable()
    expect(play).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new MouseEvent('click'))
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    // Started now: further clicks don't try again.
    window.dispatchEvent(new MouseEvent('click'))
    await Promise.resolve()
    expect(play).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    play.mockRestore()
  })
})
