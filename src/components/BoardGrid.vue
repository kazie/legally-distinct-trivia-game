<script setup lang="ts">
import type { PublicState } from '@/game/types'

type Round = NonNullable<PublicState['round']>

defineProps<{
  round: Round
  /** Host mode: unused cells are buttons. */
  selectable?: boolean
  dailyDoubles?: string[]
}>()

const emit = defineEmits<{ select: [category: number, clue: number] }>()
</script>

<template>
  <div class="grid" :style="{ '--cols': round.categories.length }">
    <div v-for="(category, c) in round.categories" :key="`h${c}`" class="head">{{ category.name }}</div>
    <template v-for="row in round.categories[0]?.clues.length ?? 0" :key="row">
      <component
        :is="selectable ? 'button' : 'div'"
        v-for="(category, c) in round.categories"
        :key="`${c}-${row}`"
        class="cell"
        :class="{ used: category.clues[row - 1]?.used, dd: dailyDoubles?.includes(`${round.index}-${c}-${row - 1}`) }"
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
  border-radius: 4px;
  min-height: 3.2em;
}
.head {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.6em 0.4em;
  font-size: 0.95em;
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.cell {
  font-size: 1.8em;
  padding: 0.2em;
  width: 100%;
}
button.cell {
  border-radius: 4px;
}
.cell.used {
  background: var(--cell-used);
}
.cell.dd:not(.used) {
  box-shadow: inset 0 0 0 3px var(--gold);
}
</style>
