<script setup lang="ts">
import { computed } from 'vue'
import type { PublicPlayer } from '@/game/types'

const props = defineProps<{
  players: PublicPlayer[]
  control?: string | null
  highlight?: string | null
  me?: string | null
  sorted?: boolean
}>()

const list = computed(() => (props.sorted ? [...props.players].sort((a, b) => b.score - a.score) : props.players))
</script>

<template>
  <div class="scores">
    <div
      v-for="p in list"
      :key="p.id"
      class="score"
      :class="{ highlight: p.id === highlight, me: p.id === me, offline: !p.connected }"
    >
      <div class="name">
        {{ p.name }}
        <span v-if="p.id === control" title="Picks the next clue">★</span>
      </div>
      <div class="value" :class="{ negative: p.score < 0 }">{{ p.score }}</div>
    </div>
    <div v-if="players.length === 0" class="muted">No players yet</div>
  </div>
</template>

<style scoped>
.scores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.score {
  background: var(--cell-bg);
  border: 3px solid var(--cell-border);
  border-radius: var(--radius);
  padding: 0.4em 1em;
  min-width: 7em;
  text-align: center;
}
.score.highlight {
  border-color: var(--gold);
  box-shadow: 0 0 18px #f5c54288;
}
.score.me {
  outline: 2px dashed var(--accent);
}
.score.offline {
  opacity: 0.5;
}
.name {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.value {
  font-size: 1.5em;
}
.negative {
  color: #ff8c8f;
}
</style>
