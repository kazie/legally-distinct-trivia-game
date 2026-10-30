<script setup lang="ts">
import type { Clue, Final } from '@/content/schema'

/** Editor fields for where a fact comes from. Edits the draft object in place. */
defineProps<{ item: Clue | Final }>()

/** Empty removes the field: both are optional, and an empty source or link wouldn't validate. */
function set(item: Clue | Final, key: 'source' | 'sourceUrl', raw: string) {
  if (raw.trim() === '') delete item[key]
  else item[key] = raw
}
</script>

<template>
  <div class="row">
    <label class="grow">
      Source (optional, shown with the answer)
      <input :value="item.source ?? ''" placeholder="e.g. NASA" @input="set(item, 'source', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="grow">
      Source link
      <input :value="item.sourceUrl ?? ''" placeholder="https://…" @input="set(item, 'sourceUrl', ($event.target as HTMLInputElement).value)" />
    </label>
  </div>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 200px;
}
</style>
