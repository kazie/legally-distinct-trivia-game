<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BoardGrid from '@/components/BoardGrid.vue'
import ClueText from '@/components/ClueText.vue'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import JoinQr from '@/components/JoinQr.vue'
import Scoreboard from '@/components/Scoreboard.vue'
import SourceLine from '@/components/SourceLine.vue'
import { BUZZ_EMOJIS, formatSeconds, photoFinishText } from '@/game/buzzPad'
import { ClientController } from '@/game/clientController'
import { TIEBREAK_ID } from '@/game/engine'
import { DEFAULT_SETTINGS, formatLockout } from '@/game/settings'
import { useWakeLock } from '@/composables/useWakeLock'
import { ignoreHotkey } from '@/keys'
import { useBridge } from '@/net/useBridge'
import { beep } from '@/sound'

const props = defineProps<{ room: string }>()

const client = new ClientController({ bridge: useBridge(), roomCode: props.room, role: 'board' })
const { state, connection, hostOnline, buzzWinnerName, revealProgress, clueValue } = client

const joinUrl = computed(() => `${location.origin}/play/${props.room}`)
const onLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
const cur = computed(() => state.value?.current ?? null)
const final = computed(() => state.value?.final ?? null)
const phase = computed(() => state.value?.phase ?? null)
const finalRemaining = computed(() => client.remainingMs(final.value?.answerEndsAt ?? null))
const gameOver = computed(() => state.value?.gameOver ?? null)
/** Second, first, third: the winner stands in the middle. */
const podium = computed(() => {
  const r = gameOver.value?.ranking ?? []
  return [r[1], r[0], r[2]].filter((p) => !!p)
})
const answerLeft = computed(() => client.remainingMs(cur.value?.answerEndsAt ?? null))
const photoFinish = computed(() => (cur.value ? photoFinishText(cur.value.buzzOrder, (id) => client.nameOf(id)) : ''))
const highlight = computed(() => cur.value?.buzzWinner ?? final.value?.judging?.playerId ?? null)
const practice = computed(() => state.value?.practice ?? null)
const settings = computed(() => state.value?.settings ?? DEFAULT_SETTINGS)
const emojiPad = computed(() => settings.value.buzzStyle === 'emoji')
const quickDraw = computed(() => settings.value.openMode === 'instant')
const lockout = computed(() => formatLockout(settings.value.lockoutMs))
const penaltyShare = computed(() => (settings.value.falseStartPenalty ? `${settings.value.falseStartPenalty * 100}%` : null))
const EXAMPLE_TARGET = 5

const soundOn = ref(false)
watch(answerLeft, (ms, before) => {
  if (ms === 0 && before && soundOn.value) beep('timeout')
})
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

useWakeLock()

const canFullscreen = !!document.documentElement.requestFullscreen
const fullscreen = ref(!!document.fullscreenElement)
function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  else void document.documentElement.requestFullscreen().catch(() => {})
}
const onFullscreenChange = () => (fullscreen.value = !!document.fullscreenElement)
function onKey(event: KeyboardEvent) {
  if (ignoreHotkey(event) || event.key.toLowerCase() !== 'f' || event.repeat) return
  if (canFullscreen) toggleFullscreen()
}

onMounted(() => {
  client.start()
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  client.stop()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener('keydown', onKey)
})
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
      <button
        v-if="canFullscreen"
        class="ghost small"
        :title="fullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'"
        @click="toggleFullscreen"
      >
        {{ fullscreen ? '🗗' : '⛶' }}
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
          <li v-if="quickDraw">A clue appears and the buzzers open right away.</li>
          <li v-else>The host reads a clue out loud.</li>
          <template v-if="emojiPad">
            <li>When the buzzers open, an emoji appears here on the TV.</li>
            <li>
              Find <strong>that</strong> emoji on your phone and tap it.
              <span class="muted">A wrong emoji or tapping too early blocks you for {{ lockout }}.</span>
            </li>
          </template>
          <li v-else-if="quickDraw">Press the big button on your phone as soon as you know it.</li>
          <li v-else>
            When the screen lights up, press the big button on your phone.
            <span class="muted">
              Too early {{ penaltyShare ? `costs ${penaltyShare} of the clue's value and blocks` : 'blocks' }} you for {{ lockout }}.
            </span>
          </li>
          <li v-if="quickDraw">
            Careful: the clue <strong>disappears</strong> the moment someone buzzes.
            <span class="muted">Buzz early and you answer from memory!</span>
          </li>
          <li>
            The fastest player answers out loud. Right wins the points, wrong
            {{ settings.wrongAnswerPenalty ? 'loses them and locks' : 'locks' }} you out.
          </li>
          <li>A <span class="gold">Daily Double</span> is for the player in control only, who wagers first.</li>
          <li v-if="state.hasFinal">The game ends with a final round: everyone with points wagers and writes an answer.</li>
        </ol>
        <div v-if="emojiPad" class="example">
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
        <div v-else-if="practice?.status === 'open' && !emojiPad" :key="practice.attempt" class="hint gold buzz-now">Buzz now!</div>
        <p v-else-if="emojiPad" class="sub">Get your phone ready — the host will show an emoji to tap.</p>
        <p v-else class="sub">Get your phone ready — press when this lights up.</p>
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
        <span v-if="cur.id === TIEBREAK_ID" class="gold">Tie-breaker</span>
        <span v-else class="value">{{ clueValue }}</span>
      </div>
      <template v-if="cur.status === 'dd_wager'">
        <div class="dd serif">DAILY DOUBLE</div>
        <p class="sub">{{ client.nameOf(cur.ddPlayer) ?? 'Who' }} is wagering…</p>
      </template>
      <template v-else>
        <ClueText
          v-if="cur.text !== null"
          class="clue-text"
          :text="cur.text"
          :media="cur.answerMedia ?? cur.media"
          :progress="cur.answerMedia ? null : revealProgress"
        />
        <div v-else class="hidden-clue">🙈 Clue hidden — answer from memory!</div>
        <div v-if="cur.status === 'answering'" class="banner">
          {{ buzzWinnerName }}
          <small>{{ cur.dailyDouble ? `Daily Double for ${cur.value}` : 'buzzed in!' }}</small>
        </div>
        <div v-if="cur.status === 'answering' && answerLeft !== null" class="answer-timer">
          <div class="bar"><div :style="{ width: `${(answerLeft / settings.answerTimerMs) * 100}%` }" /></div>
          <span>{{ Math.ceil(answerLeft / 1000) }}</span>
        </div>
        <div v-if="photoFinish && cur.status !== 'revealed'" class="muted photo-finish">📸 {{ photoFinish }}</div>
        <div v-else-if="cur.status === 'open' && cur.target !== null" class="target">
          <span class="target-emoji">{{ BUZZ_EMOJIS[cur.target] }}</span>
          <small class="gold">Tap it to buzz!</small>
        </div>
        <div v-else-if="cur.status === 'open'" class="hint gold">Buzzers open!</div>
        <div v-else-if="cur.status === 'revealed'" class="answer">
          <span class="serif gold">{{ cur.answer }}</span>
          <small v-if="cur.correctPlayer">{{ client.nameOf(cur.correctPlayer) }} +{{ cur.value }}</small>
          <SourceLine :source="cur.source" :url="cur.sourceUrl" />
        </div>
        <div v-if="cur.lockedOut.length && cur.status !== 'revealed'" class="muted locked">
          Wrong: {{ cur.lockedOut.map((id) => client.nameOf(id)).join(', ') }}
        </div>
        <div v-if="cur.falseStarts.length && cur.status !== 'revealed'" class="muted locked">
          Too early:
          {{ cur.falseStarts.map((f) => `${client.nameOf(f.playerId)}${f.points ? ` −${f.points}` : ''}`).join(', ') }}
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
        <ClueText class="clue-text" :text="final.clue ?? ''" :media="final.media" />
        <div v-if="finalRemaining !== null" class="value timer">{{ Math.ceil(finalRemaining / 1000) }}</div>
        <p class="sub">{{ final.answered.length }} / {{ final.eligible.length }} answered</p>
      </template>
      <template v-else-if="phase === 'final_judging'">
        <ClueText class="clue-text small-clue" :text="final.clue ?? ''" :media="final.answerMedia ?? final.media" />
        <div v-if="final.judging" class="banner">
          {{ client.nameOf(final.judging.playerId) }}
          <small v-if="final.judging.response !== null">“{{ final.judging.response || '—' }}” · wagered {{ final.judging.wager }}</small>
        </div>
        <div v-else-if="final.answer" class="answer">
          <span class="serif gold">{{ final.answer }}</span>
          <SourceLine :source="final.source" :url="final.sourceUrl" />
        </div>
      </template>
    </section>

    <!-- Game over -->
    <section v-else-if="phase === 'game_over' && gameOver" class="fill game-over">
      <h1 class="serif big-title">Game over</h1>
      <div class="podium">
        <div v-for="p in podium" :key="p.playerId" class="step" :class="`rank-${p.rank}`">
          <span class="medal">{{ ['🥇', '🥈', '🥉'][p.rank - 1] ?? '' }}</span>
          <strong class="pname">{{ client.nameOf(p.playerId) }}</strong>
          <span class="value">{{ p.score }}</span>
          <div class="block">{{ p.rank }}</div>
        </div>
      </div>
      <div v-if="gameOver.awards.length" class="awards">
        <div v-for="(a, i) in gameOver.awards" :key="a.key" class="award" :style="{ animationDelay: `${1.5 + i * 0.6}s` }">
          <span class="award-emoji">{{ a.emoji }}</span>
          <strong class="gold">{{ a.title }}</strong>
          <span>{{ a.playerIds.map((id) => client.nameOf(id)).join(' & ') }}</span>
          <small class="muted">{{ a.detail }}</small>
        </div>
      </div>
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
.answer small,
.answer .source {
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
.hidden-clue {
  font-size: 2.4em;
  font-weight: 700;
  color: var(--muted);
  text-align: center;
}
.buzz-now {
  font-size: 4em;
  animation: pop 0.25s ease-out;
}
.locked {
  font-size: 1.1em;
}
.answer-timer {
  display: flex;
  align-items: center;
  gap: 0.6em;
  width: min(30em, 80%);
  font-size: 1.6em;
  font-weight: 800;
}
.answer-timer .bar {
  flex: 1;
  height: 0.5em;
  background: var(--cell-border);
  border-radius: 1em;
  overflow: hidden;
}
.answer-timer .bar div {
  height: 100%;
  background: var(--gold);
  transition: width 0.25s linear;
}
.photo-finish {
  font-size: 1.3em;
}
.game-over {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1.5rem;
  text-align: center;
}
.podium {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
}
.step {
  display: grid;
  justify-items: center;
  gap: 0.2em;
  width: 9em;
  animation: rise 0.8s ease-out both;
}
.step.rank-1 {
  animation-delay: 0.6s;
}
.step .pname {
  font-size: 1.4em;
  overflow-wrap: anywhere;
}
.medal {
  font-size: 2.5em;
}
.block {
  width: 100%;
  background: var(--cell-bg);
  border: 4px solid var(--cell-border);
  border-radius: var(--radius) var(--radius) 0 0;
  font-size: 2.5em;
  font-weight: 900;
  color: var(--gold);
  padding-top: 0.3em;
}
.rank-1 .block {
  height: 5em;
}
.rank-2 .block {
  height: 3.5em;
}
.rank-3 .block {
  height: 2.5em;
}
.awards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
}
.award {
  display: grid;
  gap: 0.2em;
  background: var(--panel-2);
  border-radius: var(--radius);
  padding: 0.6em 1em;
  min-width: 10em;
  animation: pop 0.4s ease-out both;
}
.award-emoji {
  font-size: 2em;
}
@keyframes rise {
  from {
    transform: translateY(40%);
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .step,
  .award {
    animation: none;
  }
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
