<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { generateRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '@/game/roomCode'
import { LAST_HOST_ROOM_KEY, useStorages } from '@/storage'

const router = useRouter()
const code = ref('')
const { local } = useStorages()
const lastHostRoom = local?.getItem(LAST_HOST_ROOM_KEY) ?? null

function go(name: 'play' | 'board') {
  const room = normalizeRoomCode(code.value)
  if (room.length === ROOM_CODE_LENGTH) router.push({ name, params: { room } })
}
</script>

<template>
  <main class="home">
    <h1 class="serif title">Legally Distinct <span class="gold">Trivia</span></h1>
    <p class="muted">Pick a clue. Buzz first. Just say the answer.</p>

    <section class="panel stack">
      <h2>Join a game</h2>
      <form class="stack" @submit.prevent="go('play')">
        <label>
          Room code
          <input
            v-model="code"
            class="code"
            :maxlength="ROOM_CODE_LENGTH"
            autocomplete="off"
            autocapitalize="characters"
            placeholder="ABCD"
            @input="code = normalizeRoomCode(code)"
          />
        </label>
        <div class="row">
          <button class="primary" type="submit" :disabled="code.length !== ROOM_CODE_LENGTH">Join as player</button>
          <button type="button" :disabled="code.length !== ROOM_CODE_LENGTH" @click="go('board')">Open board screen</button>
        </div>
      </form>
    </section>

    <section class="panel stack">
      <h2>Host</h2>
      <div class="row">
        <RouterLink class="btn primary" :to="{ name: 'host', params: { room: generateRoomCode() } }">Host a new game</RouterLink>
        <RouterLink v-if="lastHostRoom" class="btn" :to="{ name: 'host', params: { room: lastHostRoom } }">
          Resume {{ lastHostRoom }}
        </RouterLink>
        <RouterLink class="btn" :to="{ name: 'editor' }">Board editor</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home {
  max-width: 560px;
  margin: 0 auto;
  padding: 2rem 16px;
  display: grid;
  gap: 1rem;
}
.title {
  font-size: clamp(2rem, 8vw, 3.2rem);
  margin: 0;
}
.code {
  font-size: 2rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  text-align: center;
}
</style>
