<script setup lang="ts">
import { computed, reactive } from 'vue'
import BoardGrid from './BoardGrid.vue'
import { board } from '@/dev/scenarios'

const state = reactive({ round: 0, usedRatio: 0.3, selectable: false, shown: 5 })
const round = computed(() => {
  const r = board.rounds[state.round]!
  let n = 0
  return {
    index: state.round,
    count: board.rounds.length,
    name: r.name,
    categories: r.categories.map((c, i) => ({
      name: i < state.shown ? c.name : null,
      clues: c.clues.map((clue) => ({ value: i < state.shown ? clue.value : null, used: (n++ * 7) % 10 < state.usedRatio * 10 })),
    })),
    categoriesShown: state.shown >= r.categories.length ? null : state.shown,
  }
})

function onSelect(category: number, clue: number) {
  console.log('select', category, clue)
}
</script>

<template>
  <Story title="BoardGrid" group="components" :layout="{ type: 'single', iframe: false }">
    <template #controls>
      <HstSlider v-model="state.round" title="Round" :min="0" :max="board.rounds.length - 1" :step="1" />
      <HstSlider v-model="state.usedRatio" title="Used" :min="0" :max="1" :step="0.1" />
      <HstCheckbox v-model="state.selectable" title="Selectable (host)" />
      <HstSlider v-model="state.shown" title="Categories shown (round intro)" :min="0" :max="5" :step="1" />
    </template>
    <Variant title="Board">
      <BoardGrid :round="round" :selectable="state.selectable" @select="onSelect" />
    </Variant>
    <Variant title="With Daily Doubles marked (host)">
      <BoardGrid :round="round" selectable :daily-doubles="[`${state.round}-1-3`, `${state.round}-3-1`]" @select="onSelect" />
    </Variant>
  </Story>
</template>
