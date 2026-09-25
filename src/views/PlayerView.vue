<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import Scoreboard from '@/components/Scoreboard.vue'
import { ClientController } from '@/game/clientController'
import { useBridge } from '@/net/useBridge'
import { LAST_NAME_KEY, useStorages } from '@/storage'

const props = defineProps<{ room: string }>()

const { local, session } = useStorages()
const client = new ClientController({ bridge: useBridge(), roomCode: props.room, role: 'player', storage: session })
const { state, me, connection, hostOnline, joinedName, canBuzz, buzzWinnerName } = client

const nameInput = ref(joinedName.value ?? local?.getItem(LAST_NAME_KEY) ?? '')
const wagerInput = ref<number | null>(null)
const finalText = ref('')
const sentWager = ref<number | null>(null)
const sentAnswer = ref<string | null>(null)

const cur = computed(() => state.value?.current ?? null)
const final = computed(() => state.value?.final ?? null)
const phase = computed(() => state.value?.phase ?? null)
const isMe = (id: string | null | undefined) => !!id && id === client.playerId
const controlName = computed(() => client.nameOf(state.value?.control ?? null))
const eligibleForFinal = computed(() => final.value?.eligible.includes(client.playerId) ?? false)
const finalRemaining = computed(() => client.remainingMs(final.value?.answerEndsAt ?? null))
const ranking = computed(() => [...(state.value?.players ?? [])].sort((a, b) => b.score - a.score))

function join() {
  local?.setItem(LAST_NAME_KEY, nameInput.value.trim())
  client.join(nameInput.value)
}

function buzz() {
  if (client.buzz()) navigator.vibrate?.(30)
}

function sendWager(kind: 'daily' | 'final') {
  if (wagerInput.value === null || !Number.isFinite(wagerInput.value)) return
  if (client.wager(kind, wagerInput.value)) sentWager.value = wagerInput.value
}

function sendAnswer() {
  if (client.finalAnswer(finalText.value)) sentAnswer.value = finalText.value
}

// Reset per-step inputs when the clue or phase changes.
watch(
  () => `${phase.value}|${cur.value?.id ?? ''}`,
  () => {
    wagerInput.value = null
    sentWager.value = null
  },
)

watch(
  () => cur.value?.buzzWinner,
  (winner) => {
    if (isMe(winner)) navigator.vibrate?.([80, 40, 80])
  },
)

function onKey(event: KeyboardEvent) {
  if (event.code === 'Space' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault()
    buzz()
  }
}

onMounted(() => {
  client.start()
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  client.stop()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <main class="player">
    <header class="row">
      <strong>Room {{ room }}</strong>
      <span class="spacer" />
      <ConnectionBadge :status="connection" :host-online="hostOnline" />
    </header>

    <!-- Join -->
    <form v-if="!joinedName" class="panel stack" @submit.prevent="join">
      <h2>Join the game</h2>
      <label>
        Your name
        <input v-model="nameInput" maxlength="24" autocomplete="nickname" autofocus />
      </label>
      <button class="primary" type="submit" :disabled="!nameInput.trim() || connection !== 'open'">Join</button>
    </form>

    <div v-else-if="!me" class="panel center">
      <p>Joining as <strong>{{ joinedName }}</strong>…</p>
      <p class="muted">Waiting for the host to see you.</p>
      <button class="ghost small" @click="client.leave()">Change name</button>
    </div>

    <template v-else-if="state">
      <div class="me row">
        <strong class="name">{{ me.name }}</strong>
        <span class="spacer" />
        <span class="value score">{{ me.score }}</span>
      </div>

      <!-- Lobby / board -->
      <div v-if="phase === 'lobby'" class="panel center">
        <h2>You're in!</h2>
        <p class="muted">Waiting for the host to start.</p>
      </div>

      <div v-else-if="phase === 'board'" class="panel center">
        <p v-if="isMe(state.control)" class="big gold">Your pick! Tell the host a category and value.</p>
        <p v-else-if="controlName" class="big">{{ controlName }} is picking a clue…</p>
        <p v-else class="big">The host is picking a clue…</p>
      </div>

      <!-- Clue -->
      <template v-else-if="phase === 'clue' && cur">
        <div class="panel center">
          <div class="muted">{{ cur.category }}</div>
          <div class="value clue-value">{{ cur.dailyDouble ? 'DAILY DOUBLE' : cur.value }}</div>
          <p v-if="cur.text" class="clue-text serif">{{ cur.text }}</p>
        </div>

        <div v-if="cur.status === 'dd_wager'" class="panel stack center">
          <template v-if="isMe(cur.ddPlayer)">
            <h2>Your wager</h2>
            <p class="muted">Anything from 0 to {{ cur.ddMaxWager }}.</p>
            <form class="row" @submit.prevent="sendWager('daily')">
              <input v-model.number="wagerInput" type="number" min="0" :max="cur.ddMaxWager ?? 0" inputmode="numeric" />
              <button class="primary" type="submit">Wager</button>
            </form>
            <p v-if="sentWager !== null" class="muted">Sent {{ sentWager }}. The host will reveal the clue.</p>
          </template>
          <p v-else class="big">{{ client.nameOf(cur.ddPlayer) ?? 'Someone' }} is placing a wager…</p>
        </div>

        <div v-else-if="cur.status === 'answering'" class="answering" :class="{ mine: isMe(cur.buzzWinner) }">
          <template v-if="isMe(cur.buzzWinner)">YOU'RE UP!<small>Say your answer</small></template>
          <template v-else>{{ buzzWinnerName }}<small>is answering</small></template>
        </div>

        <div v-else-if="cur.status === 'revealed'" class="panel center">
          <div class="muted">Answer</div>
          <p class="big gold serif">{{ cur.answer }}</p>
          <p v-if="cur.correctPlayer">{{ isMe(cur.correctPlayer) ? 'You got it!' : `${client.nameOf(cur.correctPlayer)} got it` }}</p>
        </div>

        <button
          v-if="!cur.dailyDouble && cur.status !== 'revealed' && cur.status !== 'answering'"
          class="buzz"
          :class="{ ready: canBuzz }"
          :disabled="!canBuzz"
          @pointerdown.prevent="buzz"
        >
          <template v-if="cur.lockedOut.includes(client.playerId)">Locked out</template>
          <template v-else-if="canBuzz">BUZZ!</template>
          <template v-else-if="cur.status === 'open' || cur.status === 'opening'">Buzzed…</template>
          <template v-else>Wait…</template>
        </button>
      </template>

      <!-- Final -->
      <div v-else-if="phase === 'final_category' && final" class="panel center">
        <div class="muted">Final round category</div>
        <p class="big gold serif">{{ final.category }}</p>
        <p v-if="!eligibleForFinal" class="muted">You need a positive score to play the final round.</p>
      </div>

      <div v-else-if="phase === 'final_wager' && final" class="panel stack center">
        <div class="muted">{{ final.category }}</div>
        <template v-if="eligibleForFinal">
          <h2>Your final wager</h2>
          <p class="muted">Anything from 0 to {{ me.score }}.</p>
          <form class="row" @submit.prevent="sendWager('final')">
            <input v-model.number="wagerInput" type="number" min="0" :max="me.score" inputmode="numeric" />
            <button class="primary" type="submit">Wager</button>
          </form>
          <p v-if="final.wagered.includes(client.playerId)" class="muted">
            Wager locked in{{ sentWager !== null ? `: ${sentWager}` : '' }}. You can change it until the clue shows.
          </p>
        </template>
        <p v-else>Sit back. The others are wagering.</p>
      </div>

      <div v-else-if="phase === 'final_answer' && final" class="panel stack center">
        <div class="muted">{{ final.category }}</div>
        <p class="clue-text serif">{{ final.clue }}</p>
        <div v-if="finalRemaining !== null" class="value timer">{{ Math.ceil(finalRemaining / 1000) }}</div>
        <form v-if="eligibleForFinal" class="stack" @submit.prevent="sendAnswer">
          <textarea v-model="finalText" rows="2" maxlength="200" placeholder="Your answer" />
          <button class="primary" type="submit" :disabled="!finalText.trim() || finalRemaining === 0">
            {{ sentAnswer === null ? 'Submit answer' : 'Update answer' }}
          </button>
          <p v-if="final.answered.includes(client.playerId)" class="muted">Answer received.</p>
        </form>
      </div>

      <div v-else-if="phase === 'final_judging' && final" class="panel center stack">
        <template v-if="final.judging">
          <p class="big">{{ client.nameOf(final.judging.playerId) }}</p>
          <p v-if="final.judging.response !== null" class="serif big gold">{{ final.judging.response || '(no answer)' }}</p>
          <p v-if="final.judging.wager !== null" class="muted">Wagered {{ final.judging.wager }}</p>
        </template>
        <template v-else-if="final.answer">
          <div class="muted">Correct answer</div>
          <p class="big gold serif">{{ final.answer }}</p>
        </template>
      </div>

      <div v-else-if="phase === 'game_over'" class="panel center stack">
        <h2>Game over</h2>
        <p class="big gold">
          {{ ranking[0]?.id === client.playerId ? 'You win!' : `${ranking[0]?.name} wins!` }}
        </p>
        <p class="muted">You finished #{{ ranking.findIndex((p) => p.id === client.playerId) + 1 }} of {{ ranking.length }}.</p>
      </div>

      <Scoreboard class="scores" :players="state.players" :control="state.control" :me="client.playerId" sorted />
    </template>
  </main>
</template>

<style scoped>
.player {
  max-width: 520px;
  margin: 0 auto;
  padding: 12px 16px 2rem;
  display: grid;
  gap: 0.9rem;
  min-height: 100vh;
  align-content: start;
}
.center {
  text-align: center;
  justify-items: center;
}
.big {
  font-size: 1.4rem;
  font-weight: 700;
}
.me {
  background: var(--cell-bg);
  border-radius: var(--radius);
  padding: 0.6rem 1rem;
}
.me .name {
  font-size: 1.2rem;
}
.score {
  font-size: 1.8rem;
}
.clue-value {
  font-size: 2rem;
}
.clue-text {
  font-size: 1.2rem;
  text-transform: uppercase;
  margin: 0.4em 0 0;
}
.timer {
  font-size: 2.4rem;
}
.buzz {
  width: 100%;
  aspect-ratio: 1.3;
  max-height: 50vh;
  border-radius: 24px;
  font-size: 3rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  background: #3a2a2a;
  color: #fff9;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.buzz.ready {
  background: radial-gradient(circle at 40% 35%, #ff6b6b, #c0161c);
  color: white;
  box-shadow: 0 0 40px #ff4d4d88;
  opacity: 1;
}
.buzz:disabled {
  opacity: 1;
}
.answering {
  display: grid;
  text-align: center;
  font-size: 2.4rem;
  font-weight: 900;
  padding: 1.4rem 1rem;
  border-radius: var(--radius);
  background: var(--panel-2);
  overflow-wrap: anywhere;
}
.answering small {
  font-size: 1rem;
  font-weight: 400;
  color: var(--muted);
}
.answering.mine {
  background: var(--gold);
  color: #1a1400;
}
.answering.mine small {
  color: #1a1400;
}
.scores {
  margin-top: auto;
}
</style>
