<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import BuzzButton from '@/components/BuzzButton.vue'
import BuzzPad, { type BuzzPadMode } from '@/components/BuzzPad.vue'
import ConnectionBadge from '@/components/ConnectionBadge.vue'
import MediaView from '@/components/MediaView.vue'
import Scoreboard from '@/components/Scoreboard.vue'
import SourceLine from '@/components/SourceLine.vue'
import type { Media } from '@/content/schema'
import { formatCountdown, formatSeconds } from '@/game/buzzPad'
import { ClientController } from '@/game/clientController'
import { TIEBREAK_ID } from '@/game/engine'
import { REACTIONS } from '@/game/reactions'
import { falseStartPoints, formatLockout } from '@/game/settings'
import { useWakeLock } from '@/composables/useWakeLock'
import { ignoreHotkey } from '@/keys'
import { useBridge } from '@/net/useBridge'
import { LAST_NAME_KEY, useStorages } from '@/storage'

const props = defineProps<{ room: string }>()

const { local, session } = useStorages()
const client = new ClientController({ bridge: useBridge(), roomCode: props.room, role: 'player', storage: session })
const {
  state,
  me,
  connection,
  hostOnline,
  joinedName,
  canBuzz,
  hasBuzzed,
  stunned,
  lockMs,
  settings,
  buzzWinnerName,
  practiceHit,
  phoneTarget,
  revealProgress,
  clueValue,
} = client

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
const gameOver = computed(() => state.value?.gameOver ?? null)
const myRank = computed(() => gameOver.value?.ranking.find((r) => isMe(r.playerId)) ?? null)
const winners = computed(() => gameOver.value?.ranking.filter((r) => r.rank === 1).map((r) => client.nameOf(r.playerId)) ?? [])
const myAwards = computed(() => gameOver.value?.awards.filter((a) => a.playerIds.some(isMe)) ?? [])
const answerLeft = computed(() => client.remainingMs(cur.value?.answerEndsAt ?? null))
const pause = computed(() => state.value?.pause ?? null)
const pauseLeft = computed(() => client.remainingMs(pause.value?.until ?? null))
/** The round intro's categories so far, as the host reveals them. */
const introCategories = computed(() => {
  const round = state.value?.round
  return round?.categoriesShown === null ? null : (round?.categories.flatMap((c) => (c.name === null ? [] : [c.name])) ?? null)
})
/** Reactions stay out of the way while buzzers open, so nobody taps one by mistake. */
const canReact = computed(() => {
  const status = client.buzzable.value?.status
  return settings.value.reactions && phase.value !== 'lobby' && status !== 'opening' && status !== 'open'
})
/** "Say your answer", with the seconds left when the host uses an answer timer. */
const answerPrompt = computed(() => (answerLeft.value === null ? 'Say your answer' : `Say your answer · ${Math.ceil(answerLeft.value / 1000)} s`))
const emojiOnPhones = computed(() => settings.value.emojiOnPhones)
const bigButton = computed(() => settings.value.buzzStyle === 'button')
const quickDraw = computed(() => settings.value.openMode === 'instant')
/** In quick draw the clue disappears while someone answers. */
const clueHidden = computed(() => cur.value?.status === 'answering' && !cur.value.dailyDouble && cur.value.text === null)
/** Points a false start on this clue costs, for the waiting hint. */
const falseStartCost = computed(() => (cur.value && phase.value === 'clue' ? falseStartPoints(settings.value, cur.value.value) : 0))
/**
 * Audio plays on every phone too: sound shared over a video call is often missing or poor. Pictures and video
 * stay on the TV unless the host turned on media on phones. Answer media replaces the clue's once revealed.
 */
function phoneMedia(media: Media | null | undefined): Media | null {
  return media && (media.type === 'audio' || settings.value.mediaOnPhones) ? media : null
}
const clueMedia = computed(() => phoneMedia(cur.value?.answerMedia ?? cur.value?.media))
const finalMedia = computed(() => phoneMedia(final.value?.answerMedia ?? final.value?.media))
/** The target strip above the pad, when phones show the emoji too. */
const padTarget = computed(() => (emojiOnPhones.value ? phoneTarget.value : undefined))

useWakeLock()

function join() {
  local?.setItem(LAST_NAME_KEY, nameInput.value.trim())
  client.join(nameInput.value)
}

/** Blocked after a false start or a wrong emoji: by this phone's own timer, or by the host. */
const locked = computed(() => stunned.value || lockMs.value > 0)
/** Why: set when this phone got blocked; empty when only the host knows (e.g. after a reload). */
const stunReason = ref('')
watch(locked, (now) => {
  if (!now) stunReason.value = ''
})

/** This player's false starts on the clue, as the host booked them. */
const myFalseStarts = computed(() => cur.value?.falseStarts.filter((f) => isMe(f.playerId)) ?? [])
/** How many of them there were before the latest press, so only a penalty for that press is shown. */
const falseStartsBefore = ref(0)
/** What the host charged for the latest false start; nothing until it says so. */
const charged = computed(() => (myFalseStarts.value.length > falseStartsBefore.value ? myFalseStarts.value.at(-1)!.points : 0))

function press(emoji?: number) {
  const early = !client.buzzersOpen.value
  const before = myFalseStarts.value.length
  const result = client.press(emoji)
  if (result === 'buzzed') navigator.vibrate?.(30)
  if (result === 'stunned') {
    stunReason.value = early ? 'Too early!' : 'Wrong emoji!'
    falseStartsBefore.value = before
    navigator.vibrate?.(60)
  }
}

/** Time left, in steps short lockouts can show too: `2 s`, `0.4 s`. */
const lockLeft = computed(() => {
  const ms = lockMs.value
  return ms >= 1000 ? `${Math.ceil(ms / 1000)} s` : `${Math.max(1, Math.ceil(ms / 100)) / 10} s`
})

function waitingHint(): string {
  if (!bigButton.value) return emojiOnPhones.value ? 'Tap the emoji shown above' : 'Tap the emoji shown on the TV'
  if (phase.value === 'intro' || quickDraw.value) return 'Press when it lights up'
  return falseStartCost.value > 0 ? `Too early costs ${falseStartCost.value}` : 'Too early blocks you for a moment'
}

const pad = computed((): { mode: BuzzPadMode; label: string | null; sublabel: string | null } => {
  const c = cur.value
  const hit = practiceHit.value // only ever set during the intro
  if (hit) return { mode: 'mine', label: 'Got it!', sublabel: formatSeconds(hit.ms) }
  if (phase.value !== 'intro') {
    if (!c || c.status === 'revealed') return { mode: 'done', label: null, sublabel: null }
    if (c.status === 'answering') {
      return isMe(c.buzzWinner)
        ? { mode: 'mine', label: "YOU'RE UP!", sublabel: answerPrompt.value }
        : { mode: 'answering', label: buzzWinnerName.value, sublabel: 'is answering' }
    }
    if (c.lockedOut.includes(client.playerId)) return { mode: 'locked', label: 'Locked out', sublabel: null }
  }
  if (locked.value) {
    const cost = charged.value > 0 ? `−${charged.value} · ` : ''
    return { mode: 'stunned', label: stunReason.value || 'Too early!', sublabel: `${cost}wait ${lockLeft.value}` }
  }
  if (hasBuzzed.value) return { mode: 'buzzed', label: 'Buzzed…', sublabel: null }
  if (canBuzz.value) return { mode: 'ready', label: bigButton.value ? 'BUZZ!' : null, sublabel: null }
  return { mode: 'waiting', label: bigButton.value ? 'Wait for it…' : 'Get ready…', sublabel: waitingHint() }
})

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

/** Keys 1–9 tap the pad row by row, Space presses the big button (handy when testing on a laptop). */
function onKey(event: KeyboardEvent) {
  if (ignoreHotkey(event)) return
  if (event.repeat || cur.value?.dailyDouble || (phase.value !== 'clue' && phase.value !== 'intro')) return
  if (bigButton.value) {
    if (event.code !== 'Space' && !/^(Digit|Numpad)[1-9]$/.test(event.code)) return
    event.preventDefault()
    return press()
  }
  const digit = /^Digit([1-9])$|^Numpad([1-9])$/.exec(event.code)
  if (!digit) return
  event.preventDefault()
  press(Number(digit[1] ?? digit[2]) - 1)
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

      <div v-if="pause" class="panel center stack">
        <h2>{{ pause.message || 'Short break' }} ☕</h2>
        <p v-if="pauseLeft" class="big">Back in {{ formatCountdown(pauseLeft) }}</p>
      </div>

      <!-- Lobby / board -->
      <div v-else-if="phase === 'lobby'" class="panel center">
        <h2>You're in!</h2>
        <p class="muted">Waiting for the host to start.</p>
      </div>

      <template v-else-if="phase === 'intro'">
        <div class="panel center">
          <h2>Practice round</h2>
          <p v-if="bigButton" class="muted">
            Press the button as soon as it lights up. Too early blocks you for {{ formatLockout(settings.lockoutMs) }}.
          </p>
          <p v-else class="muted">
            When an emoji shows up {{ emojiOnPhones ? 'above the pad' : 'on the TV' }}, tap the same one here. Wrong or too early
            blocks you for {{ formatLockout(settings.lockoutMs) }}.
          </p>
        </div>
        <BuzzButton v-if="bigButton" :mode="pad.mode" :label="pad.label" :sublabel="pad.sublabel" @press="press()" />
        <BuzzPad v-else :mode="pad.mode" :label="pad.label" :sublabel="pad.sublabel" :target="padTarget" @press="press" />
      </template>

      <div v-else-if="phase === 'board' && introCategories" class="panel center stack">
        <h2>{{ state.round?.name }}</h2>
        <p class="muted">The categories are…</p>
        <ul class="categories">
          <li v-for="name in introCategories" :key="name" class="gold serif">{{ name }}</li>
        </ul>
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
          <div class="value clue-value">{{ cur.dailyDouble ? 'DAILY DOUBLE' : cur.id === TIEBREAK_ID ? 'TIE-BREAKER' : clueValue }}</div>
          <p v-if="cur.text" class="clue-text serif">{{ cur.text }}</p>
          <p v-else-if="clueHidden" class="muted">🙈 Clue hidden — answer from memory!</p>
          <MediaView
            v-if="clueMedia"
            :key="clueMedia.src"
            :media="clueMedia"
            :progress="cur.answerMedia ? null : revealProgress"
            preload="none"
            class="phone-media"
          />
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

        <div v-else-if="cur.dailyDouble && cur.status === 'answering'" class="answering" :class="{ mine: isMe(cur.buzzWinner) }">
          <template v-if="isMe(cur.buzzWinner)">YOU'RE UP!<small>{{ answerPrompt }}</small></template>
          <template v-else>{{ buzzWinnerName }}<small>is answering</small></template>
        </div>

        <!-- Stays mounted (and the same size) for the whole clue, so nothing jumps between states. -->
        <BuzzButton
          v-else-if="!cur.dailyDouble && bigButton"
          :mode="pad.mode"
          :label="pad.label"
          :sublabel="pad.sublabel"
          @press="press()"
        />
        <BuzzPad
          v-else-if="!cur.dailyDouble"
          :mode="pad.mode"
          :label="pad.label"
          :sublabel="pad.sublabel"
          :target="padTarget"
          @press="press"
        />

        <div v-if="cur.status === 'revealed'" class="panel center">
          <div class="muted">Answer</div>
          <p class="big gold serif">{{ cur.answer }}</p>
          <p v-if="cur.correctPlayer">{{ isMe(cur.correctPlayer) ? 'You got it!' : `${client.nameOf(cur.correctPlayer)} got it` }}</p>
          <SourceLine :source="cur.source" :url="cur.sourceUrl" />
        </div>
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
        <MediaView v-if="finalMedia" :media="finalMedia" preload="none" class="phone-media" />
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
          <MediaView v-if="finalMedia" :media="finalMedia" preload="none" class="phone-media" />
          <SourceLine :source="final.source" :url="final.sourceUrl" />
        </template>
      </div>

      <div v-else-if="phase === 'game_over' && gameOver" class="panel center stack">
        <h2>Game over</h2>
        <p class="big gold">{{ myRank?.rank === 1 ? 'You win!' : `${winners.join(' & ')} ${winners.length > 1 ? 'win' : 'wins'}!` }}</p>
        <p v-if="myRank" class="muted">You finished #{{ myRank.rank }} of {{ gameOver.ranking.length }}.</p>
        <ul v-if="myAwards.length" class="my-awards">
          <li v-for="a in myAwards" :key="a.key">
            {{ a.emoji }} <strong class="gold">{{ a.title }}</strong> <span class="muted">{{ a.detail }}</span>
          </li>
        </ul>
      </div>

      <div v-if="canReact" class="react-row">
        <button v-for="(emoji, i) in REACTIONS" :key="emoji" class="ghost" :aria-label="`React ${emoji}`" @click="client.react(i)">
          {{ emoji }}
        </button>
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
.phone-media {
  width: 100%;
  margin-top: 0.6rem;
}
.phone-media :deep(.media) {
  max-width: 100%;
  margin: 0 auto;
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
.categories {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 1.3rem;
  text-transform: uppercase;
}
.react-row {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
}
.react-row button {
  font-size: 1.6rem;
  padding: 0.3em 0.4em;
}
.my-awards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.3rem;
}
</style>
