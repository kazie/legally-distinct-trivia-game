<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PublicState } from '@/game/types'

type Round = NonNullable<PublicState['round']>

const props = defineProps<{
  round: Round
  /** Host mode: unused cells are buttons. */
  selectable?: boolean
  dailyDoubles?: string[]
}>()

const emit = defineEmits<{ select: [category: number, clue: number] }>()

/** Categories the round intro just revealed: they flip in. */
const flipping = ref(new Set<number>())
watch(
  () => props.round.categories.map((c) => c.name === null),
  (hidden, before) => {
    flipping.value = new Set(hidden.flatMap((h, c) => (!h && before[c] ? [c] : [])))
  },
)
</script>

<template>
  <div class="grid" :style="{ '--cols': round.categories.length }">
    <div
      v-for="(category, c) in round.categories"
      :key="`h${c}`"
      class="head display"
      :class="{ hidden: category.name === null, flip: flipping.has(c) }"
    >
      {{ category.name }}
    </div>
    <template v-for="row in round.categories[0]?.clues.length ?? 0" :key="row">
      <component
        :is="selectable ? 'button' : 'div'"
        v-for="(category, c) in round.categories"
        :key="`${c}-${row}`"
        class="cell"
        :class="{
          used: category.clues[row - 1]?.used,
          dd: dailyDoubles?.includes(`${round.index}-${c}-${row - 1}`),
          hidden: category.name === null,
          flip: flipping.has(c),
        }"
        :disabled="selectable ? category.clues[row - 1]?.used : undefined"
        @click="selectable && !category.clues[row - 1]?.used && emit('select', c, row - 1)"
      >
        <span v-if="!category.clues[row - 1]?.used" class="value">{{ category.clues[row - 1]?.value }}</span>
      </component>
    </template>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 6px;
  background: var(--cell-border);
  padding: 6px;
  border-radius: var(--radius);
}
.head,
.cell {
  background: var(--cell-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: var(--radius-sm);
  min-height: 3.2em;
  /* A lit top edge and a shaded bottom edge: tiles, not flat boxes. --ring adds an outline on top. */
  box-shadow:
    var(--ring, 0 0 transparent),
    var(--tile-bevel),
    inset 0 -3px 0 var(--cell-edge-dark);
}
.head {
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 0.6em 0.5em;
  font-size: 1.05em;
  line-height: 1.05;
  overflow-wrap: anywhere;
  text-wrap: balance;
  text-shadow: 2px 2px 0 var(--shadow-text);
}
.cell {
  font-size: 1.8em;
  padding: 0.2em;
  width: 100%;
}
.cell.used,
.hidden {
  background: var(--cell-used);
  box-shadow:
    var(--ring, 0 0 transparent),
    inset 0 2px 4px var(--cell-edge-dark);
}
/* Gold on this board means Daily Double, so host cells keep the global (accent) focus ring. */
.cell.dd:not(.used) {
  --ring: inset 0 0 0 3px var(--gold);
}
/* Round intro: categories wait face down, then flip in one by one. */
.flip {
  animation: flip 0.6s ease-out;
}
@keyframes flip {
  from {
    transform: rotateX(90deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .flip {
    animation: none;
  }
}
</style>
