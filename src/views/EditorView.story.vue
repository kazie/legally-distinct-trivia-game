<script setup lang="ts">
import EditorView from '@/views/EditorView.vue'
</script>

<template>
  <Story title="Board editor" group="screens" icon="carbon:edit">
    <Variant title="Sample board">
      <EditorView board-id="sample" />
    </Variant>
    <Variant title="No board selected">
      <EditorView />
    </Variant>
  </Story>
</template>

<docs lang="md">
# Board editor

The real editor. Edits autosave as drafts in this browser's localStorage (the same storage as the app on the
same origin), so changes made here show up in the draft list.
</docs>
