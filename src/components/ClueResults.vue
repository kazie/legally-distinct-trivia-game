<script setup lang="ts">
import { computed } from 'vue'
import type { PublicClueAnswer } from '@/game/types'

/** Everyone's answers once revealed: a ✓/✗ list (all-play), or guesses on a number line (closest). */
const props = defineProps<{
  results: PublicClueAnswer[]
  /** The right number for a closest clue; leave out for all-play. */
  number?: number | null
  nameOf: (id: string) => string | null
}>()

const line = computed(() => {
  if (props.number === undefined || props.number === null) return null
  const values = [props.number, ...props.results.map((r) => r.number ?? props.number!)]
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const at = (v: number) => `${4 + ((v - min) / span) * 92}%`
  return {
    answer: at(props.number),
    guesses: [...props.results].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)).map((r) => ({ ...r, left: at(r.number ?? props.number!) })),
  }
})
</script>

<template>
  <div v-if="line" class="number-line">
    <div class="axis" />
    <div class="mark answer" :style="{ left: line.answer }">
      <strong>{{ number }}</strong>
    </div>
    <div v-for="(g, i) in line.guesses" :key="g.playerId" class="mark guess" :class="{ win: g.correct, low: i % 2 }" :style="{ left: g.left }">
      <span>{{ nameOf(g.playerId) }}</span>
      <small>{{ g.number }}</small>
    </div>
  </div>
  <ul v-else class="answers">
    <li v-for="r in results" :key="r.playerId" :class="{ win: r.correct }">
      <span class="tick">{{ r.correct ? '✓' : '✗' }}</span>
      <strong>{{ nameOf(r.playerId) }}</strong>
      <span class="muted">{{ r.text }}</span>
    </li>
  </ul>
</template>

<style scoped>
.answers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4em 1.2em;
  text-transform: none;
}
.answers li {
  display: flex;
  gap: 0.4em;
  align-items: baseline;
}
.tick {
  color: var(--bad-text);
}
.win .tick {
  color: var(--ok);
}
.number-line {
  position: relative;
  width: min(40em, 90%);
  height: 6em;
  margin: 0 auto;
}
.axis {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 3px solid var(--muted);
}
.mark {
  position: absolute;
  top: 50%;
  translate: -50% -100%;
  display: grid;
  justify-items: center;
  font-size: 0.8em;
  line-height: 1.1;
  white-space: nowrap;
}
.mark.low {
  translate: -50% 0.4em;
}
.mark.answer {
  translate: -50% -50%;
  color: var(--gold);
  font-size: 1.1em;
  background: var(--cell-bg);
  border: 2px solid var(--gold);
  border-radius: 6px;
  padding: 0 0.3em;
  z-index: 1;
}
.mark.win span {
  color: var(--ok);
  font-weight: 800;
}
</style>
