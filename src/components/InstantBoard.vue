<script setup lang="ts">
import { onUnmounted, ref, shallowRef } from 'vue'
import { fetchCategories, generateBoard, type InstantOptions, type OtdbCategory } from '@/content/opentdb'
import type { Board } from '@/content/schema'
import { useStorages } from '@/storage'

/**
 * Makes a board from Open Trivia DB. With `options`, the editor's form: rounds, final, categories to pick.
 * Without, a one-click button with the defaults (host lobby).
 */
defineProps<{ options?: boolean }>()
const emit = defineEmits<{ ready: [board: Board] }>()

const { local } = useStorages()
const rounds = ref<1 | 2>(2)
const withFinal = ref(true)
const picked = ref<number[]>([])
const categories = shallowRef<OtdbCategory[]>([])
const progress = ref<{ done: number; total: number } | null>(null)
const error = ref('')
let controller: AbortController | null = null
onUnmounted(() => controller?.abort())

// Bound like this, not passed as `fetch` itself: browsers refuse a fetch called on another object.
const api = { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }

async function loadCategories() {
  if (categories.value.length) return categories.value
  categories.value = await fetchCategories(api)
  return categories.value
}

async function showOptions(event: Event) {
  if (!(event.target as HTMLDetailsElement).open) return
  error.value = ''
  await loadCategories().catch((e: Error) => (error.value = `Could not reach Open Trivia DB: ${e.message}`))
}

async function generate() {
  controller?.abort()
  controller = new AbortController()
  const { signal } = controller
  const options: InstantOptions = { rounds: rounds.value, final: withFinal.value, categories: picked.value }
  error.value = ''
  progress.value = { done: 0, total: options.rounds * 5 + (options.final ? 1 : 0) }
  try {
    const board = await generateBoard(await loadCategories(), options, {
      ...api,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      storage: local,
      signal,
      onProgress: (done, total) => (progress.value = { done, total }),
    })
    emit('ready', board)
  } catch (e) {
    if (!signal.aborted) error.value = `Open Trivia DB: ${(e as Error).message}`
  } finally {
    if (!signal.aborted) progress.value = null
  }
}
</script>

<template>
  <div class="instant stack">
    <details v-if="options" @toggle="showOptions">
      <summary>New from Open Trivia DB</summary>
      <div class="stack">
        <label class="inline">
          Rounds
          <select v-model.number="rounds">
            <option :value="1">1 (under a minute to make)</option>
            <option :value="2">2 (a minute or two)</option>
          </select>
        </label>
        <label class="check"><input v-model="withFinal" type="checkbox" /> Final round</label>
        <fieldset v-if="categories.length" class="categories">
          <legend>Categories (pick up to {{ rounds * 5 }}; random fills the rest)</legend>
          <label v-for="c in categories" :key="c.id" class="check">
            <input v-model="picked" type="checkbox" :value="c.id" :disabled="!picked.includes(c.id) && picked.length >= rounds * 5" />
            {{ c.name }}
          </label>
        </fieldset>
        <button class="small primary" :disabled="!!progress" @click="generate">Make board</button>
      </div>
    </details>
    <button v-else class="small" :disabled="!!progress" @click="generate">⚡ Instant board (Open Trivia DB)</button>
    <div v-if="progress" class="progress" role="progressbar" :aria-valuenow="progress.done" :aria-valuemax="progress.total">
      <div :style="{ width: `${(progress.done / progress.total) * 100}%` }" />
      <small class="muted">Fetching questions… {{ progress.done }}/{{ progress.total }} (Open Trivia DB allows one request per 5 seconds)</small>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.categories {
  max-height: 14em;
  overflow-y: auto;
  border: 1px solid var(--panel-2);
  border-radius: 8px;
  display: grid;
}
.progress {
  display: grid;
  gap: 0.2em;
}
.progress div {
  height: 0.4em;
  background: var(--gold);
  border-radius: 1em;
  transition: width 0.3s;
}
.inline {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
</style>
