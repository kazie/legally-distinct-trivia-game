// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import StoryPlayer from '@/dev/StoryPlayer.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, DEMO_AUDIO, DEMO_ROOM, DEMO_TARGET, scenarioNames, type ScenarioName } from '@/dev/scenarios'
import { BUZZ_EMOJIS, STUN_MS } from '@/game/buzzPad'
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
    expect(w.find('.target-emoji').text()).toBe(BUZZ_EMOJIS[DEMO_TARGET])
    const pad = w.find('.bob .pad')
    expect(pad.classes()).toContain('ready')
    await pad.find(`button[data-index="${(DEMO_TARGET + 1) % BUZZ_EMOJIS.length}"]`).trigger('pointerdown')
    expect(pad.classes()).toContain('stunned')
    await settle(STUN_MS + 50)
    await pad.find(`button[data-index="${DEMO_TARGET}"]`).trigger('pointerdown')
    await settle()
    expect(w.find('.banner').text()).toContain('Bob')
    expect(w.find('.ann .pad').text()).toContain('Bob')
    expect(w.find('.bob .pad').text()).toContain("YOU'RE UP!")
  })

  it('keeps the buzz emoji on the TV only, unless the host shows it on phones', async () => {
    const tvOnly = await render('Clue: buzzers open', () => [h(StoryPlayer, { playerId: ANN })])
    expect(tvOnly.find('.buzz-target').exists()).toBe(false)

    const w = await render('Clue: buzzers open, emoji on phones', () => [
      h(BoardView, { room: DEMO_ROOM }),
      h('div', { class: 'bob' }, [h(StoryPlayer, { playerId: BOB })]),
    ])
    expect(w.find('.buzz-target').text()).toBe(BUZZ_EMOJIS[DEMO_TARGET])
    await w.find('.bob .pad').find(`button[data-index="${DEMO_TARGET}"]`).trigger('pointerdown')
    await settle()
    expect(w.find('.banner').text()).toContain('Bob')
    expect(w.find('.buzz-target').text()).toBe('')
  })

  it('turns on emoji on phones from the lobby', async () => {
    const w = await render('Lobby', () => [h(HostView, { room: DEMO_ROOM }), h(StoryPlayer, { playerId: ANN })], false)
    const box = w.findAll('label.check').find((l) => l.text().includes('emoji on phones'))!
    await box.find('input').setValue(true)
    await w.findAll('button').find((b) => b.text().startsWith('Start game'))!.trigger('click')
    await settle()
    // The intro is on by default, and its practice pad gets the target strip too.
    expect(w.text()).toContain('Practice round')
    expect(w.find('.buzz-target').exists()).toBe(true)
  })

  it('plays audio clues on the phones as well as the TV', async () => {
    const w = await render('Clue: audio', () => [
      h('div', { class: 'tv' }, [h(BoardView, { room: DEMO_ROOM })]),
      h('div', { class: 'phone' }, [h(StoryPlayer, { playerId: ANN })]),
    ])
    expect(w.find('.tv audio').attributes('src')).toBe(DEMO_AUDIO)
    expect(w.find('.phone audio').attributes('src')).toBe(DEMO_AUDIO)
  })

  it('lets the host judge from the control panel', async () => {
    const w = await render('Clue: Bob answering', () => [h(HostView, { room: DEMO_ROOM }), h(StoryPlayer, { playerId: BOB })], false)
    const correct = w.findAll('button').find((b) => b.text().startsWith('Correct'))!
    await correct.trigger('click')
    await settle()
    expect(w.text()).toContain('Bob got it.')
  })
})
