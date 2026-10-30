<script setup lang="ts">
import type { Clue, Final } from '@/content/schema'

/** Editor fields that go with an answer: other accepted answers and the source. Edits the draft object in place. */
defineProps<{ item: Clue | Final }>()

/** Empty removes the field: all of them are optional, and an empty source or link wouldn't validate. */
function set(item: Clue | Final, key: 'source' | 'sourceUrl', raw: string) {
  if (raw.trim() === '') delete item[key]
  else item[key] = raw
}

/** "Armstrong; Neil A. Armstrong" → two answers. */
function setAccepted(item: Clue | Final, raw: string) {
  const answers = raw.split(';').map((a) => a.trim()).filter(Boolean)
  if (answers.length) item.acceptedAnswers = answers
  else delete item.acceptedAnswers
}
</script>

<template>
  <label>
    Also accept (host only, separate with ;)
    <input
      :value="item.acceptedAnswers?.join('; ') ?? ''"
      placeholder="e.g. Armstrong; Neil A. Armstrong"
      @change="setAccepted(item, ($event.target as HTMLInputElement).value)"
    />
  </label>
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
