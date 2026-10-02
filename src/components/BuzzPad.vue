<script setup lang="ts">
import { BUZZ_EMOJIS } from '@/game/buzzPad'

export type BuzzPadMode = 'waiting' | 'ready' | 'stunned' | 'buzzed' | 'locked' | 'answering' | 'mine' | 'done'

defineProps<{
  mode: BuzzPadMode
  /** Shown on top of the grid; the pad keeps its size whatever the text. */
  label?: string | null
  sublabel?: string | null
  /**
   * Emoji to tap (index into BUZZ_EMOJIS), shown in a strip above the grid. `null` keeps the strip empty,
   * so the pad doesn't move when the emoji appears; leave it out for no strip at all.
   */
  target?: number | null
}>()

const emit = defineEmits<{ press: [index: number] }>()
</script>

<template>
  <div v-if="target !== undefined" class="buzz-target" aria-live="assertive">
    {{ target === null ? '' : BUZZ_EMOJIS[target] }}
  </div>
  <div class="pad" :class="mode">
    <div class="grid">
      <button
        v-for="(emoji, i) in BUZZ_EMOJIS"
        :key="emoji"
        class="cell"
        type="button"
        :data-index="i"
        :aria-label="`Buzz with ${emoji}`"
        @pointerdown.prevent="emit('press', i)"
      >
        {{ emoji }}
      </button>
    </div>
    <div v-if="label" class="overlay">
      <span class="label">{{ label }}</span>
      <small v-if="sublabel">{{ sublabel }}</small>
    </div>
  </div>
</template>

<style scoped>
.buzz-target {
  height: 4.5rem;
  display: grid;
  place-items: center;
  font-size: 3.6rem;
  line-height: 1;
}
.pad {
  position: relative;
  width: min(100%, 52vh);
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: 24px;
  padding: 10px;
  background: #2a2230;
  overflow: hidden;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s, box-shadow 0.15s;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  height: 100%;
}
.cell {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-radius: 16px;
  background: #ffffff14;
  font-size: clamp(2rem, 11vw, 3.4rem);
  line-height: 1;
  transition: transform 0.06s, opacity 0.15s, filter 0.15s;
  touch-action: manipulation;
}
.cell:active {
  transform: scale(0.92);
}
.ready {
  background: radial-gradient(circle at 40% 35%, #ff6b6b, #c0161c);
  box-shadow: 0 0 40px #ff4d4d88;
}
.ready .cell {
  background: #ffffff2a;
}
.waiting .cell,
.buzzed .cell,
.locked .cell,
.answering .cell,
.mine .cell,
.done .cell {
  opacity: 0.35;
}
.stunned {
  background: #3b3b3b;
  animation: shake 0.2s linear;
}
.stunned .cell {
  filter: grayscale(1);
  opacity: 0.4;
}
.mine {
  background: var(--gold);
}
.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  padding: 1rem;
  pointer-events: none;
  color: white;
  text-shadow: 0 2px 8px #000c;
}
.label {
  font-size: clamp(1.6rem, 9vw, 2.6rem);
  font-weight: 900;
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}
.overlay small {
  font-size: 1rem;
}
.mine .overlay {
  color: #1a1400;
  text-shadow: none;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
</style>
