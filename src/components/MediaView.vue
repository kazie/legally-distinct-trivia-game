<script setup lang="ts">
import { computed } from 'vue'
import { safeMedia, type Media } from '@/content/schema'

const props = withDefaults(
  defineProps<{
    media: Media | null | undefined
    /** Blur reveal: 0 fully blurred … 1 sharp. Leave out for a sharp picture. */
    progress?: number | null
    preload?: 'none' | 'metadata' | 'auto'
  }>(),
  { progress: null, preload: 'metadata' },
)

const MAX_BLUR_PX = 40

const safe = computed(() => safeMedia(props.media))
const blur = computed(() => (props.progress === null ? undefined : { filter: `blur(${(1 - props.progress) * MAX_BLUR_PX}px)` }))
/** The `#t=start,end` fragment makes browsers load and start at the clip; the handlers below enforce it. */
const src = computed(() => {
  const m = safe.value
  if (!m || (m.start === undefined && m.end === undefined)) return m?.src
  return `${m.src.split('#')[0]}#t=${m.start ?? 0}${m.end === undefined ? '' : `,${m.end}`}`
})

/** Play (and replay after the clip ended) from the clip's start. */
function onPlay(event: Event) {
  const el = event.target as HTMLMediaElement
  const { start = 0, end } = safe.value ?? {}
  if (el.currentTime < start || (end !== undefined && el.currentTime >= end)) el.currentTime = start
}

function onTimeUpdate(event: Event) {
  const el = event.target as HTMLMediaElement
  const end = safe.value?.end
  if (end !== undefined && el.currentTime >= end) el.pause()
}
</script>

<template>
  <div v-if="safe?.type === 'image'" class="frame">
    <img :src="safe.src" alt="" class="media" :class="{ blurring: blur }" :style="blur" />
  </div>
  <audio
    v-else-if="safe?.type === 'audio'"
    :src="src"
    controls
    :preload="preload"
    class="media"
    @play="onPlay"
    @timeupdate="onTimeUpdate"
  />
  <video
    v-else-if="safe?.type === 'video'"
    :src="src"
    controls
    playsinline
    :preload="preload"
    class="media"
    @play="onPlay"
    @timeupdate="onTimeUpdate"
  />
</template>

<style scoped>
.media {
  display: block;
  max-width: min(100%, 640px);
  max-height: 40vh;
  border-radius: 8px;
}
/* Keeps the blur's soft edge inside the picture's box. */
.frame {
  overflow: hidden;
  border-radius: 8px;
  max-width: 100%;
}
.blurring {
  /* Matches the client clock tick, so the picture sharpens smoothly. */
  transition: filter 0.25s linear;
}
</style>
