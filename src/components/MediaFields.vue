<script setup lang="ts">
import { DEFAULT_REVEAL_SECONDS, type Media } from '@/content/schema'

/** Editor fields for one media slot (clue media or answer media). Edits the draft object in place. */
const media = defineModel<Media | undefined>()
defineProps<{ label: string; /** Offer the blur reveal (clue pictures only). */ canReveal?: boolean }>()

function setType(type: string) {
  // A new type keeps only the link: clip times and reveals belong to one kind of media.
  media.value = type ? { type: type as Media['type'], src: media.value?.src ?? '' } : undefined
}

/** Empty clears an optional number, so the JSON stays tidy. */
function setNumber<K extends 'start' | 'end'>(m: Media, key: K, raw: string) {
  if (raw === '') delete m[key]
  else m[key] = Number(raw)
}

function setRevealSeconds(m: Media, raw: string) {
  if (!m.reveal) return
  if (raw === '') delete m.reveal.seconds
  else m.reveal.seconds = Number(raw)
}

function toggleReveal(m: Media, on: boolean) {
  if (on) m.reveal = { style: 'blur' }
  else delete m.reveal
}
</script>

<template>
  <div class="stack">
    <div class="row">
      <label>
        {{ label }}
        <select :value="media?.type ?? ''" @change="setType(($event.target as HTMLSelectElement).value)">
          <option value="">None</option>
          <option value="image">Image</option>
          <option value="audio">Audio</option>
          <option value="video">Video</option>
        </select>
      </label>
      <label v-if="media" class="grow">
        URL (direct link to the file, e.g. https://example.com/pic.jpg)
        <input v-model="media.src" />
      </label>
    </div>
    <div v-if="media && media.type !== 'image'" class="row">
      <label>
        Start (s)
        <input type="number" min="0" step="0.1" :value="media.start ?? ''" placeholder="0" @input="setNumber(media, 'start', ($event.target as HTMLInputElement).value)" />
      </label>
      <label>
        End (s)
        <input type="number" min="0" step="0.1" :value="media.end ?? ''" placeholder="end" @input="setNumber(media, 'end', ($event.target as HTMLInputElement).value)" />
      </label>
      <span class="muted">Plays only this part of the file.</span>
    </div>
    <div v-if="media?.type === 'image' && canReveal" class="row">
      <label class="check">
        <input type="checkbox" :checked="!!media.reveal" @change="toggleReveal(media, ($event.target as HTMLInputElement).checked)" />
        Blur reveal: sharpens while buzzers are open
      </label>
      <template v-if="media.reveal">
        <label>
          Seconds
          <input
            type="number"
            min="3"
            max="120"
            :value="media.reveal.seconds ?? ''"
            :placeholder="String(DEFAULT_REVEAL_SECONDS)"
            @input="setRevealSeconds(media, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="check">
          <input v-model="media.reveal.shrinkPoints" type="checkbox" />
          Points shrink to half as it sharpens
        </label>
      </template>
    </div>
  </div>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 200px;
}
input[type='number'] {
  width: 6em;
}
</style>
