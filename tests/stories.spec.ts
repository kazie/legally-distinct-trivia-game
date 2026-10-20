// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import StoryPlayer from '@/dev/StoryPlayer.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, DEMO_AUDIO, DEMO_ROOM, DEMO_TARGET, scenarioNames, type ScenarioName } from '@/dev/scenarios'
import { BUZZ_EMOJIS } from '@/game/buzzPad'
import { DEFAULT_SETTINGS } from '@/game/settings'
import { createAppRouter } from '@/router'
import BuzzButton from '@/components/BuzzButton.vue'
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
    const w = await render('Clue: buzzers open, emoji pad', () => [
      h(BoardView, { room: DEMO_ROOM }),
      h('div', { class: 'ann' }, [h(StoryPlayer, { playerId: ANN })]),
      h('div', { class: 'bob' }, [h(StoryPlayer, { playerId: BOB })]),
    ])
    expect(w.find('.target-emoji').text()).toBe(BUZZ_EMOJIS[DEMO_TARGET])
    const pad = w.find('.bob .pad')
    expect(pad.classes()).toContain('ready')
    await pad.find(`button[data-index="${(DEMO_TARGET + 1) % BUZZ_EMOJIS.length}"]`).trigger('pointerdown')
    expect(pad.classes()).toContain('stunned')
    await settle(DEFAULT_SETTINGS.lockoutMs + 50)
    await pad.find(`button[data-index="${DEMO_TARGET}"]`).trigger('pointerdown')
    await settle()
    expect(w.find('.banner').text()).toContain('Bob')
    expect(w.find('.ann .pad').text()).toContain('Bob')
    expect(w.find('.bob .pad').text()).toContain("YOU'RE UP!")
  })

  it('keeps the buzz emoji on the TV only, unless the host shows it on phones', async () => {
    const tvOnly = await render('Clue: buzzers open, emoji pad', () => [h(StoryPlayer, { playerId: ANN })])
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
    await w.find('input[type="radio"][value="emoji"]').setValue(true)
    const box = w.findAll('label.check').find((l) => l.text().includes('emoji on phones'))!
    await box.find('input').setValue(true)
    await w.findAll('button').find((b) => b.text().startsWith('Start game'))!.trigger('click')
    await settle()
    // The intro is on by default, and its practice pad gets the target strip too.
    expect(w.text()).toContain('Practice round')
    expect(w.find('.buzz-target').exists()).toBe(true)
  })

  it('buzzes with the big button, and shows false starts on the TV', async () => {
    const w = await render('Clue: buzzers open', () => [
      h(BoardView, { room: DEMO_ROOM }),
      h('div', { class: 'bob' }, [h(StoryPlayer, { playerId: BOB })]),
    ])
    expect(w.find('.target-emoji').exists()).toBe(false)
    expect(w.text()).toContain('Buzzers open!')
    const button = w.find('.bob button.buzz')
    expect(button.classes()).toContain('ready')
    await button.trigger('pointerdown')
    await settle()
    expect(w.find('.banner').text()).toContain('Bob')

    const early = await render('Clue: Ann jumped the gun', () => [h(BoardView, { room: DEMO_ROOM })])
    expect(early.text()).toContain('Too early: Ann −300')
  })

  it('hides the clue on TV and phones while someone answers in quick draw', async () => {
    const w = await render('Clue: quick draw, Bob answering', () => [
      h(BoardView, { room: DEMO_ROOM }),
      h('div', { class: 'ann' }, [h(StoryPlayer, { playerId: ANN })]),
    ])
    expect(w.find('.hidden-clue').exists()).toBe(true)
    expect(w.find('.ann').text()).toContain('Clue hidden')
  })

  it('starts the game with the buzzer settings the host picks in the lobby', async () => {
    const w = await render('Lobby', () => [h(HostView, { room: DEMO_ROOM }), h(BoardView, { room: DEMO_ROOM })], false)
    await w.find('input[type="radio"][value="instant"]').setValue(true)
    const lockout = w.findAll('select').find((s) => s.findAll('option').some((o) => o.text() === '2 s'))!
    await lockout.setValue('2000')
    await w.findAll('button').find((b) => b.text().startsWith('Start game'))!.trigger('click')
    await settle()
    expect(w.text()).toContain('the clue disappears')
    expect(w.text()).toContain('Press the big button on your phone as soon as you know it.')
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

  it('presses the big button with a tap or the keyboard, but not a right-click', async () => {
    const w = mount(BuzzButton, { props: { mode: 'ready' } })
    wrappers.push(w)
    const button = w.find('button')
    await button.trigger('pointerdown', { button: 2 })
    expect(w.emitted('press')).toBeUndefined()
    // A tap: pressed on pointer down, and the click that follows doesn't press again.
    await button.trigger('pointerdown', { button: 0 })
    await button.trigger('click')
    expect(w.emitted('press')).toHaveLength(1)
    // Enter or a screen reader: just a click.
    await new Promise((r) => setTimeout(r, 1050))
    await button.trigger('click')
    expect(w.emitted('press')).toHaveLength(2)
  })
})
