<script setup lang="ts">
import { computed } from 'vue'
import { MediaSrcSchema } from '@/content/schema'

const props = defineProps<{ source: string | null | undefined; url: string | null | undefined }>()

/** Links arrive over the network too: only http(s) ones become links. */
const href = computed(() => (props.url && MediaSrcSchema.safeParse(props.url).success ? props.url : null))
const label = computed(() => props.source || (href.value ? new URL(href.value).hostname : null))
</script>

<template>
  <p v-if="label" class="source">
    Source:
    <a v-if="href" :href="href" target="_blank" rel="noopener noreferrer">{{ label }}</a>
    <template v-else>{{ label }}</template>
  </p>
</template>

<style scoped>
.source {
  margin: 0;
  font-size: 0.9em;
  color: var(--muted);
}
</style>
