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
      <span class="label">{{ label ?? 'BUZZ' }}</span>
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
  width: min(100%, 52vh, 22rem);
  aspect-ratio: 1;
  border-radius: 50%;
  display: grid;
  place-content: center;
  gap: 0.3rem;
  padding: 1.5rem;
  text-align: center;
  color: white;
  text-shadow: 0 2px 8px #000c;
  background: radial-gradient(circle at 40% 35%, #5a4a66, #2a2230);
  border: 6px solid #ffffff22;
  box-shadow: 0 10px 0 #120e16, 0 14px 30px #0008;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, box-shadow 0.15s, transform 0.06s;
}
.buzz:active {
  transform: translateY(6px);
  box-shadow: 0 4px 0 #120e16, 0 6px 16px #0008;
}
.label {
  font-size: clamp(1.6rem, 9vw, 2.6rem);
  font-weight: 900;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}
small {
  font-size: 1rem;
}
.ready {
  background: radial-gradient(circle at 40% 35%, #ff6b6b, #c0161c);
  box-shadow: 0 10px 0 #6d0a0e, 0 0 50px #ff4d4d99;
}
.waiting,
.buzzed,
.locked,
.answering,
.done {
  opacity: 0.75;
}
.stunned {
  background: #3b3b3b;
  animation: shake 0.2s linear;
}
.mine {
  background: var(--gold);
  color: #1a1400;
  text-shadow: none;
}
@keyframes shake {
  0%, 100% { translate: 0; }
  25% { translate: -6px; }
  75% { translate: 6px; }
}
</style>
