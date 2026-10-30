<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_REVEAL_SECONDS, safeMedia, type Clue, type Final, type Media } from '@/content/schema'
import SourceLine from './SourceLine.vue'

/** Host-only details next to the answer: other accepted answers, the media, and the source for disputes. */
const props = defineProps<{ item: Clue | Final }>()

const KIND = { image: 'picture', audio: 'audio', video: 'video' } as const

function describe(media: Media): string {
  const parts: string[] = [KIND[media.type]]
  if (media.start !== undefined || media.end !== undefined) parts.push(`${media.start ?? 0}–${media.end ?? 'end'} s`)
  if (media.reveal) {
    parts.push(`blur reveal ${media.reveal.seconds ?? DEFAULT_REVEAL_SECONDS} s`)
    if (media.reveal.shrinkPoints) parts.push('points shrink')
  }
  return parts.join(', ')
}

const media = computed(() => safeMedia(props.item.media))
const answerMedia = computed(() => safeMedia(props.item.answerMedia))
</script>

<template>
  <span v-if="item.acceptedAnswers?.length" class="muted">Also accept: {{ item.acceptedAnswers.join(' · ') }}</span>
  <span v-if="media" class="muted">
    Clue: <a :href="media.src" target="_blank" rel="noopener noreferrer">{{ describe(media) }}</a>
  </span>
  <span v-if="answerMedia" class="muted">
    On reveal: <a :href="answerMedia.src" target="_blank" rel="noopener noreferrer">{{ describe(answerMedia) }}</a>
  </span>
  <SourceLine :source="item.source" :url="item.sourceUrl" />
</template>
