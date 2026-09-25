import { inject, onScopeDispose, provide, type InjectionKey } from 'vue'
import { BridgeClient, defaultBridgeUrl, type SocketFactory } from './bridgeClient'

const SOCKET_FACTORY: InjectionKey<SocketFactory> = Symbol('socketFactory')

/** Lets a parent (e.g. a story) route every bridge connection below it somewhere else, like a fake bridge. */
export function provideSocketFactory(factory: SocketFactory): void {
  provide(SOCKET_FACTORY, factory)
}

/** A bridge connection that lives as long as the calling component. */
export function useBridge(): BridgeClient {
  const client = new BridgeClient(defaultBridgeUrl(), { createSocket: inject(SOCKET_FACTORY, undefined) })
  client.connect()
  onScopeDispose(() => client.disconnect())
  return client
}
