<script setup lang="ts">
/**
 * Story harness: a self-contained game room on an in-memory bridge.
 * Everything rendered inside (Host/Board/Player views) connects to it instead of a real bridge.
 */
import { onUnmounted } from 'vue'
import { HostController, hostStorageKey } from '@/game/hostController'
import { BridgeClient } from '@/net/bridgeClient'
import { provideSocketFactory } from '@/net/useBridge'
import { provideStorages } from '@/storage'
import { startBot, type BotOptions } from './bots'
import { FakeBridge, MemoryStorage } from './fakeBridge'
import { DEMO_ROOM, PLAYERS, scenarios, type Scenario, type ScenarioName } from './scenarios'

const props = withDefaults(
  defineProps<{
    scenario: ScenarioName
    /** Run a host without UI (for Board/Player stories). Turn off when the HostView itself is rendered. */
    headlessHost?: boolean
    /** Player ids simulated by bots. */
    bots?: string[]
    botOptions?: BotOptions
  }>(),
  { headlessHost: true, bots: () => [] },
)

const fake = new FakeBridge()
provideSocketFactory(fake.factory)

const { state, live = [] }: Scenario = scenarios[props.scenario]()
const hostStorage = new MemoryStorage()
hostStorage.setItem(hostStorageKey(DEMO_ROOM), JSON.stringify(state))
provideStorages({ local: hostStorage, session: new MemoryStorage() })

const cleanups: (() => void)[] = []

if (props.headlessHost) {
  const bridge = new BridgeClient('ws://fake', { createSocket: fake.factory })
  bridge.connect()
  const host = new HostController({ bridge, roomCode: DEMO_ROOM, storage: hostStorage })
  host.start()
  // Give sockets a moment to open before doing anything that needs the echo from the bridge.
  const timer = setTimeout(() => live.forEach((action) => host.dispatch(action)), 50)
  cleanups.push(() => clearTimeout(timer), () => host.stop(), () => bridge.disconnect())
}

for (const id of props.bots) {
  const player = PLAYERS.find((p) => p.id === id)
  if (player) cleanups.push(startBot(fake, DEMO_ROOM, player.id, player.name, props.botOptions))
}

onUnmounted(() => cleanups.forEach((fn) => fn()))
</script>

<template>
  <slot :room="DEMO_ROOM" />
</template>
