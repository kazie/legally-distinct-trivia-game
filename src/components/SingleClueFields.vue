<script setup lang="ts">
import type { Final } from '@/content/schema'
import AnswerFields from './AnswerFields.vue'
import MediaFields from './MediaFields.vue'

/** Editor panel for a clue outside the grid (final round, tie-breaker). Edits the draft object in place. */
defineProps<{ item: Final; title: string; hint?: string }>()
</script>

<template>
  <div class="panel stack">
    <h3>{{ title }}</h3>
    <p v-if="hint" class="muted">{{ hint }}</p>
    <label>Category <input v-model="item.category" /></label>
    <label>Clue <textarea v-model="item.clue" rows="3" /></label>
    <label>Answer <input v-model="item.answer" /></label>
    <label>Host notes (optional) <input v-model="item.notes" /></label>
    <MediaFields v-model="item.media" label="Media" />
    <MediaFields v-model="item.answerMedia" label="Answer media (shown with the answer)" />
    <AnswerFields :item="item" />
  </div>
</template>
