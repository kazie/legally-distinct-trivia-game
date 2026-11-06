<script setup lang="ts">
import type { Media } from '@/content/schema'
import MediaView from './MediaView.vue'

defineProps<{ text: string; media?: Media | null; progress?: number | null }>()
</script>

<template>
  <div class="clue-body serif">
    <MediaView :media="media" :progress="progress" />
    <div>{{ text }}</div>
  </div>
</template>

<style scoped>
.clue-body {
  text-transform: uppercase;
  text-align: center;
  text-shadow: 2px 2px 0 var(--shadow-text);
  line-height: 1.25;
  text-wrap: balance;
  display: grid;
  gap: 0.6em;
  justify-items: center;
}
</style>
