<script setup lang="ts">
import HostView from '@/views/HostView.vue'
import StoryRoom from '@/dev/StoryRoom.vue'
import { ANN, BOB, CID, DEMO_ROOM, scenarioNames } from '@/dev/scenarios'
</script>

<template>
  <Story title="Host control panel" group="screens" icon="carbon:dashboard">
    <Variant v-for="name in scenarioNames" :key="name" :title="name">
      <StoryRoom :scenario="name" :headless-host="false" :bots="[ANN, BOB, CID]">
        <HostView :room="DEMO_ROOM" />
      </StoryRoom>
    </Variant>
  </Story>
</template>

<docs lang="md">
# Host control panel

The real `HostView`. It's fully interactive: Ann, Bob and Cid are bots that buzz when you open buzzers,
wager on Daily Doubles, and play the final round. You can use the keyboard shortcuts too (Space, C, X, R, Enter, Z). The emoji players must tap shows next to
"Buzzers open".
</docs>
