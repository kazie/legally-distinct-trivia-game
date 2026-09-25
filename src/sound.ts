/** Tiny synthesized sound effects, so the project ships no audio assets. */

type Effect = 'buzz' | 'open' | 'correct' | 'timeout'

const TONES: Record<Effect, { freq: number; ms: number; type: OscillatorType }[]> = {
  buzz: [{ freq: 220, ms: 350, type: 'square' }],
  open: [{ freq: 880, ms: 120, type: 'sine' }],
  correct: [
    { freq: 660, ms: 120, type: 'triangle' },
    { freq: 990, ms: 220, type: 'triangle' },
  ],
  timeout: [
    { freq: 400, ms: 180, type: 'sawtooth' },
    { freq: 300, ms: 300, type: 'sawtooth' },
  ],
}

let ctx: AudioContext | null = null

export function beep(effect: Effect): void {
  try {
    ctx ??= new AudioContext()
    let t = ctx.currentTime
    for (const tone of TONES[effect]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.value = tone.freq
      gain.gain.setValueAtTime(0.15, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + tone.ms / 1000)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + tone.ms / 1000)
      t += tone.ms / 1000
    }
  } catch {
    // No audio available; the game works silently.
  }
}
