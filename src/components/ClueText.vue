<script setup lang="ts">
import type { Media } from '@/content/schema'

defineProps<{ text: string; media?: Media | null }>()
</script>

<template>
  <div class="clue serif">
    <img v-if="media?.type === 'image'" :src="media.src" alt="" class="media" />
    <audio v-else-if="media?.type === 'audio'" :src="media.src" controls class="media" />
    <video v-else-if="media?.type === 'video'" :src="media.src" controls class="media" />
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
.media {
  max-width: min(100%, 640px);
  max-height: 40vh;
  border-radius: 8px;
}
</style>
