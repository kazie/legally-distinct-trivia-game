<script lang="ts">
/** Built once per module, not per icon. */
const PATHS = {
  'sound-on': 'M4 9h4l5-4v14l-5-4H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12',
  'sound-off': 'M4 9h4l5-4v14l-5-4H4z M17 9.5l5 5 M22 9.5l-5 5',
  fullscreen: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  'fullscreen-exit': 'M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5',
  close: 'M6 6l12 12 M18 6L6 18',
  edit: 'M15.5 4.5l4 4L8 20H4v-4z M13 7l4 4',
  pause: 'M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16 M8.5 3.5v2.5 M12 3.5v2.5',
  warning: 'M12 4l9 16H3z M12 10v4.5 M12 17.5v.01',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
} as const

export type IconName = keyof typeof PATHS
</script>

<script setup lang="ts">
/** A small line icon in the current text colour, 1em square. Decorative: put the label on the button. */
defineProps<{ name: IconName }>()
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  vertical-align: -0.125em;
}
</style>
