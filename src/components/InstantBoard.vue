<script setup lang="ts">
import { onUnmounted, ref, shallowRef, watch } from 'vue'
import { fetchCategories, generateBoard, type InstantOptions, type OtdbCategory } from '@/content/opentdb'
import type { Board } from '@/content/schema'
import { useStorages } from '@/storage'

/**
 * Makes a board from Open Trivia DB. With `options`, the editor's form: rounds, final, categories to pick.
 * Without, a one-click button with the defaults (host lobby). `onReady` is a prop rather than an event so
 * that when it fails (say, the draft can't be saved), the error shows here.
 */
const props = defineProps<{ options?: boolean; onReady: (board: Board) => void }>()
/** True while a board is being made. */
const busy = defineModel<boolean>('busy', { default: false })

const { local } = useStorages()
const rounds = ref<1 | 2>(2)
const withFinal = ref(true)
const picked = ref<number[]>([])
const categories = shallowRef<OtdbCategory[]>([])
const progress = ref<{ done: number; total: number } | null>(null)
const error = ref('')
const notice = ref('')
let controller: AbortController | null = null
onUnmounted(() => controller?.abort())
// Fewer rounds have room for fewer picks.
watch(rounds, (n) => (picked.value = picked.value.slice(0, n * 5)))

// Bound like this, not passed as `fetch` itself: browsers refuse a fetch called on another object.
const api = { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) }

let loading: Promise<OtdbCategory[]> | null = null
/** The category list, fetched once (and once at a time). */
function loadCategories(): Promise<OtdbCategory[]> {
  loading ??= fetchCategories(api).then(
    (list) => (categories.value = list),
    (e) => {
      loading = null
      throw e
    },
  )
  return loading
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
  notice.value = ''
  progress.value = { done: 0, total: 0 }
  busy.value = true
  try {
    const { board, skipped } = await generateBoard(await loadCategories(), options, {
      ...api,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      storage: local,
      signal,
      onProgress: (done, total) => (progress.value = { done, total }),
    })
    if (skipped.length) notice.value = `Not enough questions in ${skipped.join(', ')}: used random categories instead.`
    try {
      props.onReady(board)
    } catch (e) {
      error.value = `Could not use the board: ${(e as Error).message}`
    }
  } catch (e) {
    if (!signal.aborted) error.value = `Open Trivia DB: ${(e as Error).message}`
  } finally {
    if (!signal.aborted) {
      progress.value = null
      busy.value = false
    }
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
    <div v-if="progress" class="stack progress" role="progressbar" :aria-valuenow="progress.done" :aria-valuemax="progress.total">
      <div class="bar"><div :style="{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }" /></div>
      <small class="muted">
        Fetching questions… {{ progress.total ? `${progress.done}/${progress.total}` : '' }} (Open Trivia DB allows one request per 5
        seconds)
      </small>
    </div>
    <p v-if="notice" class="warn-note">{{ notice }}</p>
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
  gap: 0.2em;
}
.progress .bar {
  height: 0.4em;
}
</style>
