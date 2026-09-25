<script setup lang="ts">
/** A player's phone inside a StoryRoom, signed in as `playerId` (or not joined yet when omitted). */
import PlayerView from '@/views/PlayerView.vue'
import { MemoryStorage } from './fakeBridge'
import { playerStorage } from './bots'
import { provideStorages } from '@/storage'
import { DEMO_ROOM, PLAYERS } from './scenarios'

const props = defineProps<{ playerId?: string }>()
const player = PLAYERS.find((p) => p.id === props.playerId)
provideStorages({ session: player ? playerStorage(DEMO_ROOM, player.id, player.name) : new MemoryStorage() })
</script>

<template>
  <PlayerView :room="DEMO_ROOM" />
</template>
