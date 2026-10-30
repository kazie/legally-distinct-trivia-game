import { afterEach, describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { validateBoard, type Board } from '@/content/schema'
import { BridgeClient } from '@/net/bridgeClient'
import { HostController, hostStorageKey } from '@/game/hostController'
import { ClientController } from '@/game/clientController'
import { DEFAULT_SETTINGS } from '@/game/settings'
import { encode } from '@/net/protocol'
import { roomTopic } from '@/game/roomCode'
import { FakeBridge, MemoryStorage, flush } from '@/dev/fakeBridge'

const result = validateBoard(sample)
if (!result.ok) throw new Error('sample board invalid')
const board: Board = result.board

const stops: (() => void)[] = []
/** The existing races are played on the emoji pad, with a short lockout to keep tests quick. */
const EMOJI_LOCKOUT = 250
const EMOJI = { buzzStyle: 'emoji', lockoutMs: EMOJI_LOCKOUT, roundIntro: false } as const
afterEach(() => stops.splice(0).forEach((fn) => fn()))

function setup(hostStorage = new MemoryStorage()) {
  const fake = new FakeBridge()
  const connect = () => {
    const client = new BridgeClient('ws://fake', { createSocket: fake.factory, minBackoffMs: 1, maxBackoffMs: 5 })
    client.connect()
    stops.push(() => client.disconnect())
    return client
  }
  const host = new HostController({ bridge: connect(), roomCode: 'ROOM', storage: hostStorage })
  host.start()
  stops.push(() => host.stop())
  const player = (n: number) => {
    let i = 0
    const c = new ClientController({
      bridge: connect(),
      roomCode: 'ROOM',
      role: 'player',
      storage: new MemoryStorage(),
      createId: () => `p${n}-${i++}`,
    })
    c.start()
    stops.push(() => c.stop())
    return c
  }
  return { fake, host, player, connect, hostStorage }
}

describe('host and players over the bridge', () => {
  it('joins, races buzzers, judges and syncs scores', async () => {
    const { host, player } = setup()
    const [ann, bob, cid] = [player(1), player(2), player(3)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    cid.join('Cid')
    await flush()
    expect(host.state.value.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cid'])

    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: EMOJI })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()
    expect(bob.state.value?.current?.text).toBe('The planet known as the Red Planet')
    expect(bob.canBuzz.value).toBe(false)

    host.dispatch({ type: 'openBuzzers', target: 3 })
    await flush()
    expect(host.state.value.current?.status).toBe('open')
    expect(bob.canBuzz.value).toBe(true)

    // Bob's buzz reaches the bridge first, so Bob wins even though Cid also buzzed.
    expect(bob.press(3)).toBe('buzzed')
    expect(cid.press(3)).toBe('buzzed')
    await flush()
    expect(host.state.value.current?.buzzWinner).toBe(bob.playerId)
    expect(ann.buzzWinnerName.value).toBe('Bob')
    expect(cid.buzzWinnerName.value).toBe('Bob')

    host.dispatch({ type: 'judge', correct: false })
    host.dispatch({ type: 'openBuzzers', target: 5 })
    await flush()
    expect(bob.canBuzz.value).toBe(false)
    expect(bob.press(5)).toBe('ignored')
    cid.press(5)
    await flush()
    host.dispatch({ type: 'judge', correct: true })
    await flush()
    expect(ann.state.value?.players.map((p) => p.score)).toEqual([0, -200, 200])
    expect(ann.state.value?.current?.answer).toBe('Mars')
    expect(ann.state.value?.control).toBe(cid.playerId)

    host.undo()
    await flush()
    expect(ann.state.value?.current?.status).toBe('answering')
    expect(ann.state.value?.players.map((p) => p.score)).toEqual([0, -200, 0])
  })

  it.each([false, true])('shows the emoji on phones only while buzzers are open (option on: %s)', async (emojiOnPhones) => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { buzzStyle: 'emoji', emojiOnPhones, roundIntro: false } })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()
    expect(ann.phoneTarget.value).toBeNull()

    host.dispatch({ type: 'openBuzzers', target: 7 })
    await flush()
    expect(ann.phoneTarget.value).toBe(emojiOnPhones ? 7 : null)

    expect(bob.press(7)).toBe('buzzed')
    await flush()
    expect(ann.phoneTarget.value).toBeNull()
  })

  it.each([undefined, true])('resumes games saved before settings existed as emoji games (emoji on phones: %s)', (emojiOnPhones) => {
    const { host, hostStorage } = setup()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { roundIntro: false } })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    const saved = JSON.parse(hostStorage.getItem(hostStorageKey('ROOM'))!)
    delete saved.settings
    delete saved.current.lockedUntil
    delete saved.falseStarts
    if (emojiOnPhones !== undefined) saved.emojiOnPhones = emojiOnPhones
    hostStorage.setItem(hostStorageKey('ROOM'), JSON.stringify(saved))
    const restored = new HostController({ bridge: host['bridge'], roomCode: 'ROOM', storage: hostStorage })
    expect(restored.state.value.settings).toEqual({
      ...DEFAULT_SETTINGS,
      buzzStyle: 'emoji',
      emojiOnPhones: !!emojiOnPhones,
      lockoutMs: 250, // the old 200 ms block, as close as the choices go
    })
    expect(restored.state.value.current?.lockedUntil).toEqual({})
    expect(restored.state.value.falseStarts).toEqual([])
  })

  it('stuns a player for a wrong emoji or an early tap, without sending a buzz', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: EMOJI })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()

    // Too early: buzzers aren't open yet.
    expect(ann.press(0)).toBe('stunned')
    expect(ann.stunned.value).toBe(true)
    expect(ann.press(0)).toBe('ignored')
    await new Promise((r) => setTimeout(r, EMOJI_LOCKOUT + 30))
    expect(ann.stunned.value).toBe(false)

    host.dispatch({ type: 'openBuzzers', target: 6 })
    await flush()
    expect(ann.press(1)).toBe('stunned')
    expect(ann.canBuzz.value).toBe(false)
    // Still stunned: even the right emoji does nothing, so Bob gets in first.
    expect(ann.press(6)).toBe('ignored')
    expect(bob.press(6)).toBe('buzzed')
    await flush()
    expect(host.state.value.current?.buzzWinner).toBe(bob.playerId)
  })

  it('charges a big-button false start on the host and blocks the phone', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { lockoutMs: 250, roundIntro: false } })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()

    expect(ann.press()).toBe('stunned')
    expect(ann.lockMs.value).toBeGreaterThan(0)
    expect(ann.press()).toBe('ignored')
    await flush()
    expect(host.state.value.players.map((p) => p.score)).toEqual([-100, 0])
    expect(bob.state.value?.current?.falseStarts).toEqual([{ playerId: ann.playerId, points: 100 }])

    host.dispatch({ type: 'openBuzzers', target: 0 })
    await flush()
    expect(ann.canBuzz.value).toBe(false)
    expect(bob.canBuzz.value).toBe(true)
    expect(bob.press()).toBe('buzzed')
    await flush()
    expect(host.state.value.current?.buzzWinner).toBe(bob.playerId)

    // Once the lockout is over, Ann gets her chance after Bob's miss.
    await new Promise((r) => setTimeout(r, 300))
    host.dispatch({ type: 'judge', correct: false })
    host.dispatch({ type: 'openBuzzers', target: 0 })
    await flush()
    expect(ann.lockMs.value).toBe(0)
    expect(ann.press()).toBe('buzzed')
    await flush()
    expect(host.state.value.current?.buzzWinner).toBe(ann.playerId)
  })

  it('keeps false-start penalties through the host\'s undo', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { roundIntro: false } })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    host.dispatch({ type: 'adjustScore', id: bob.playerId, delta: 500 })
    await flush()
    expect(ann.press()).toBe('stunned')
    await flush()
    expect(host.state.value.players.map((p) => p.score)).toEqual([-100, 500])

    // Undo the score fix: Bob's +500 goes, Ann's penalty stays, and so does her lockout.
    host.undo()
    await flush()
    expect(host.state.value.players.map((p) => p.score)).toEqual([-100, 0])
    expect(bob.state.value?.current?.falseStarts).toEqual([{ playerId: ann.playerId, points: 100 }])
    expect(host.state.value.current?.lockedUntil[ann.playerId]).toBeGreaterThan(0)

    // Undo back to the board: the penalty still stays, it's just no longer on a clue on screen.
    host.undo()
    await flush()
    expect(host.state.value.phase).toBe('board')
    expect(host.state.value.players.map((p) => p.score)).toEqual([-100, 0])
    expect(host.state.value.falseStarts).toHaveLength(1)
  })

  it('opens buzzers with the clue in quick draw and hides it from phones while someone answers', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { openMode: 'instant', roundIntro: false } })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 }, target: 2 })
    await flush()
    expect(ann.canBuzz.value).toBe(true)
    expect(ann.state.value?.current?.text).toBe('The planet known as the Red Planet')
    expect(ann.press()).toBe('buzzed')
    await flush()
    expect(bob.state.value?.current).toMatchObject({ status: 'answering', text: null })

    host.dispatch({ type: 'judge', correct: false, target: 3 })
    await flush()
    expect(bob.canBuzz.value).toBe(true)
    expect(bob.state.value?.current?.text).toBe('The planet known as the Red Planet')
  })

  it('plays a practice buzz in the intro without scoring', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', intro: true, settings: EMOJI })
    await flush()
    expect(ann.state.value?.phase).toBe('intro')
    expect(ann.press(3)).toBe('stunned')
    await new Promise((r) => setTimeout(r, EMOJI_LOCKOUT + 20))

    host.dispatch({ type: 'openPractice', target: 3 })
    await flush()
    expect(bob.canBuzz.value).toBe(true)
    expect(bob.press(3)).toBe('buzzed')
    await flush()
    expect(ann.press(3)).toBe('buzzed')
    await flush()
    expect(ann.state.value?.practice?.hits.map((h) => h.playerId)).toEqual([bob.playerId, ann.playerId])
    expect(ann.practiceHit.value?.playerId).toBe(ann.playerId)

    host.dispatch({ type: 'endIntro' })
    await flush()
    expect(bob.state.value?.phase).toBe('board')
    expect(host.state.value.players.every((p) => p.score === 0)).toBe(true)
  })

  it('never reuses an attempt number after undo, so players can buzz again', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', intro: true, settings: EMOJI })

    host.dispatch({ type: 'openPractice', target: 3 })
    await flush()
    expect(ann.press(3)).toBe('buzzed')
    await flush()
    host.undo()
    await flush()
    host.dispatch({ type: 'openPractice', target: 5 })
    await flush()
    expect(host.state.value.practice?.attempt).toBe(2)
    expect(ann.canBuzz.value).toBe(true)
    expect(ann.press(5)).toBe('buzzed')
    await flush()
    expect(host.state.value.practice?.hits.map((h) => h.playerId)).toEqual([ann.playerId])

    // Same for a clue: undo back to the board and pick it again.
    host.dispatch({ type: 'endIntro' })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    host.dispatch({ type: 'openBuzzers', target: 2 })
    await flush()
    expect(bob.press(2)).toBe('buzzed')
    await flush()
    host.undo()
    host.undo()
    await flush()
    expect(host.state.value.phase).toBe('board')
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()
    host.dispatch({ type: 'openBuzzers', target: 4 })
    await flush()
    expect(bob.canBuzz.value).toBe(true)
    expect(bob.press(4)).toBe('buzzed')
    await flush()
    expect(host.state.value.current?.buzzWinner).toBe(bob.playerId)
  })

  it('does not let a wrong emoji win even if a client sends it', async () => {
    const { host, player } = setup()
    const ann = player(1)
    await flush()
    ann.join('Ann')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: EMOJI })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    host.dispatch({ type: 'openBuzzers', target: 2 })
    await flush()
    const cur = ann.state.value!.current!
    ann['send']({ type: 'buzz', from: 'player', playerId: ann.playerId, clueId: cur.id, attempt: cur.attempt, emoji: 4 })
    await flush()
    expect(host.state.value.current?.status).toBe('open')
  })

  it('handles Daily Double and final wagers sent by players', async () => {
    const { host, player } = setup()
    const ann = player(1)
    await flush()
    ann.join('Ann')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: ['0-0-0'] })
    host.dispatch({ type: 'startGame', settings: EMOJI })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()
    expect(ann.state.value?.current?.ddPlayer).toBe(ann.playerId)
    expect(ann.state.value?.current?.ddMaxWager).toBe(1000)
    ann.wager('daily', 700)
    await flush()
    host.dispatch({ type: 'showDdClue', now: 0 })
    host.dispatch({ type: 'judge', correct: true })
    host.dispatch({ type: 'returnToBoard' })
    host.dispatch({ type: 'startFinal' })
    host.dispatch({ type: 'openFinalWagers' })
    await flush()
    ann.wager('final', 300)
    await flush()
    host.dispatch({ type: 'showFinalClue', now: Date.now(), durationMs: 30_000 })
    await flush()
    expect(ann.state.value?.final?.clue).toContain('dynamite')
    ann.finalAnswer('Alfred Nobel')
    await flush()
    host.dispatch({ type: 'closeFinalAnswers' })
    host.dispatch({ type: 'showFinalResponse' })
    await flush()
    expect(ann.state.value?.final?.judging).toMatchObject({ response: 'Alfred Nobel', wager: 300 })
    host.dispatch({ type: 'judgeFinal', correct: true })
    await flush()
    expect(ann.me.value?.score).toBe(1000)

    host.dispatch({ type: 'endGame' })
    await flush()
    const gameOver = ann.state.value?.gameOver
    expect(gameOver?.ranking).toEqual([{ playerId: ann.playerId, rank: 1, score: 1000 }])
    expect(gameOver?.awards.map((a) => a.key)).toEqual(['most-correct', 'daily-double', 'final-hero'])
    expect(host.state.value.history).toHaveLength(1)
  })

  it('late joiners and reconnecting clients resync after a bridge restart', async () => {
    const { fake, host, player, hostStorage } = setup()
    const ann = player(1)
    await flush()
    ann.join('Ann')
    await flush()
    host.dispatch({ type: 'adjustScore', id: ann.playerId, delta: 400 })

    fake.restart()
    await new Promise((r) => setTimeout(r, 30))
    const board = new ClientController({ bridge: (() => {
      const c = new BridgeClient('ws://fake', { createSocket: fake.factory })
      c.connect()
      stops.push(() => c.disconnect())
      return c
    })(), roomCode: 'ROOM', role: 'board' })
    board.start()
    stops.push(() => board.stop())
    await flush()
    await flush()
    expect(board.state.value?.players).toMatchObject([{ name: 'Ann', score: 400 }])
    expect(ann.state.value?.players).toMatchObject([{ name: 'Ann', score: 400 }])

    // A host reload resumes from storage.
    const restored = new HostController({ bridge: host['bridge'], roomCode: 'ROOM', storage: hostStorage })
    expect(restored.state.value.players[0]?.score).toBe(400)
  })

  it('shows player reactions on the board screen, one per second per player, only when allowed', async () => {
    const { host, player, connect } = setup()
    const ann = player(1)
    const tv = new ClientController({ bridge: connect(), roomCode: 'ROOM', role: 'board', storage: new MemoryStorage() })
    tv.start()
    stops.push(() => tv.stop())
    await flush()
    ann.join('Ann')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { roundIntro: false } })
    await flush()

    expect(ann.react(2)).toBe(true)
    // The phone holds back a second reaction within the second…
    expect(ann.react(3)).toBe(false)
    await flush()
    expect(tv.reactions.value.map((r) => [r.playerId, r.emoji])).toEqual([[ann.playerId, 2]])
    // …and the TV ignores one that gets through anyway, and any from someone not in the game.
    const bridge = connect()
    await flush()
    bridge.publish(roomTopic('ROOM'), encode({ type: 'react', from: 'player', playerId: ann.playerId, emoji: 4 }), { echo: false })
    bridge.publish(roomTopic('ROOM'), encode({ type: 'react', from: 'player', playerId: 'stranger', emoji: 4 }), { echo: false })
    await flush()
    expect(tv.reactions.value).toHaveLength(1)

    host.dispatch({ type: 'resetToLobby' })
    host.dispatch({ type: 'startGame', settings: { roundIntro: false, reactions: false } })
    await flush()
    expect(ann.react(1)).toBe(false)
  })

  it('collects all-play answers and closest guesses from phones', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame', settings: { roundIntro: false } })
    host.dispatch({ type: 'endRound' })
    host.dispatch({ type: 'selectClue', ref: { round: 1, category: 0, clue: 0 } })
    await flush()
    // Too early: answers aren't open yet.
    expect(ann.clueAnswer('Titanic')).toBe(false)
    host.dispatch({ type: 'openAnswers', now: Date.now() })
    await flush()
    ann.clueAnswer('Titanic')
    bob.clueAnswer('Lusitania')
    await flush()
    expect(bob.state.value?.current?.answered).toEqual([ann.playerId, bob.playerId])
    host.dispatch({ type: 'closeAnswers' })
    host.dispatch({ type: 'finishJudging' })
    await flush()
    expect(bob.state.value?.players.map((p) => p.score)).toEqual([400, 0])

    host.dispatch({ type: 'returnToBoard' })
    host.dispatch({ type: 'selectClue', ref: { round: 1, category: 1, clue: 1 } })
    host.dispatch({ type: 'openAnswers', now: Date.now() })
    await flush()
    ann.clueAnswer(70)
    bob.clueAnswer(90)
    await flush()
    host.dispatch({ type: 'closeAnswers' })
    await flush()
    expect(ann.state.value?.current?.results?.find((r) => r.correct)?.playerId).toBe(bob.playerId)
  })

  it('sends a kicked player back to the join form', async () => {
    const { host, player } = setup()
    const ann = player(1)
    await flush()
    ann.join('Ann')
    await flush()
    await flush()
    host.dispatch({ type: 'removePlayer', id: ann.playerId })
    await flush()
    expect(ann.joinedName.value).toBeNull()
  })
})
