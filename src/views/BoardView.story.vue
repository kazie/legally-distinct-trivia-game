<script setup lang="ts">
import BoardView from '@/views/BoardView.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, CID, DEMO_ROOM, scenarioNames } from '@/dev/scenarios'
</script>

<template>
  <Story title="Board screen (TV)" group="screens" icon="carbon:screen">
    <Variant v-for="name in scenarioNames" :key="name" :title="name">
      <StoryRoom :scenario="name" :bots="[ANN, BOB, CID]">
        <BoardView :room="DEMO_ROOM" />
      </StoryRoom>
    </Variant>
  </Story>
</template>

<docs lang="md">
# Board screen

The real `BoardView` for the shared TV or projector. A host without a UI runs each scenario, and
Ann, Bob and Cid are bots, so *Clue: buzzers open* plays out by itself.
</docs>
