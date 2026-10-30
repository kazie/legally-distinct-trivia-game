<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { checkAllMedia, collectMedia, type MediaStatus } from '@/content/mediaCheck'
import type { Board } from '@/content/schema'

/**
 * Loads every picture, sound and video in a board and lists the ones that don't load. `auto` checks whenever
 * the board's media change (host lobby); otherwise there's a button (editor). Pictures end up in the browser's
 * cache, so a board screen in the same browser shows them right away.
 */
const props = defineProps<{ board: Board | null; auto?: boolean }>()
const emit = defineEmits<{ select: [path: string] }>()

const items = computed(() => (props.board ? collectMedia(props.board) : []))
const results = shallowRef<Map<string, MediaStatus> | null>(null)
const running = ref(false)
let runId = 0

async function check() {
  const id = ++runId
  running.value = true
  results.value = null
  const found = await checkAllMedia(items.value.map((i) => i.media))
  if (id !== runId) return
  results.value = found
  running.value = false
}

const problems = computed(() => {
  const r = results.value
  if (!r) return []
  return items.value.map((item) => ({ ...item, status: r.get(item.media.src) })).filter((p) => p.status && p.status !== 'ok')
})

if (props.auto) {
  watch(
    () => items.value.map((i) => i.media.src).join('\n'),
    (srcs) => srcs && check(),
    { immediate: true },
  )
}
onUnmounted(() => runId++)
</script>

<template>
  <div v-if="items.length" class="media-check">
    <div class="row">
      <button v-if="!auto" class="small" :disabled="running" @click="check">Check media</button>
      <span v-if="running" class="muted">Checking {{ items.length }} media…</span>
      <span v-else-if="results && !problems.length" class="ok-note">Media: {{ items.length }}/{{ items.length }} OK</span>
      <span v-else-if="results" class="warn-note">Media: {{ items.length - problems.length }}/{{ items.length }} OK</span>
    </div>
    <ul v-if="problems.length" class="problems">
      <li v-for="p in problems" :key="p.path">
        <button class="link" @click="emit('select', p.path)">{{ p.label }}</button>
        {{ p.status === 'timeout' ? 'took too long to load' : "doesn't load" }}:
        <a :href="p.media.src" target="_blank" rel="noopener noreferrer">{{ p.media.src }}</a>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.media-check {
  display: grid;
  gap: 0.3rem;
}
.problems {
  margin: 0;
  padding-left: 1.2em;
  color: var(--warn);
  overflow-wrap: anywhere;
}
</style>
