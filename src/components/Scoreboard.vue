<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PublicPlayer } from '@/game/types'

const props = defineProps<{
  players: PublicPlayer[]
  control?: string | null
  highlight?: string | null
  me?: string | null
  sorted?: boolean
}>()

/** A streak this long gets a flame. */
const HOT_STREAK = 3

const list = computed(() => (props.sorted ? [...props.players].sort((a, b) => b.score - a.score) : props.players))
/** The crown goes to the leader(s), once someone has points. */
const topScore = computed(() => Math.max(0, ...props.players.map((p) => p.score)))

/** "+400" / "−400" floating up from a score that just changed (not on the first snapshot). */
const pops = ref<Record<string, { delta: number; key: number }>>({})
let previous: Map<string, number> | null = null
let popCount = 0
watch(
  () => props.players.map((p) => [p.id, p.score] as const),
  (scores) => {
    for (const [id, score] of scores) {
      const before = previous?.get(id)
      if (before !== undefined && before !== score) pops.value = { ...pops.value, [id]: { delta: score - before, key: ++popCount } }
    }
    previous = new Map(scores)
  },
  { immediate: true },
)
function popDone(id: string) {
  const { [id]: _, ...rest } = pops.value
  pops.value = rest
}
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
        <span v-if="topScore > 0 && p.score === topScore" title="In the lead">👑</span>
        {{ p.name }}
        <span v-if="p.id === control" title="Picks the next clue">★</span>
        <span v-if="p.streak >= HOT_STREAK" class="streak" :title="`${p.streak} in a row`">🔥{{ p.streak }}</span>
      </div>
      <div class="value" :class="{ negative: p.score < 0 }">{{ p.score }}</div>
      <span
        v-if="pops[p.id]"
        :key="pops[p.id]!.key"
        class="pop"
        :class="{ down: pops[p.id]!.delta < 0 }"
        @animationend="popDone(p.id)"
      >
        {{ pops[p.id]!.delta > 0 ? '+' : '−' }}{{ Math.abs(pops[p.id]!.delta) }}
      </span>
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
  position: relative;
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
.streak {
  font-size: 0.85em;
}
.value {
  font-size: 1.5em;
}
.negative {
  color: var(--bad-text);
}
.pop {
  position: absolute;
  left: 50%;
  top: 0;
  translate: -50% 0;
  font-weight: 900;
  font-size: 1.3em;
  color: var(--ok);
  text-shadow: 2px 2px 0 #000a;
  pointer-events: none;
  animation: float-up 1.6s ease-out forwards;
}
.pop.down {
  color: var(--bad-text);
}
@keyframes float-up {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-2.5em);
  }
}
@keyframes fade {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pop {
    animation-name: fade;
  }
}
</style>
