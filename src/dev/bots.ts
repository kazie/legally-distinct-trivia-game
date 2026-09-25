import { watch } from 'vue'
import { BridgeClient } from '@/net/bridgeClient'
import { ClientController, joinedKey, PLAYER_ID_KEY } from '@/game/clientController'
import type { FakeBridge } from './fakeBridge'
import { MemoryStorage } from './fakeBridge'

export interface BotOptions {
  /** Chance (0–1) that the bot buzzes when buzzers open. */
  buzzChance?: number
  /** Buzz reaction time range in ms. */
  reactionMs?: [number, number]
}

/** Storage that makes a ClientController start out as an already-joined player. */
export function playerStorage(room: string, id: string, name: string): MemoryStorage {
  const storage = new MemoryStorage()
  storage.setItem(PLAYER_ID_KEY, id)
  storage.setItem(joinedKey(room), name)
  return storage
}

/**
 * A simulated player: keeps its connection alive, buzzes after a random delay, and places
 * wagers/answers when asked. Must be created inside a component setup (uses watchers).
 */
export function startBot(fake: FakeBridge, room: string, id: string, name: string, options: BotOptions = {}) {
  const { buzzChance = 0.7, reactionMs = [300, 1500] } = options
  const bridge = new BridgeClient('ws://fake', { createSocket: fake.factory })
  bridge.connect()
  const bot = new ClientController({ bridge, roomCode: room, role: 'player', storage: playerStorage(room, id, name) })
  bot.start()
  const random = (min: number, max: number) => min + Math.random() * (max - min)
  const later = (fn: () => void, ms = random(...reactionMs)) => setTimeout(fn, ms)

  watch(bot.buzzersOpen, (open) => {
    if (open && Math.random() < buzzChance) later(() => bot.buzz())
  })
  watch(
    () => bot.state.value?.current?.status === 'dd_wager' && bot.state.value.current.ddPlayer === id,
    (mine) => mine && later(() => bot.wager('daily', Math.round(random(0, bot.state.value?.current?.ddMaxWager ?? 0) / 100) * 100), 1200),
  )
  watch(
    () => bot.state.value?.phase,
    (phase) => {
      const final = bot.state.value?.final
      if (!final?.eligible.includes(id)) return
      if (phase === 'final_wager') later(() => bot.wager('final', Math.round(random(0, bot.me.value?.score ?? 0))), 1500)
      if (phase === 'final_answer') later(() => bot.finalAnswer(Math.random() < 0.5 ? 'Alfred Nobel' : 'No idea'), 4000)
    },
  )

  return () => {
    bot.stop()
    bridge.disconnect()
  }
}
