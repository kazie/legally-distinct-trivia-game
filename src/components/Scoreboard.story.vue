<script setup lang="ts">
import { reactive } from 'vue'
import Scoreboard from './Scoreboard.vue'

const players = reactive([
  { id: 'a', name: 'Ann', score: 2400, connected: true },
  { id: 'b', name: 'Bob', score: 600, connected: true },
  { id: 'c', name: 'Cid', score: -400, connected: false },
  { id: 'd', name: 'Dagny with a really long name', score: 0, connected: true },
])
const state = reactive({ control: 'a', highlight: 'b', sorted: false })
</script>

<template>
  <Story title="Scoreboard" group="components" :layout="{ type: 'single', iframe: false }">
    <template #controls>
      <HstSelect v-model="state.control" title="Control ★" :options="players.map((p) => ({ label: p.name, value: p.id }))" />
      <HstSelect v-model="state.highlight" title="Highlight" :options="players.map((p) => ({ label: p.name, value: p.id }))" />
      <HstCheckbox v-model="state.sorted" title="Sorted" />
      <HstJson v-model="players" title="Players" />
    </template>
    <Scoreboard :players="players" :control="state.control" :highlight="state.highlight" :sorted="state.sorted" me="d" />
  </Story>
</template>
