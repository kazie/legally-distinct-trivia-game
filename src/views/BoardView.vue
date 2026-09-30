<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BoardGrid from '@/components/BoardGrid.vue'
import ClueText from '@/components/ClueText.vue'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import JoinQr from '@/components/JoinQr.vue'
import Scoreboard from '@/components/Scoreboard.vue'
import { BUZZ_EMOJIS, formatSeconds } from '@/game/buzzPad'
import { ClientController } from '@/game/clientController'
import { useBridge } from '@/net/useBridge'
import { beep } from '@/sound'

const props = defineProps<{ room: string }>()

const client = new ClientController({ bridge: useBridge(), roomCode: props.room, role: 'board' })
const { state, connection, hostOnline, buzzWinnerName } = client

const joinUrl = computed(() => `${location.origin}/play/${props.room}`)
const onLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
const cur = computed(() => state.value?.current ?? null)
const final = computed(() => state.value?.final ?? null)
const phase = computed(() => state.value?.phase ?? null)
const finalRemaining = computed(() => client.remainingMs(final.value?.answerEndsAt ?? null))
const ranking = computed(() => [...(state.value?.players ?? [])].sort((a, b) => b.score - a.score))
const highlight = computed(() => cur.value?.buzzWinner ?? final.value?.judging?.playerId ?? null)
const practice = computed(() => state.value?.practice ?? null)
const EXAMPLE_TARGET = 5

const soundOn = ref(false)
watch(
  () => cur.value?.buzzWinner,
  (winner) => winner && soundOn.value && beep('buzz'),
)
watch(
  // The clue on screen, or the practice buzz during the intro.
  () => [client.buzzable.value?.status, cur.value?.correctPlayer] as const,
  ([status, correct], [prevStatus]) => {
    if (!soundOn.value || status === prevStatus) return
    if (status === 'revealed') beep(correct ? 'correct' : 'timeout')
    if (status === 'open') beep('open')
  },
)

onMounted(() => client.start())
onUnmounted(() => client.stop())
</script>

<template>
  <main class="screen">
    <header class="row">
      <strong class="serif gold">{{ state?.title ?? 'Legally Distinct Trivia' }}</strong>
      <span v-if="state?.round && phase !== 'lobby'" class="muted">{{ state.round.name }}</span>
      <span class="spacer" />
      <span class="muted">Join at <strong>{{ joinUrl }}</strong> · room <strong class="gold">{{ room }}</strong></span>
      <button class="ghost small" :title="soundOn ? 'Sound on' : 'Sound off'" @click="soundOn = !soundOn">
        {{ soundOn ? '🔊' : '🔇' }}
      </button>
      <ConnectionBadge :status="connection" :host-online="hostOnline" />
    </header>

    <section v-if="!state" class="center fill">
      <h1 class="serif">Waiting for host of room <span class="gold">{{ room }}</span>…</h1>
    </section>

    <!-- Lobby -->
    <section v-else-if="phase === 'lobby'" class="lobby fill">
      <div class="center stack">
        <h1 class="serif big-title">{{ state.title ?? 'Get ready!' }}</h1>
        <JoinQr :url="joinUrl" :size="280" />
        <p class="join">Scan or go to <strong>{{ joinUrl }}</strong></p>
        <p class="code serif">Room <span class="gold">{{ room }}</span></p>
        <p v-if="onLocalhost" class="muted">Tip: open this page via your LAN IP so phones can reach it.</p>
      </div>
    </section>

    <!-- Intro -->
    <section v-else-if="phase === 'intro'" class="fill intro">
      <div class="rules">
        <h1 class="serif gold">How to play</h1>
        <ol>
          <li>The host reads a clue out loud.</li>
          <li>When the buzzers open, an emoji appears here on the TV.</li>
          <li>
            Find <strong>that</strong> emoji on your phone and tap it.
            <span class="muted">A wrong emoji or tapping too early blocks you for a moment.</span>
          </li>
          <li>The fastest player answers out loud. Right wins the points, wrong loses them and locks you out.</li>
          <li>A <span class="gold">Daily Double</span> is for the player in control only, who wagers first.</li>
          <li v-if="state.hasFinal">The game ends with a final round: everyone with points wagers and writes an answer.</li>
        </ol>
        <div class="example">
          <div class="mini-pad">
            <span v-for="(emoji, i) in BUZZ_EMOJIS" :key="emoji" :class="{ hit: i === EXAMPLE_TARGET }">{{ emoji }}</span>
          </div>
          <span class="muted">TV shows {{ BUZZ_EMOJIS[EXAMPLE_TARGET] }} → tap {{ BUZZ_EMOJIS[EXAMPLE_TARGET] }}</span>
        </div>
      </div>
      <div class="clue practice" :class="{ open: practice?.status === 'open' }">
        <div class="clue-head"><span>Practice</span></div>
        <div v-if="practice && practice.target !== null" class="target">
          <span :key="practice.attempt" class="target-emoji">{{ BUZZ_EMOJIS[practice.target] }}</span>
          <small class="gold">Tap it to buzz!</small>
        </div>
        <p v-else class="sub">Get your phone ready — the host will show an emoji to tap.</p>
        <ol v-if="practice?.hits.length" class="hits">
          <li v-for="hit in practice.hits" :key="hit.playerId">
            {{ client.nameOf(hit.playerId) }} <span class="muted">{{ formatSeconds(hit.ms) }}</span>
          </li>
        </ol>
      </div>
    </section>

    <!-- Board -->
    <section v-else-if="phase === 'board' && state.round" class="fill board">
      <BoardGrid :round="state.round" />
    </section>

    <!-- Clue -->
    <section v-else-if="phase === 'clue' && cur" class="fill clue" :class="{ open: cur.status === 'open' }">
      <div class="clue-head">
        <span>{{ cur.category }}</span>
        <span class="value">{{ cur.value }}</span>
      </div>
      <template v-if="cur.status === 'dd_wager'">
        <div class="dd serif">DAILY DOUBLE</div>
        <p class="sub">{{ client.nameOf(cur.ddPlayer) ?? 'Who' }} is wagering…</p>
      </template>
      <template v-else>
        <ClueText class="clue-text" :text="cur.text ?? ''" :media="cur.media" />
        <div v-if="cur.status === 'answering'" class="banner">
          {{ buzzWinnerName }}
          <small>{{ cur.dailyDouble ? `Daily Double for ${cur.value}` : 'buzzed in!' }}</small>
        </div>
        <div v-else-if="cur.status === 'open' && cur.target !== null" class="target">
          <span class="target-emoji">{{ BUZZ_EMOJIS[cur.target] }}</span>
          <small class="gold">Tap it to buzz!</small>
        </div>
        <div v-else-if="cur.status === 'open'" class="hint gold">Buzzers open!</div>
        <div v-else-if="cur.status === 'revealed'" class="answer">
          <span class="serif gold">{{ cur.answer }}</span>
          <small v-if="cur.correctPlayer">{{ client.nameOf(cur.correctPlayer) }} +{{ cur.value }}</small>
        </div>
        <div v-if="cur.lockedOut.length && cur.status !== 'revealed'" class="muted locked">
          Wrong: {{ cur.lockedOut.map((id) => client.nameOf(id)).join(', ') }}
        </div>
      </template>
    </section>

    <!-- Final -->
    <section v-else-if="phase?.startsWith('final') && final" class="fill clue">
      <div class="clue-head"><span>Final round</span></div>
      <div class="dd serif small-dd">{{ final.category }}</div>
      <template v-if="phase === 'final_wager'">
        <p class="sub">Place your wagers! {{ final.wagered.length }} / {{ final.eligible.length }}</p>
      </template>
      <template v-else-if="phase === 'final_answer'">
        <ClueText class="clue-text" :text="final.clue ?? ''" />
        <div v-if="finalRemaining !== null" class="value timer">{{ Math.ceil(finalRemaining / 1000) }}</div>
        <p class="sub">{{ final.answered.length }} / {{ final.eligible.length }} answered</p>
      </template>
      <template v-else-if="phase === 'final_judging'">
        <ClueText class="clue-text small-clue" :text="final.clue ?? ''" />
        <div v-if="final.judging" class="banner">
          {{ client.nameOf(final.judging.playerId) }}
          <small v-if="final.judging.response !== null">“{{ final.judging.response || '—' }}” · wagered {{ final.judging.wager }}</small>
        </div>
        <div v-else-if="final.answer" class="answer"><span class="serif gold">{{ final.answer }}</span></div>
      </template>
    </section>

    <!-- Game over -->
    <section v-else-if="phase === 'game_over'" class="fill center stack">
      <h1 class="serif big-title">Game over</h1>
      <p v-if="ranking[0]" class="winner">🏆 <span class="gold">{{ ranking[0].name }}</span> wins with {{ ranking[0].score }}!</p>
      <p v-if="final?.answer" class="muted">Final answer: {{ final.answer }}</p>
    </section>

    <Scoreboard v-if="state && phase !== 'lobby'" :players="state.players" :control="state.control" :highlight="highlight" />
    <Scoreboard v-else-if="state" :players="state.players" />
  </main>
</template>

<style scoped>
.screen {
  min-height: 100vh;
  padding: 12px 16px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 1rem;
  font-size: clamp(14px, 1.3vw, 22px);
}
.fill {
  min-height: 0;
}
.center {
  display: grid;
  place-items: center;
  text-align: center;
}
.big-title {
  font-size: 3em;
  margin: 0;
}
.lobby {
  display: grid;
  place-items: center;
}
.join {
  font-size: 1.3em;
}
.code {
  font-size: 2.5em;
  margin: 0;
  letter-spacing: 0.1em;
}
.intro {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
}
@media (max-width: 800px) {
  .intro {
    grid-template-columns: 1fr;
  }
}
.rules {
  font-size: 1.5em;
}
.rules h1 {
  font-size: 2em;
  margin: 0 0 0.3em;
}
.rules li {
  margin-bottom: 0.5em;
}
.rules li .muted {
  display: block;
  font-size: 0.8em;
}
.example {
  display: flex;
  align-items: center;
  gap: 1em;
}
.mini-pad {
  display: grid;
  grid-template-columns: repeat(3, 1.6em);
  gap: 0.2em;
  font-size: 1.3em;
  text-align: center;
}
.mini-pad span {
  opacity: 0.35;
}
.mini-pad .hit {
  opacity: 1;
  outline: 3px solid var(--gold);
  border-radius: 6px;
}
.hits {
  font-size: 1.8em;
  margin: 0;
}
.board :deep(.cell) {
  font-size: 2.6em;
  min-height: 2.1em;
}
.board :deep(.head) {
  font-size: 1.2em;
  min-height: 4em;
}
.clue {
  background: var(--cell-bg);
  border-radius: var(--radius);
  padding: 1.5rem 2rem;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 1.2rem;
  border: 6px solid var(--cell-border);
  transition: border-color 0.2s;
}
.clue.open {
  border-color: var(--gold);
}
.clue-head {
  display: flex;
  gap: 1.5em;
  font-size: 1.4em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--muted);
}
.clue-text {
  font-size: 3em;
  max-width: 30em;
}
.small-clue {
  font-size: 1.8em;
}
.dd {
  font-size: 6em;
  color: var(--gold);
  text-shadow: 4px 4px 0 #000a;
  text-align: center;
}
.small-dd {
  font-size: 3.5em;
}
.sub {
  font-size: 1.6em;
}
.banner {
  background: var(--gold);
  color: #1a1400;
  font-size: 3.2em;
  font-weight: 900;
  padding: 0.3em 1em;
  border-radius: var(--radius);
  display: grid;
  text-align: center;
  animation: pop 0.25s ease-out;
}
.banner small {
  font-size: 0.4em;
  font-weight: 600;
}
.answer {
  display: grid;
  text-align: center;
  font-size: 3em;
  text-transform: uppercase;
}
.answer small {
  font-size: 0.4em;
  text-transform: none;
}
.hint {
  font-size: 2em;
  font-weight: 800;
}
.timer {
  font-size: 4em;
}
.locked {
  font-size: 1.1em;
}
.winner {
  font-size: 2.4em;
}
@keyframes pop {
  from {
    transform: scale(0.7);
    opacity: 0;
  }
}
.target {
  display: grid;
  justify-items: center;
  line-height: 1;
}
.target-emoji {
  font-size: 9em;
  animation: pop 0.25s ease-out;
}
.target small {
  font-size: 1.6em;
  font-weight: 700;
  margin-top: 0.3em;
}
@keyframes pop {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
