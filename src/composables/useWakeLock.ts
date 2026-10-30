import { onMounted, onUnmounted } from 'vue'
import mp4 from '@/assets/keep-awake.mp4'
import webm from '@/assets/keep-awake.webm'

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(type: 'release', fn: () => void): void }
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> }

/**
 * Keeps the screen on while the page is open, so phones and the TV don't go to sleep mid-game.
 *
 * Uses the Wake Lock API when the browser has it. That only exists in secure contexts, and LDTG usually runs
 * on plain `http://<LAN-IP>`, so otherwise it plays a tiny silent looping video (no audio track, muted, inline,
 * attached to the page) and restarts it whenever something pauses it.
 *
 * Neither needs a user gesture in current browsers, so it starts on mount. If the browser still refuses, the
 * next click or key press tries again.
 */
export function useWakeLock() {
  let active = false
  let disposed = false
  let starting: Promise<void> | null = null
  let sentinel: Sentinel | null = null
  let video: HTMLVideoElement | null = null

  const api = (): WakeLockApi | null =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator ? (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock : null

  async function lockNative(wakeLock: WakeLockApi) {
    if (sentinel && !sentinel.released) return
    const next = await wakeLock.request('screen')
    if (disposed) return void next.release().catch(() => {})
    sentinel = next
    next.addEventListener('release', () => {
      if (sentinel !== next) return
      sentinel = null
      // Released while still in view (battery saver, the OS): take it again. Hidden tabs wait for `onVisible`.
      if (!disposed && active && document.visibilityState === 'visible') {
        active = false
        void enable()
      }
    })
  }

  function makeVideo(): HTMLVideoElement {
    const v = document.createElement('video')
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    // Browsers only keep the screen on for a video that is on the page and in view.
    v.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1'
    for (const [src, type] of [
      [webm, 'video/webm'],
      [mp4, 'video/mp4'],
    ]) {
      const source = document.createElement('source')
      source.src = src!
      source.type = type!
      v.append(source)
    }
    v.addEventListener('pause', () => {
      // Another media element or the OS paused it: start again while we still want the screen on.
      if (!disposed && active && document.visibilityState === 'visible') void v.play().catch(() => {})
    })
    document.body.append(v)
    return v
  }

  async function start() {
    const wakeLock = api()
    if (wakeLock) {
      try {
        return await lockNative(wakeLock)
      } catch {
        // Refused (e.g. a permissions policy): the video may still work.
      }
    }
    video ??= makeVideo()
    await video.play()
  }

  /** Turns the wake lock on. Safe to call repeatedly; calls close together share one attempt. */
  function enable(): Promise<void> {
    if (disposed) return Promise.resolve()
    starting ??= start()
      .then(() => {
        if (disposed) return
        active = true
        removeGestureListeners()
      })
      .catch(() => {
        // Refused (no gesture yet, battery saver, unsupported): the next tap or key press retries.
        if (!disposed) addGestureListeners()
      })
      .finally(() => (starting = null))
    return starting
  }

  const onGesture = () => void enable()
  const events = ['click', 'keydown'] as const
  function addGestureListeners() {
    events.forEach((e) => window.addEventListener(e, onGesture, { capture: true }))
  }
  function removeGestureListeners() {
    events.forEach((e) => window.removeEventListener(e, onGesture, { capture: true }))
  }

  // Both kinds stop while the tab is hidden; start again when it comes back.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && active) {
      active = false
      void enable()
    }
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisible)
    void enable()
  })

  onUnmounted(() => {
    disposed = true
    active = false
    removeGestureListeners()
    document.removeEventListener('visibilitychange', onVisible)
    void sentinel?.release().catch(() => {})
    sentinel = null
    if (video) {
      video.pause()
      video.remove()
      video = null
    }
  })

  return { enable }
}
