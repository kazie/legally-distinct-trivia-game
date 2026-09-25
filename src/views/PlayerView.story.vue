<script setup lang="ts">
import StoryPlayer from '@/dev/StoryPlayer.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, CID, scenarioNames } from '@/dev/scenarios'
</script>

<template>
  <Story
    title="Player phone"
    group="screens"
    icon="carbon:mobile"
    :layout="{ type: 'grid', width: 400 }"
    responsive-disabled
  >
    <Variant title="Join form">
      <StoryRoom scenario="Lobby"><StoryPlayer /></StoryRoom>
    </Variant>
    <!-- Signed in as Ann. Bob and Cid are bots that buzz slowly, so you can win the race. -->
    <Variant v-for="name in scenarioNames" :key="name" :title="name">
      <StoryRoom :scenario="name" :bots="[BOB, CID]" :bot-options="{ reactionMs: [2500, 5000] }">
        <StoryPlayer :player-id="ANN" />
      </StoryRoom>
    </Variant>
  </Story>
</template>

<docs lang="md">
# Player phone

The real `PlayerView`, signed in as **Ann**, in a game room on an in-memory bridge.
Bob and Cid are bots: they buzz 2.5–5 s after buzzers open and place wagers on their own.
Press **BUZZ!** (or Space) in *Clue: buzzers open* to win the race.
</docs>
