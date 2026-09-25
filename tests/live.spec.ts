/**
 * Runs against a real araisan-meme-eventbridge when LDTG_BRIDGE_URL is set, e.g.
 *   LDTG_BRIDGE_URL=ws://localhost:8080/ws pnpm test
 * Skipped otherwise.
 */
import { afterEach, describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { BoardSchema } from '@/content/schema'
import { BridgeClient, type WebSocketLike } from '@/net/bridgeClient'
import { ClientController } from '@/game/clientController'
import { HostController } from '@/game/hostController'
import { generateRoomCode } from '@/game/roomCode'
import { MemoryStorage } from '@/dev/fakeBridge'

const url = process.env.LDTG_BRIDGE_URL
const stops: (() => void)[] = []
afterEach(() => stops.splice(0).forEach((fn) => fn()))

function connect() {
  const client = new BridgeClient(url!, { createSocket: (u) => new WebSocket(u) as unknown as WebSocketLike })
  client.connect()
  stops.push(() => client.disconnect())
  return client
}

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe.skipIf(!url)('live bridge', () => {
  it('plays a clue with racing buzzers', async () => {
    const room = generateRoomCode()
    const host = new HostController({ bridge: connect(), roomCode: room })
    host.start()
    stops.push(() => host.stop())
    const players = [1, 2, 3, 4].map((n) => {
      const c = new ClientController({ bridge: connect(), roomCode: room, role: 'player', storage: new MemoryStorage() })
      c.start()
      stops.push(() => c.stop())
      return { c, name: `P${n}` }
    })
    await until(() => players.every(({ c }) => c.connection.value === 'open'))
    players.forEach(({ c, name }) => c.join(name))
    await until(() => host.state.value.players.length === 4)

    host.dispatch({ type: 'loadBoard', board: BoardSchema.parse(sample), dailyDoubles: [] })
    host.dispatch({ type: 'startGame' })
    host.dispatch({ type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })
    host.dispatch({ type: 'openBuzzers', target: 0 })
    await until(() => players.every(({ c }) => c.canBuzz.value))
    players.forEach(({ c }) => c.press(0))
    await until(() => host.state.value.current?.status === 'answering')
    const winner = host.state.value.current!.buzzWinner
    await until(() => players.every(({ c }) => c.state.value?.current?.buzzWinner === winner))
    expect(players.map(({ c }) => c.playerId)).toContain(winner)
    host.dispatch({ type: 'judge', correct: true })
    await until(() => players.every(({ c }) => c.state.value?.current?.answer === 'Mars'))
  })
})
