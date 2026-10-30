// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import sample from '../boards/sample.json'
import App from '@/App.vue'
import { loadDrafts } from '@/content/boards'
import { boardToLink, SHARE_HASH } from '@/content/share'
import { createAppRouter } from '@/router'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

async function openLink(hash: string, answer: boolean) {
  vi.stubGlobal('confirm', vi.fn(() => answer))
  // The editor reads the fragment from the address bar, like a browser that just opened the link.
  window.location.hash = hash
  const router = createAppRouter(createMemoryHistory())
  await router.push(`/editor${hash}`)
  const wrapper = mount(App, { global: { plugins: [router] } })
  // Unpacking runs through compression streams: give them a moment.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 20))
    await flushPromises()
  }
  return { wrapper, router }
}

describe('editor share links', () => {
  it('imports the board in a share link as a draft after asking, and clears the link', async () => {
    const link = await boardToLink({ ...sample, title: 'Shared quiz' }, 'http://x')
    const { wrapper, router } = await openLink(link.slice(link.indexOf(SHARE_HASH)), true)
    expect(confirm).toHaveBeenCalledWith('Import "Shared quiz" as a draft?')
    // The repo already has a board called "sample", so the draft gets a fresh id.
    expect(loadDrafts()).toEqual({ 'sample-2': expect.objectContaining({ id: 'sample-2', title: 'Shared quiz' }) })
    expect(router.currentRoute.value.fullPath).toBe('/editor/sample-2')
    wrapper.unmount()
  })

  it('leaves drafts alone when the user says no, and reports broken links', async () => {
    const link = await boardToLink(sample, 'http://x')
    const declined = await openLink(link.slice(link.indexOf(SHARE_HASH)), false)
    expect(loadDrafts()).toEqual({})
    declined.wrapper.unmount()

    const broken = await openLink(`${SHARE_HASH}garbage`, true)
    expect(broken.wrapper.text()).toContain('Could not import the share link: The link is damaged or incomplete')
    broken.wrapper.unmount()
  })
})
