import { inject, provide, type InjectionKey } from 'vue'
import type { KeyValueStorage } from './game/hostController'

/** Web storage that may be unavailable (private mode, blocked site data). */
function safe(get: () => Storage): KeyValueStorage | null {
  try {
    const storage = get()
    const probe = '__ldtg_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

export const local = safe(() => localStorage)
/**
 * Player identity lives per tab, so several tabs in one browser can play as different people
 * while a reload keeps the same player.
 */
export const session = safe(() => sessionStorage)

export const LAST_NAME_KEY = 'ldtg:lastName'
export const LAST_HOST_ROOM_KEY = 'ldtg:lastHostRoom'
export const SHOW_INTRO_KEY = 'ldtg:showIntro'

export interface Storages {
  local: KeyValueStorage | null
  session: KeyValueStorage | null
}

const STORAGES: InjectionKey<Storages> = Symbol('storages')

/** The storages views should use: the browser's, unless a parent (e.g. a story) provided others. */
export function useStorages(): Storages {
  return inject(STORAGES, { local, session })
}

export function provideStorages(storages: Partial<Storages>): void {
  provide(STORAGES, { ...useStorages(), ...storages })
}
