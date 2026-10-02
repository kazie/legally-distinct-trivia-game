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
In *Clue: buzzers open* the TV would show 😹, so tap 😹 on the pad (or press 3) to win the race. A wrong
emoji, or tapping before buzzers open, stuns you for 200 ms.

In *Clue: buzzers open, emoji on phones* the host turned on the lobby option for players on a video call:
the emoji to tap shows above the pad, so nobody has to wait for a delayed stream of the TV.
*Clue: audio* plays the clue's sound on the phone too. Pictures stay on the TV.
</docs>
