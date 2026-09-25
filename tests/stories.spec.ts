// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import StoryPlayer from '@/dev/StoryPlayer.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, DEMO_ROOM, scenarioNames, type ScenarioName } from '@/dev/scenarios'
import { createAppRouter } from '@/router'
import BoardView from '@/views/BoardView.vue'
import HostView from '@/views/HostView.vue'

const wrappers: { unmount(): void }[] = []
afterEach(() => wrappers.splice(0).forEach((w) => w.unmount()))

async function render(scenario: ScenarioName, inner: () => ReturnType<typeof h>[], headlessHost = true) {
  const Root = defineComponent(() => () => h(StoryRoom, { scenario, headlessHost }, { default: inner }))
  const wrapper = mount(Root, { global: { plugins: [createAppRouter(createMemoryHistory())] } })
  wrappers.push(wrapper)
  await settle()
  return wrapper
}

const settle = async (ms = 80) => {
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

describe('story harness renders real screens', () => {
  it.each(scenarioNames)('%s renders on board, host and phone', async (name) => {
    const w = await render(
      name,
      () => [h(HostView, { room: DEMO_ROOM }), h(BoardView, { room: DEMO_ROOM }), h(StoryPlayer, { playerId: ANN })],
      false,
    )
    expect(w.text()).not.toContain('Waiting for host of room')
    expect(w.text()).not.toContain('Joining as')
  })

  it('shows the buzz winner on the board and phones', async () => {
    const w = await render('Clue: buzzers open', () => [
      h(BoardView, { room: DEMO_ROOM }),
      h('div', { class: 'ann' }, [h(StoryPlayer, { playerId: ANN })]),
      h('div', { class: 'bob' }, [h(StoryPlayer, { playerId: BOB })]),
    ])
    const buzz = w.find('.bob button.buzz')
    expect(buzz.text()).toBe('BUZZ!')
    await buzz.trigger('pointerdown')
    await settle()
    expect(w.find('.banner').text()).toContain('Bob')
    expect(w.find('.ann .answering').text()).toContain('Bob')
    expect(w.find('.bob .answering').text()).toContain("YOU'RE UP!")
  })

  it('lets the host judge from the control panel', async () => {
    const w = await render('Clue: Bob answering', () => [h(HostView, { room: DEMO_ROOM }), h(StoryPlayer, { playerId: BOB })], false)
    const correct = w.findAll('button').find((b) => b.text().startsWith('Correct'))!
    await correct.trigger('click')
    await settle()
    expect(w.text()).toContain('Bob got it.')
  })
})
