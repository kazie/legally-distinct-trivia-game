<script setup lang="ts">
import type { BuzzPadMode } from './BuzzPad.vue'

defineProps<{
  mode: BuzzPadMode
  /** Shown on the button; it keeps its size whatever the text. */
  label?: string | null
  sublabel?: string | null
}>()

const emit = defineEmits<{ press: [] }>()

/**
 * Presses fire on pointer down, a click's worth of time sooner than `click`. That pointer press is followed
 * by a click, which is skipped. A click without one (Enter, a screen reader, switch access) presses too.
 */
let pointerPressedAt = -Infinity
/** A click this soon after a pointer press belongs to it. */
const CLICK_AFTER_POINTER_MS = 1000

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return // only the primary button: a right-click must not buzz
  event.preventDefault()
  pointerPressedAt = performance.now()
  emit('press')
}

function onClick() {
  if (performance.now() - pointerPressedAt > CLICK_AFTER_POINTER_MS) emit('press')
}
</script>

<template>
  <div class="wrap">
    <button class="buzz" :class="mode" type="button" aria-label="Buzz" @pointerdown="onPointerDown" @click="onClick">
      <span class="buzz-label">{{ label ?? 'BUZZ' }}</span>
      <small v-if="sublabel">{{ sublabel }}</small>
    </button>
  </div>
</template>

<style scoped>
.wrap {
  display: grid;
  place-items: center;
  padding: 0.5rem 0;
}
.buzz {
  --face: var(--buzz-idle);
  --edge: var(--buzz-idle-edge);
  width: min(100%, 52vh, 22rem);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-content: center;
  gap: 0.3rem;
  padding: 1.5rem;
  text-align: center;
  color: white;
  text-shadow: 0 2px 0 var(--shadow-text);
  background: var(--face);
  border: 6px solid #ffffff1f;
  /* A lit rim on top and a solid base underneath: it looks like it can be pushed. */
  box-shadow:
    inset 0 6px 0 var(--buzz-rim),
    0 10px 0 var(--edge),
    0 14px 24px #0007;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, box-shadow 0.15s, transform 0.06s;
}
.buzz:active {
  transform: translateY(6px);
  box-shadow:
    inset 0 6px 0 var(--buzz-rim),
    0 4px 0 var(--edge),
    0 6px 12px #0007;
}
small {
  font-size: 1rem;
}
.ready {
  --face: var(--buzz-ready);
  --edge: var(--buzz-ready-edge);
}
.waiting,
.buzzed,
.locked,
.answering,
.done {
  opacity: 0.75;
}
.stunned {
  --face: var(--buzz-stunned);
  animation: buzz-shake 0.2s linear;
}
.mine {
  --face: var(--gold);
  --edge: var(--gold-edge);
  color: var(--on-gold);
  text-shadow: none;
}
</style>
