<script setup lang="ts">
import { reactive } from 'vue'
import ClueText from './ClueText.vue'

const state = reactive({ text: 'The Italian dessert whose name means "pick me up"', size: 3 })
const image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Tiramisu_-_Raffaele_Diomede.jpg/960px-Tiramisu_-_Raffaele_Diomede.jpg'
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
