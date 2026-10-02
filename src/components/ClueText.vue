<script setup lang="ts">
import { computed } from 'vue'
import { safeMedia as checkMedia, type Media } from '@/content/schema'

const props = defineProps<{ text: string; media?: Media | null }>()
const safeMedia = computed(() => checkMedia(props.media))
</script>

<template>
  <div class="clue serif">
    <img v-if="safeMedia?.type === 'image'" :src="safeMedia.src" alt="" class="media" />
    <audio v-else-if="safeMedia?.type === 'audio'" :src="safeMedia.src" controls class="media" />
    <video v-else-if="safeMedia?.type === 'video'" :src="safeMedia.src" controls class="media" />
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
