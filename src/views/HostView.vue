<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import BoardGrid from '@/components/BoardGrid.vue'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import JoinQr from '@/components/JoinQr.vue'
import { BUZZ_EMOJIS, formatSeconds, pickBuzzTarget } from '@/game/buzzPad'
import { allBoards, type BoardEntry } from '@/content/boards'
import { ddMaxWager, pickDailyDoubles, type Action } from '@/game/engine'
import { HostController } from '@/game/hostController'
import { toPublicState } from '@/game/publicView'
import { useBridge } from '@/net/useBridge'
import type { ConnectionStatus } from '@/net/bridgeClient'
import { EMOJI_ON_PHONES_KEY, LAST_HOST_ROOM_KEY, SHOW_INTRO_KEY, useStorages } from '@/storage'

const props = defineProps<{ room: string }>()

const bridge = useBridge()
const { local } = useStorages()
const host = new HostController({ bridge, roomCode: props.room, storage: local })
const game = host.state
const connection = ref<ConnectionStatus>('closed')
const clock = ref(Date.now())
const pub = computed(() => toPublicState(game.value, clock.value))

const boards = shallowRef<BoardEntry[]>(allBoards())
const selectedBoardKey = ref(game.value.board ? `${boardSource(game.value.board.id)}:${game.value.board.id}` : '')
const finalSeconds = ref(30)
const wagerInput = ref<number | null>(null)
const adjust = ref<Record<string, number | null>>({})
const showIntro = ref(local?.getItem(SHOW_INTRO_KEY) !== 'false')
const emojiOnPhones = ref(local?.getItem(EMOJI_ON_PHONES_KEY) === 'true')

const joinUrl = `${location.origin}/play/${props.room}`
const boardUrl = `${location.origin}/board/${props.room}`

const cur = computed(() => game.value.current)
const final = computed(() => game.value.final)
const board = computed(() => game.value.board)
const clue = computed(() => {
  const c = cur.value
  return c ? board.value?.rounds[c.ref.round]?.categories[c.ref.category]?.clues[c.ref.clue] : undefined
})
const categoryName = computed(() => {
  const c = cur.value
  return c ? board.value?.rounds[c.ref.round]?.categories[c.ref.category]?.name : undefined
})
const nameOf = (id: string | null | undefined) => game.value.players.find((p) => p.id === id)?.name ?? '—'
const connectedIds = computed(() => new Set(pub.value.players.filter((p) => p.connected).map((p) => p.id)))
const judgingId = computed(() => final.value?.order[final.value.index] ?? null)
const practice = computed(() => game.value.practice)

function boardSource(id: string) {
  return allBoards().find((b) => b.id === id)?.source ?? 'repo'
}

function act(action: Action) {
  host.dispatch(action)
}

function loadSelectedBoard() {
  const entry = boards.value.find((b) => `${b.source}:${b.id}` === selectedBoardKey.value)
  if (entry?.board) act({ type: 'loadBoard', board: entry.board, dailyDoubles: pickDailyDoubles(entry.board) })
}

function startGame() {
  local?.setItem(SHOW_INTRO_KEY, String(showIntro.value))
  local?.setItem(EMOJI_ON_PHONES_KEY, String(emojiOnPhones.value))
  act({ type: 'startGame', intro: showIntro.value, emojiOnPhones: emojiOnPhones.value })
}

function openPractice() {
  act({ type: 'openPractice', target: pickBuzzTarget(practice.value?.target ?? null) })
}

function selectClue(category: number, clueIndex: number) {
  act({ type: 'selectClue', ref: { round: game.value.round, category, clue: clueIndex } })
  wagerInput.value = null
}

function setHostWager(kind: 'daily' | 'final', id: string | null, amount: number | null) {
  if (!id || amount === null || !Number.isFinite(amount)) return
  act(kind === 'daily' ? { type: 'setDdWager', id, amount } : { type: 'setFinalWager', id, amount })
}

function applyAdjust(id: string, sign: 1 | -1) {
  const amount = adjust.value[id]
  if (!amount) return
  act({ type: 'adjustScore', id, delta: sign * amount })
  adjust.value = { ...adjust.value, [id]: null }
}

function rename(id: string) {
  const name = prompt('New name', nameOf(id))
  if (name) act({ type: 'renamePlayer', id, name })
}

function kick(id: string) {
  if (confirm(`Remove ${nameOf(id)} from the game?`)) act({ type: 'removePlayer', id })
}

function confirmThen(message: string, action: Action) {
  if (confirm(message)) act(action)
}

function copy(text: string) {
  navigator.clipboard?.writeText(text)
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || event.metaKey || event.ctrlKey || event.altKey) return
  const c = cur.value
  const key = event.key.toLowerCase()
  if (key === 'z') return host.undo()
  if (game.value.phase === 'intro' && (key === ' ' || key === 'b')) {
    // Holding the key would otherwise reopen practice on every auto-repeat.
    if (!event.repeat) openPractice()
    return event.preventDefault()
  }
  if (!c) return
  if ((key === ' ' || key === 'b') && (c.status === 'reading' || c.status === 'closed')) act({ type: 'openBuzzers', target: pickBuzzTarget(c.target) })
  else if (key === 'c' && c.status === 'answering') act({ type: 'judge', correct: true })
  else if (key === 'x' && c.status === 'answering') act({ type: 'judge', correct: false })
  else if (key === 'r' && c.status !== 'revealed') act({ type: 'revealAnswer' })
  else if (key === 'enter' && c.status === 'revealed') act({ type: 'returnToBoard' })
  else return
  event.preventDefault()
}

let ticker: ReturnType<typeof setInterval> | undefined
let offStatus: (() => void) | undefined
onMounted(() => {
  local?.setItem(LAST_HOST_ROOM_KEY, props.room)
  host.start()
  offStatus = bridge.onStatus((s) => (connection.value = s))
  ticker = setInterval(() => (clock.value = Date.now()), 1000)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  host.stop()
  offStatus?.()
  clearInterval(ticker)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="host">
    <header class="row topbar">
      <strong class="serif">Host · room <span class="gold code">{{ room }}</span></strong>
      <a :href="boardUrl" target="_blank" class="btn small">Open board screen ↗</a>
      <button class="small" @click="copy(joinUrl)" title="Copy player link">Copy join link</button>
      <span class="spacer" />
      <button class="small" :disabled="!host.canUndo.value" title="Undo (Z)" @click="host.undo()">↶ Undo</button>
      <ConnectionBadge :status="connection" />
    </header>

    <section class="main stack">
      <!-- Lobby -->
      <div v-if="game.phase === 'lobby'" class="panel stack">
        <h2>Set up</h2>
        <div class="lobby">
          <div class="stack">
            <label>
              Board
              <select v-model="selectedBoardKey" @change="loadSelectedBoard">
                <option value="" disabled>Choose a board…</option>
                <option v-for="b in boards" :key="`${b.source}:${b.id}`" :value="`${b.source}:${b.id}`" :disabled="!b.board">
                  {{ b.title }} ({{ b.source === 'draft' ? 'editor draft' : 'file' }}{{ b.board ? '' : `, ${b.issues.length} problems` }})
                </option>
              </select>
            </label>
            <div class="row">
              <button class="small ghost" @click="boards = allBoards()">Refresh list</button>
              <RouterLink class="btn small ghost" :to="{ name: 'editor' }" target="_blank">Open editor ↗</RouterLink>
            </div>
            <div v-if="board" class="muted">
              <strong class="gold">{{ board.title }}</strong> ·
              {{ board.rounds.length }} round(s)
              <template v-for="r in board.rounds" :key="r.name">
                · {{ r.name }}: {{ r.categories.length }}×{{ r.categories[0]?.clues.length }}</template
              >
              <template v-if="board.final"> · final round</template>
              · {{ game.dailyDoubles.length }} Daily Double(s)
            </div>
            <p class="muted">Players join at <a :href="joinUrl" target="_blank">{{ joinUrl }}</a> with code <strong>{{ room }}</strong>.</p>
            <label class="check">
              <input v-model="showIntro" type="checkbox" />
              Show introduction &amp; practice buzz first
            </label>
            <label class="check">
              <input v-model="emojiOnPhones" type="checkbox" />
              Show the buzz emoji on phones too (fair for players watching a video call)
            </label>
            <button class="primary" :disabled="!board" @click="startGame">
              Start game with {{ game.players.length }} player(s)
            </button>
          </div>
          <JoinQr :url="joinUrl" :size="180" />
        </div>
      </div>

      <!-- Intro -->
      <div v-else-if="game.phase === 'intro' && practice" class="panel stack">
        <h2>Introduction</h2>
        <p class="muted">
          The board screen explains the rules. Run a practice buzz or two so everyone learns to tap the emoji
          shown on the TV. No points are scored.
        </p>
        <div class="row">
          <button class="primary big" @click="openPractice">
            {{ practice.target === null ? 'Practice buzz' : 'Practice again' }} <kbd>Space</kbd>
          </button>
          <span v-if="practice.status === 'opening'" class="waiting">Opening…</span>
          <span v-if="practice.target !== null && practice.status !== 'reading'" class="target" title="Emoji players must tap">
            {{ BUZZ_EMOJIS[practice.target] }}
          </span>
          <span v-if="practice.target !== null" class="muted">
            {{ practice.hits.length }} / {{ game.players.length }} tapped it
          </span>
          <span class="spacer" />
          <button class="primary" @click="act({ type: 'endIntro' })">Start {{ board?.rounds[0]?.name ?? 'game' }}</button>
        </div>
        <ol v-if="practice.hits.length" class="hits">
          <li v-for="hit in practice.hits" :key="hit.playerId">
            {{ nameOf(hit.playerId) }} <span class="muted">{{ formatSeconds(hit.ms) }}</span>
          </li>
        </ol>
      </div>

      <!-- Board -->
      <div v-else-if="game.phase === 'board' && pub.round" class="stack">
        <div class="row">
          <h2>{{ pub.round.name }}</h2>
          <span class="muted">
            {{ game.control ? `${nameOf(game.control)} picks` : 'Pick a clue' }} · gold border = Daily Double
          </span>
          <span class="spacer" />
          <button class="small ghost" @click="confirmThen('End this round now?', { type: 'endRound' })">End round</button>
          <button v-if="board?.final" class="small ghost" @click="confirmThen('Skip to the final round?', { type: 'startFinal' })">
            Go to final
          </button>
          <button class="small ghost" @click="confirmThen('End the game now?', { type: 'endGame' })">End game</button>
        </div>
        <BoardGrid :round="pub.round" selectable :daily-doubles="game.dailyDoubles" @select="selectClue" />
      </div>

      <!-- Clue -->
      <div v-else-if="game.phase === 'clue' && cur && clue" class="panel stack clue-panel">
        <div class="row">
          <span class="pill">{{ categoryName }}</span>
          <span class="value">{{ cur.value }}</span>
          <span v-if="cur.dailyDouble" class="pill gold">Daily Double</span>
          <span class="spacer" />
          <span class="muted">Status: {{ cur.status.replace('_', ' ') }}</span>
        </div>
        <p class="clue serif">{{ clue.clue }}</p>
        <div class="answer">
          <span class="muted">Answer</span>
          <strong class="gold serif">{{ clue.answer }}</strong>
          <span v-if="clue.notes" class="muted">Note: {{ clue.notes }}</span>
        </div>

        <!-- Daily Double wager -->
        <div v-if="cur.status === 'dd_wager'" class="stack">
          <label>
            Player
            <select :value="cur.ddPlayer ?? ''" @change="act({ type: 'setDdPlayer', id: ($event.target as HTMLSelectElement).value })">
              <option value="" disabled>Who found it?</option>
              <option v-for="p in game.players" :key="p.id" :value="p.id">{{ p.name }} ({{ p.score }})</option>
            </select>
          </label>
          <div v-if="cur.ddPlayer" class="row">
            <span>Wager: <strong class="gold">{{ cur.ddWager ?? 'waiting for player…' }}</strong></span>
            <span class="muted">(max {{ ddMaxWager(game, cur.ddPlayer) }})</span>
            <span class="spacer" />
            <input v-model.number="wagerInput" type="number" min="0" class="narrow" placeholder="Set wager" />
            <button class="small" @click="setHostWager('daily', cur.ddPlayer, wagerInput)">Set</button>
          </div>
          <button class="primary" :disabled="cur.ddWager === null" @click="act({ type: 'showDdClue' })">Show clue</button>
        </div>

        <div v-else-if="cur.status === 'reading' || cur.status === 'closed'" class="row">
          <button class="primary big" @click="act({ type: 'openBuzzers', target: pickBuzzTarget(cur.target) })">
            {{ cur.status === 'reading' ? 'Open buzzers' : 'Reopen buzzers' }} <kbd>Space</kbd>
          </button>
          <button @click="act({ type: 'revealAnswer' })">Nobody – reveal <kbd>R</kbd></button>
          <span v-if="cur.lockedOut.length" class="muted">Wrong: {{ cur.lockedOut.map(nameOf).join(', ') }}</span>
        </div>

        <div v-else-if="cur.status === 'opening' || cur.status === 'open'" class="row">
          <span class="waiting">{{ cur.status === 'opening' ? 'Opening…' : 'Buzzers open – waiting for a buzz…' }}</span>
          <span v-if="cur.target !== null" class="target" title="Emoji players must tap">{{ BUZZ_EMOJIS[cur.target] }}</span>
          <span class="spacer" />
          <button @click="act({ type: 'closeBuzzers' })">Close buzzers</button>
          <button @click="act({ type: 'revealAnswer' })">Time's up – reveal <kbd>R</kbd></button>
        </div>

        <div v-else-if="cur.status === 'answering'" class="stack">
          <div class="winner">{{ nameOf(cur.buzzWinner) }} <small>is answering</small></div>
          <div class="row">
            <button class="ok big" @click="act({ type: 'judge', correct: true })">Correct +{{ cur.value }} <kbd>C</kbd></button>
            <button class="bad big" @click="act({ type: 'judge', correct: false })">Incorrect −{{ cur.value }} <kbd>X</kbd></button>
          </div>
        </div>

        <div v-else-if="cur.status === 'revealed'" class="row">
          <span v-if="cur.correctPlayer">{{ nameOf(cur.correctPlayer) }} got it.</span>
          <span v-else class="muted">Nobody got it.</span>
          <span class="spacer" />
          <button class="primary big" @click="act({ type: 'returnToBoard' })">Back to board <kbd>Enter</kbd></button>
        </div>
      </div>

      <!-- Final -->
      <div v-else-if="game.phase.startsWith('final') && final && board?.final" class="panel stack">
        <div class="row">
          <span class="pill gold">Final round</span>
          <strong class="serif">{{ board.final.category }}</strong>
        </div>
        <p v-if="game.phase !== 'final_category' && game.phase !== 'final_wager'" class="clue serif">{{ board.final.clue }}</p>
        <div class="answer">
          <span class="muted">Answer</span>
          <strong class="gold serif">{{ board.final.answer }}</strong>
        </div>

        <table class="final-table">
          <thead>
            <tr><th>Player</th><th>Score</th><th>Wager</th><th>Answer</th><th>Result</th></tr>
          </thead>
          <tbody>
            <tr v-for="id in final.eligible" :key="id" :class="{ current: game.phase === 'final_judging' && id === judgingId }">
              <td>{{ nameOf(id) }}</td>
              <td>{{ game.players.find((p) => p.id === id)?.score }}</td>
              <td>{{ final.wagers[id] ?? '—' }}</td>
              <td>{{ final.answers[id] ?? '—' }}</td>
              <td>{{ final.results[id] === undefined ? '' : final.results[id] ? '✔' : '✘' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="final.eligible.length === 0" class="muted">Nobody has a positive score, so nobody plays the final.</p>

        <div v-if="game.phase === 'final_category'" class="row">
          <button class="primary" @click="act({ type: 'openFinalWagers' })">Open wagers</button>
        </div>
        <div v-else-if="game.phase === 'final_wager'" class="row">
          <label class="inline">Answer time (s) <input v-model.number="finalSeconds" type="number" min="5" class="narrow" /></label>
          <button
            class="primary"
            @click="act({ type: 'showFinalClue', now: Date.now(), durationMs: (finalSeconds || 30) * 1000 })"
          >
            Show clue ({{ Object.keys(final.wagers).length }}/{{ final.eligible.length }} wagered)
          </button>
        </div>
        <div v-else-if="game.phase === 'final_answer'" class="row">
          <span class="value">{{ Math.max(0, Math.ceil(((final.answerEndsAt ?? 0) - clock) / 1000)) }}s</span>
          <span class="spacer" />
          <button class="primary" @click="act({ type: 'closeFinalAnswers' })">Close answers & judge</button>
        </div>
        <div v-else-if="game.phase === 'final_judging'" class="row">
          <template v-if="judgingId">
            <strong>{{ nameOf(judgingId) }}</strong>
            <span class="spacer" />
            <button v-if="!final.responseShown" class="primary" @click="act({ type: 'showFinalResponse' })">Reveal response</button>
            <template v-else>
              <button class="ok" @click="act({ type: 'judgeFinal', correct: true })">Correct</button>
              <button class="bad" @click="act({ type: 'judgeFinal', correct: false })">Incorrect</button>
            </template>
          </template>
          <template v-else>
            <span>All responses judged.</span>
            <span class="spacer" />
            <button class="primary" @click="act({ type: 'endGame' })">Finish game</button>
          </template>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="game.phase === 'game_over'" class="panel stack">
        <h2>Game over</h2>
        <ol>
          <li v-for="p in [...game.players].sort((a, b) => b.score - a.score)" :key="p.id">{{ p.name }} — {{ p.score }}</li>
        </ol>
        <div class="row">
          <button class="primary" @click="confirmThen('Reset scores and go back to the lobby?', { type: 'resetToLobby' })">
            Play again (same players)
          </button>
          <RouterLink class="btn" to="/host">New room</RouterLink>
        </div>
      </div>
    </section>

    <aside class="panel stack players">
      <h3>Players ({{ game.players.length }})</h3>
      <div v-for="p in game.players" :key="p.id" class="player" :class="{ answering: cur?.buzzWinner === p.id }">
        <div class="row">
          <span class="dot" :class="{ on: connectedIds.has(p.id) }" :title="connectedIds.has(p.id) ? 'Connected' : 'Not seen recently'" />
          <strong class="pname">{{ p.name }}</strong>
          <span class="spacer" />
          <span class="value">{{ p.score }}</span>
        </div>
        <div class="row tools">
          <button
            class="small"
            :class="{ primary: game.control === p.id }"
            title="Give control (picks next clue)"
            @click="act({ type: 'setControl', id: p.id })"
          >
            ★
          </button>
          <input v-model.number="adjust[p.id]" type="number" class="narrow" placeholder="±pts" />
          <button class="small" title="Add points" @click="applyAdjust(p.id, 1)">+</button>
          <button class="small" title="Subtract points" @click="applyAdjust(p.id, -1)">−</button>
          <span class="spacer" />
          <button class="small ghost" title="Rename" @click="rename(p.id)">✎</button>
          <button class="small ghost" title="Remove" @click="kick(p.id)">✕</button>
        </div>
      </div>
      <p v-if="game.players.length === 0" class="muted">Waiting for players to join…</p>
      <p class="muted keys">Keys: Space open · C correct · X incorrect · R reveal · Enter board · Z undo</p>
    </aside>
  </main>
</template>

<style scoped>
.host {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  grid-template-rows: auto 1fr;
  gap: 1rem;
  padding: 12px 16px;
  min-height: 100vh;
  align-items: start;
}
.topbar {
  grid-column: 1 / -1;
}
.code {
  letter-spacing: 0.1em;
}
@media (max-width: 900px) {
  .host {
    grid-template-columns: 1fr;
  }
}
.lobby {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 600px) {
  .lobby {
    grid-template-columns: 1fr;
  }
}
.clue {
  font-size: 1.5rem;
  text-transform: uppercase;
  margin: 0;
}
.answer {
  display: flex;
  gap: 0.8em;
  align-items: baseline;
  flex-wrap: wrap;
  background: #0a1240;
  padding: 0.7em 1em;
  border-radius: 8px;
  font-size: 1.2rem;
}
.winner {
  font-size: 2.2rem;
  font-weight: 900;
  color: var(--gold);
}
.winner small {
  font-size: 1rem;
  color: var(--muted);
  font-weight: 400;
}
.target {
  font-size: 2rem;
  line-height: 1;
}
.hits {
  margin: 0;
  font-size: 1.2rem;
}
.waiting {
  font-size: 1.2rem;
  color: var(--gold);
}
button.big {
  font-size: 1.15rem;
  padding: 0.8em 1.4em;
}
kbd {
  font-size: 0.7em;
  opacity: 0.7;
  border: 1px solid currentColor;
  border-radius: 4px;
  padding: 0 0.3em;
}
.narrow {
  width: 6.5em;
}
.inline {
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.players {
  position: sticky;
  top: 12px;
}
.player {
  background: var(--panel-2);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  display: grid;
  gap: 0.4rem;
  border: 2px solid transparent;
}
.player.answering {
  border-color: var(--gold);
}
.pname {
  overflow-wrap: anywhere;
}
.tools {
  gap: 0.3rem;
}
.tools input {
  padding: 0.25em 0.4em;
}
.dot {
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  background: var(--bad);
}
.dot.on {
  background: var(--ok);
}
.keys {
  font-size: 0.8em;
}
.final-table {
  width: 100%;
  border-collapse: collapse;
}
.final-table th,
.final-table td {
  text-align: left;
  padding: 0.35em 0.5em;
  border-bottom: 1px solid var(--panel-2);
}
.final-table tr.current {
  background: var(--panel-2);
}
</style>
