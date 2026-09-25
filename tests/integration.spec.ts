import { afterEach, describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { validateBoard, type Board } from '@/content/schema'
import { BridgeClient } from '@/net/bridgeClient'
import { HostController } from '@/game/hostController'
import { STUN_MS } from '@/game/buzzPad'
import { ClientController } from '@/game/clientController'
import { FakeBridge, MemoryStorage, flush } from '@/dev/fakeBridge'

const result = validateBoard(sample)
if (!result.ok) throw new Error('sample board invalid')
const board: Board = result.board

const stops: (() => void)[] = []
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
    host.dispatch({ type: 'startGame' })
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

  it('stuns a player for a wrong emoji or an early tap, without sending a buzz', async () => {
    const { host, player } = setup()
    const [ann, bob] = [player(1), player(2)]
    await flush()
    ann.join('Ann')
    bob.join('Bob')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame' })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()

    // Too early: buzzers aren't open yet.
    expect(ann.press(0)).toBe('stunned')
    expect(ann.stunned.value).toBe(true)
    expect(ann.press(0)).toBe('ignored')
    await new Promise((r) => setTimeout(r, STUN_MS + 30))
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

  it('does not let a wrong emoji win even if a client sends it', async () => {
    const { host, player } = setup()
    const ann = player(1)
    await flush()
    ann.join('Ann')
    await flush()
    host.dispatch({ type: 'loadBoard', board, dailyDoubles: [] })
    host.dispatch({ type: 'startGame' })
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
    host.dispatch({ type: 'startGame' })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    await flush()
    expect(ann.state.value?.current?.ddPlayer).toBe(ann.playerId)
    expect(ann.state.value?.current?.ddMaxWager).toBe(1000)
    ann.wager('daily', 700)
    await flush()
    host.dispatch({ type: 'showDdClue' })
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
