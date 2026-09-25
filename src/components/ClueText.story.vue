<script setup lang="ts">
import { reactive } from 'vue'
import ClueText from './ClueText.vue'

const state = reactive({ text: 'The Italian dessert whose name means "pick me up"', size: 3 })
const image =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="100%" height="100%" fill="#c1440e"/><circle cx="160" cy="90" r="60" fill="#e27b58"/></svg>',
  )
</script>

<template>
  <Story title="ClueText" group="components" :layout="{ type: 'single', iframe: false }">
    <template #controls>
      <HstTextarea v-model="state.text" title="Text" />
      <HstSlider v-model="state.size" title="Font size (em)" :min="1" :max="5" :step="0.25" />
    </template>
    <Variant title="Text">
      <ClueText :text="state.text" :style="{ fontSize: `${state.size}em` }" />
    </Variant>
    <Variant title="With image">
      <ClueText :text="state.text" :media="{ type: 'image', src: image }" :style="{ fontSize: `${state.size}em` }" />
    </Variant>
  </Story>
</template>
