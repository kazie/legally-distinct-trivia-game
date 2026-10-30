<script setup lang="ts">
import type { Media } from '@/content/schema'
import MediaView from './MediaView.vue'

defineProps<{ text: string; media?: Media | null; progress?: number | null }>()
</script>

<template>
  <div class="clue serif">
    <MediaView :media="media" :progress="progress" />
    <div>{{ text }}</div>
  </div>
</template>

<style scoped>
.clue {
  text-transform: uppercase;
  text-align: center;
  text-shadow: 3px 3px 0 #000a;
  line-height: 1.25;
  display: grid;
  gap: 0.6em;
  justify-items: center;
}
</style>
