<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { allBoards, deleteDraft, downloadJson, loadDrafts, saveDraft, type BoardEntry } from '@/content/boards'
import { emptyBoard, validateBoard, type Board, type Clue } from '@/content/schema'

const props = defineProps<{ boardId?: string }>()
const router = useRouter()

const boards = shallowRef<BoardEntry[]>(allBoards())
const draft = ref<Board | null>(null)
/** Id the draft is currently saved under, so renaming the id moves it. */
const savedId = ref<string | null>(null)
const roundIndex = ref(0)
const selected = ref<{ category: number; clue: number } | null>(null)
const showJson = ref(false)
const jsonText = ref('')
const jsonError = ref('')
const importError = ref('')

const validation = computed(() => (draft.value ? validateBoard(draft.value) : null))
const issues = computed(() => (validation.value && !validation.value.ok ? validation.value.issues : []))
const round = computed(() => draft.value?.rounds[roundIndex.value] ?? null)
const selectedClue = computed<Clue | null>(() => {
  const s = selected.value
  return s ? (round.value?.categories[s.category]?.clues[s.clue] ?? null) : null
})
const rows = computed(() => round.value?.categories[0]?.clues.length ?? 0)

function refresh() {
  boards.value = allBoards()
}

/** Set while loading a board so that merely opening it doesn't save a draft. */
let loading = false

function open(id: string | undefined) {
  // Our own URL update after saving under a new id.
  if (id && id === savedId.value && draft.value) return
  loading = true
  selected.value = null
  roundIndex.value = 0
  showJson.value = false
  if (!id) {
    draft.value = null
    savedId.value = null
    return
  }
  const drafts = loadDrafts()
  const raw = drafts[id] ?? boards.value.find((b) => b.id === id)?.board
  if (!raw) {
    draft.value = null
    return
  }
  draft.value = normalize(structuredClone(raw))
  // Repo boards become drafts on first edit; the file itself is only changed by exporting.
  savedId.value = id in drafts ? id : null
}

/** Makes a possibly half-valid stored draft safe to bind to the form. */
function normalize(raw: unknown): Board {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Partial<Board>
  return {
    ...b,
    id: typeof b.id === 'string' ? b.id : 'untitled',
    title: typeof b.title === 'string' ? b.title : 'Untitled',
    rounds: Array.isArray(b.rounds) && b.rounds.length ? b.rounds : emptyBoard().rounds,
  } as Board
}

watch(() => props.boardId, open, { immediate: true })

watch(
  draft,
  (board) => {
    if (loading) {
      loading = false
      return
    }
    if (!board || board.id === '') return
    saveDraft(board.id, JSON.parse(JSON.stringify(board)), savedId.value ?? undefined)
    if (savedId.value !== board.id) {
      savedId.value = board.id
      router.replace({ name: 'editor', params: { boardId: board.id } })
    }
    refresh()
  },
  { deep: true },
)

function uniqueId(base: string) {
  const taken = new Set(boards.value.map((b) => b.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

function newBoard() {
  const id = uniqueId('new-board')
  saveDraft(id, emptyBoard(id))
  refresh()
  router.push({ name: 'editor', params: { boardId: id } })
}

function duplicate() {
  if (!draft.value) return
  const id = uniqueId(`${draft.value.id}-copy`)
  saveDraft(id, { ...JSON.parse(JSON.stringify(draft.value)), id, title: `${draft.value.title} (copy)` })
  refresh()
  router.push({ name: 'editor', params: { boardId: id } })
}

function removeDraft() {
  if (!savedId.value || !confirm('Delete this draft? Boards stored as files in the repo are not affected.')) return
  deleteDraft(savedId.value)
  savedId.value = null
  refresh()
  router.push({ name: 'editor' })
}

async function importFile(event: Event) {
  importError.value = ''
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const raw = JSON.parse(await file.text())
    const board = normalize(raw)
    const id = uniqueId(board.id.replace(/[^a-z0-9-]/g, '-').toLowerCase() || 'imported')
    saveDraft(id, { ...raw, id })
    refresh()
    router.push({ name: 'editor', params: { boardId: id } })
  } catch (e) {
    importError.value = `Could not read ${file.name}: ${(e as Error).message}`
  } finally {
    ;(event.target as HTMLInputElement).value = ''
  }
}

function exportBoard() {
  if (!draft.value) return
  downloadJson(`${draft.value.id}.json`, { $schema: './board.schema.json', ...draft.value })
}

/* ---- structure editing ---- */

function addRound() {
  if (!draft.value) return
  const previous = draft.value.rounds.at(-1)
  const template = emptyBoard().rounds[0]!
  if (previous) {
    // Same shape as the previous round, values doubled.
    template.categories = previous.categories.map((c, i) => ({
      name: `Category ${i + 1}`,
      clues: c.clues.map((clue) => ({ value: clue.value * 2, clue: '', answer: '' })),
    }))
  }
  template.name = `Round ${draft.value.rounds.length + 1}`
  draft.value.rounds.push(template)
  roundIndex.value = draft.value.rounds.length - 1
  selected.value = null
}

function removeRound() {
  if (!draft.value || draft.value.rounds.length <= 1) return
  if (!confirm(`Delete ${round.value?.name}?`)) return
  draft.value.rounds.splice(roundIndex.value, 1)
  roundIndex.value = Math.max(0, roundIndex.value - 1)
  selected.value = null
}

function addCategory() {
  const r = round.value
  if (!r) return
  const values = r.categories[0]?.clues.map((c) => c.value) ?? [200, 400, 600, 800, 1000]
  r.categories.push({ name: `Category ${r.categories.length + 1}`, clues: values.map((value) => ({ value, clue: '', answer: '' })) })
}

function removeCategory(c: number) {
  const r = round.value
  if (!r || r.categories.length <= 1 || !confirm(`Delete category "${r.categories[c]?.name}"?`)) return
  r.categories.splice(c, 1)
  selected.value = null
}

function addRow() {
  const r = round.value
  if (!r) return
  for (const category of r.categories) {
    const last = category.clues.at(-1)?.value ?? 0
    const step = category.clues.length > 1 ? last - category.clues.at(-2)!.value : last || 200
    category.clues.push({ value: last + step, clue: '', answer: '' })
  }
}

function removeRow() {
  const r = round.value
  if (!r || rows.value <= 1) return
  r.categories.forEach((category) => category.clues.pop())
  selected.value = null
}

function toggleFinal() {
  if (!draft.value) return
  if (draft.value.final) {
    if (confirm('Remove the final round?')) delete draft.value.final
  } else {
    draft.value.final = { category: '', clue: '', answer: '' }
  }
}

function setMedia(clue: Clue, type: string) {
  if (!type) delete clue.media
  else clue.media = { type: type as 'image' | 'audio' | 'video', src: clue.media?.src ?? '' }
}

function cellIssue(c: number, i: number) {
  const prefix = `rounds.${roundIndex.value}.categories.${c}.clues.${i}`
  return issues.value.some((issue) => issue.path.startsWith(prefix))
}

function openJson() {
  jsonText.value = JSON.stringify(draft.value, null, 2)
  jsonError.value = ''
  showJson.value = true
}

function applyJson() {
  try {
    const parsed = normalize(JSON.parse(jsonText.value))
    draft.value = parsed
    roundIndex.value = Math.min(roundIndex.value, parsed.rounds.length - 1)
    selected.value = null
    showJson.value = false
  } catch (e) {
    jsonError.value = (e as Error).message
  }
}
</script>

<template>
  <main class="editor">
    <aside class="panel stack list">
      <div class="row">
        <RouterLink to="/" class="muted">← Home</RouterLink>
      </div>
      <h2>Boards</h2>
      <div class="row">
        <button class="small primary" @click="newBoard">New</button>
        <label class="btn small file">
          Import JSON
          <input type="file" accept="application/json,.json" @change="importFile" />
        </label>
      </div>
      <p v-if="importError" class="error">{{ importError }}</p>
      <RouterLink
        v-for="b in boards"
        :key="`${b.source}:${b.id}`"
        :to="{ name: 'editor', params: { boardId: b.id } }"
        class="entry"
        :class="{ active: b.id === boardId }"
      >
        <span>{{ b.title }}</span>
        <span class="row">
          <span class="pill">{{ b.source === 'draft' ? 'draft' : 'file' }}</span>
          <span v-if="!b.board" class="pill bad">{{ b.issues.length }} issues</span>
        </span>
      </RouterLink>
      <p class="muted hint">
        Drafts live in this browser. To keep a board in the repo, export it into <code>boards/</code>.
      </p>
    </aside>

    <section v-if="!draft" class="panel center">
      <p class="muted">Pick a board on the left, or create a new one.</p>
    </section>

    <section v-else class="stack">
      <div class="panel stack">
        <div class="row">
          <label class="grow">Title <input v-model="draft.title" /></label>
          <label>Id <input v-model.trim="draft.id" /></label>
        </div>
        <div class="row">
          <span v-if="issues.length === 0" class="pill ok">Valid – ready to play</span>
          <span v-else class="pill bad">{{ issues.length }} problem(s)</span>
          <span class="muted">{{ savedId ? 'Saved as draft' : 'Viewing file – edits create a draft' }}</span>
          <span class="spacer" />
          <button class="small" @click="openJson">Edit JSON</button>
          <button class="small" @click="duplicate">Duplicate</button>
          <button class="small primary" @click="exportBoard">Export JSON</button>
          <button v-if="savedId" class="small bad" @click="removeDraft">Delete draft</button>
        </div>
        <ul v-if="issues.length" class="issues">
          <li v-for="(issue, i) in issues.slice(0, 8)" :key="i">
            <code>{{ issue.path || 'board' }}</code> {{ issue.message }}
          </li>
          <li v-if="issues.length > 8" class="muted">…and {{ issues.length - 8 }} more</li>
        </ul>
      </div>

      <div v-if="showJson" class="panel stack">
        <textarea v-model="jsonText" rows="24" class="json" spellcheck="false" />
        <p v-if="jsonError" class="error">{{ jsonError }}</p>
        <div class="row">
          <button class="primary" @click="applyJson">Apply</button>
          <button @click="showJson = false">Cancel</button>
        </div>
      </div>

      <template v-else>
        <div class="row tabs">
          <button
            v-for="(r, i) in draft.rounds"
            :key="i"
            :class="{ primary: i === roundIndex }"
            @click="((roundIndex = i), (selected = null))"
          >
            {{ r.name || `Round ${i + 1}` }}
          </button>
          <button class="ghost" @click="addRound">+ Round</button>
          <button class="ghost" :class="{ primary: !!draft.final }" @click="toggleFinal">
            {{ draft.final ? '− Final round' : '+ Final round' }}
          </button>
        </div>

        <div v-if="round" class="panel stack">
          <div class="row">
            <label class="grow">Round name <input v-model="round.name" /></label>
            <label>
              Random Daily Doubles
              <input
                type="number"
                min="0"
                :value="round.randomDailyDoubles ?? 0"
                @input="round.randomDailyDoubles = Number(($event.target as HTMLInputElement).value) || undefined"
              />
            </label>
            <button class="small bad" :disabled="draft.rounds.length <= 1" @click="removeRound">Delete round</button>
          </div>

          <div class="grid" :style="{ '--cols': round.categories.length }">
            <div v-for="(category, c) in round.categories" :key="`h${c}`" class="head">
              <input v-model="category.name" placeholder="Category" />
              <button class="small ghost" title="Delete category" @click="removeCategory(c)">✕</button>
            </div>
            <template v-for="i in rows" :key="i">
              <button
                v-for="(category, c) in round.categories"
                :key="`${c}-${i}`"
                class="cell"
                :class="{
                  active: selected?.category === c && selected?.clue === i - 1,
                  bad: cellIssue(c, i - 1),
                  dd: category.clues[i - 1]?.dailyDouble,
                }"
                @click="selected = { category: c, clue: i - 1 }"
              >
                <span class="value">{{ category.clues[i - 1]?.value }}</span>
                <small class="preview">{{ category.clues[i - 1]?.clue || 'empty' }}</small>
              </button>
            </template>
          </div>
          <div class="row">
            <button class="small" @click="addCategory">+ Category</button>
            <button class="small" @click="addRow">+ Row</button>
            <button class="small" :disabled="rows <= 1" @click="removeRow">− Row</button>
            <span class="muted">Gold border = Daily Double · red = has problems</span>
          </div>
        </div>

        <div v-if="selectedClue && selected" class="panel stack">
          <h3>{{ round?.categories[selected.category]?.name }} · {{ selectedClue.value }}</h3>
          <div class="row">
            <label>Value <input v-model.number="selectedClue.value" type="number" min="1" /></label>
            <label class="check">
              <input v-model="selectedClue.dailyDouble" type="checkbox" />
              Daily Double
            </label>
          </div>
          <label>Clue (shown to everyone) <textarea v-model="selectedClue.clue" rows="3" /></label>
          <label>Answer (host only until revealed) <input v-model="selectedClue.answer" /></label>
          <label>Host notes (optional, never shown to players) <input v-model="selectedClue.notes" /></label>
          <div class="row">
            <label>
              Media
              <select :value="selectedClue.media?.type ?? ''" @change="setMedia(selectedClue, ($event.target as HTMLSelectElement).value)">
                <option value="">None</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label v-if="selectedClue.media" class="grow">
              URL (direct link to the file, e.g. https://example.com/pic.jpg)
              <input v-model="selectedClue.media.src" />
            </label>
          </div>
        </div>

        <div v-if="draft.final" class="panel stack">
          <h3>Final round</h3>
          <label>Category <input v-model="draft.final.category" /></label>
          <label>Clue <textarea v-model="draft.final.clue" rows="3" /></label>
          <label>Answer <input v-model="draft.final.answer" /></label>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.editor {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 1rem;
  padding: 12px 16px;
  align-items: start;
}
@media (max-width: 800px) {
  .editor {
    grid-template-columns: 1fr;
  }
}
.list {
  position: sticky;
  top: 12px;
}
.entry {
  display: grid;
  gap: 0.2em;
  padding: 0.5em 0.6em;
  border-radius: 8px;
  color: var(--text);
  text-decoration: none;
  background: var(--panel-2);
}
.entry.active {
  outline: 2px solid var(--gold);
}
.file input {
  display: none;
}
.hint {
  font-size: 0.85em;
}
.center {
  display: grid;
  place-items: center;
  min-height: 200px;
}
.grow {
  flex: 1;
  min-width: 200px;
}
.issues {
  margin: 0;
  padding-left: 1.2em;
  color: #ffb4b6;
}
.tabs {
  gap: 0.4rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: 4px;
  background: var(--cell-border);
  padding: 4px;
  border-radius: var(--radius);
  overflow-x: auto;
}
.head {
  display: flex;
  gap: 2px;
  background: var(--cell-bg);
  padding: 4px;
  border-radius: 4px;
}
.head input {
  font-weight: 700;
  padding: 0.3em;
  min-width: 0;
}
.cell {
  background: var(--cell-bg);
  border-radius: 4px;
  display: grid;
  gap: 0.2em;
  padding: 0.5em 0.3em;
  min-height: 4.5em;
  min-width: 0;
}
.cell .value {
  font-size: 1.3em;
}
.cell.active {
  outline: 3px solid var(--accent);
}
.cell.dd {
  box-shadow: inset 0 0 0 3px var(--gold);
}
.cell.bad .value {
  color: #ff8c8f;
}
.preview {
  font-size: 0.72em;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.json {
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
}
</style>
