<script setup lang="ts">
import BoardView from '@/views/BoardView.vue'
import HostView from '@/views/HostView.vue'
import StoryPlayer from './StoryPlayer.vue'
import StoryRoom from './StoryRoom.vue'
import { ANN, BOB, CID, DEMO_ROOM, scenarioNames, type ScenarioName } from './scenarios'
import { reactive } from 'vue'

const state = reactive({ scenario: 'Lobby' as ScenarioName, cidIsBot: true })
</script>

<template>
  <Story title="Live game playground" group="top" icon="carbon:game-console" :layout="{ type: 'single', iframe: true }">
    <template #controls>
      <HstSelect v-model="state.scenario" title="Start from" :options="scenarioNames" />
      <HstCheckbox v-model="state.cidIsBot" title="Cid is a bot" />
    </template>
    <StoryRoom :key="`${state.scenario}|${state.cidIsBot}`" :scenario="state.scenario" :headless-host="false" :bots="state.cidIsBot ? [CID] : []">
      <div class="playground">
        <div class="host"><HostView :room="DEMO_ROOM" /></div>
        <div class="board"><BoardView :room="DEMO_ROOM" /></div>
        <div class="phone"><StoryPlayer :player-id="ANN" /></div>
        <div class="phone"><StoryPlayer :player-id="BOB" /></div>
      </div>
    </StoryRoom>
  </Story>
</template>

<docs lang="md">
# Live game playground

A whole game in one page: host panel, TV board, and phones for Ann and Bob, all talking over an in-memory
bridge. Cid is a bot. Pick a starting point under *Controls*, then play: open buzzers on the host, tap the emoji
the TV shows on a phone (a wrong one stuns for 200 ms), and judge.
</docs>

<style scoped>
.playground {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 8px;
  padding: 8px;
}
.host {
  grid-column: 1 / -1;
  border: 1px dashed #fff3;
}
.board {
  border: 1px dashed #fff3;
  zoom: 0.6;
}
.phone {
  border: 1px dashed #fff3;
  max-height: 900px;
  overflow: auto;
}
.playground :deep(.host),
.playground :deep(.screen),
.playground :deep(.player) {
  min-height: 0;
}
</style>
