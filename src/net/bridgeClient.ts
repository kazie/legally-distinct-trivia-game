/**
 * Minimal client for the araisan-meme-eventbridge WebSocket pub/sub protocol:
 *   → {op: subscribe|unsubscribe, topic} / {op: publish, topic, data, echo?}
 *   ← {op: message, topic, seq, data} / {op: error, message}
 *
 * Reconnects with backoff, re-subscribes, and drops messages whose seq is not newer than the last one seen
 * (seq is reset on every reconnect because the bridge restarts numbering when it restarts).
 */

export type ConnectionStatus = 'connecting' | 'open' | 'closed'

export type MessageHandler = (data: unknown, seq: number) => void

/** The subset of the browser WebSocket this client needs, so tests can pass a fake. */
export interface WebSocketLike {
  readonly readyState: number
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
  send(data: string): void
  close(): void
}

export type SocketFactory = (url: string) => WebSocketLike

export interface BridgeClientOptions {
  createSocket?: SocketFactory
  minBackoffMs?: number
  maxBackoffMs?: number
}

const OPEN = 1

export class BridgeClient {
  private socket: WebSocketLike | null = null
  private readonly handlers = new Map<string, Set<MessageHandler>>()
  private readonly lastSeq = new Map<string, number>()
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>()
  private readonly createSocket: SocketFactory
  private readonly minBackoffMs: number
  private readonly maxBackoffMs: number
  private backoffMs: number
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true
  status: ConnectionStatus = 'closed'

  constructor(
    readonly url: string,
    options: BridgeClientOptions = {},
  ) {
    this.createSocket = options.createSocket ?? ((u) => new WebSocket(u) as unknown as WebSocketLike)
    this.minBackoffMs = options.minBackoffMs ?? 500
    this.maxBackoffMs = options.maxBackoffMs ?? 8000
    this.backoffMs = this.minBackoffMs
  }

  connect(): void {
    if (!this.stopped) return
    this.stopped = false
    this.open()
  }

  disconnect(): void {
    this.stopped = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const socket = this.socket
    this.socket = null
    socket?.close()
    this.setStatus('closed')
  }

  /** Subscribes to a topic; returns an unsubscribe function. */
  subscribe(topic: string, handler: MessageHandler): () => void {
    let set = this.handlers.get(topic)
    if (!set) {
      set = new Set()
      this.handlers.set(topic, set)
      this.send({ op: 'subscribe', topic })
    }
    set.add(handler)
    return () => {
      const current = this.handlers.get(topic)
      if (!current) return
      current.delete(handler)
      if (current.size === 0) {
        this.handlers.delete(topic)
        this.lastSeq.delete(topic)
        this.send({ op: 'unsubscribe', topic })
      }
    }
  }

  /**
   * Publishes to a topic. Returns false (and drops the message) when not connected;
   * callers rely on state snapshots rather than on delivery of stale intents like buzzes.
   */
  publish(topic: string, data: unknown, options: { echo?: boolean } = {}): boolean {
    const frame: Record<string, unknown> = { op: 'publish', topic, data }
    if (options.echo === false) frame.echo = false
    return this.send(frame)
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  private send(frame: Record<string, unknown>): boolean {
    if (this.socket?.readyState !== OPEN) return false
    this.socket.send(JSON.stringify(frame))
    return true
  }

  private open() {
    this.setStatus('connecting')
    let socket: WebSocketLike
    try {
      socket = this.createSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      this.backoffMs = this.minBackoffMs
      this.lastSeq.clear()
      for (const topic of this.handlers.keys()) this.send({ op: 'subscribe', topic })
      this.setStatus('open')
    }
    socket.onmessage = (event) => {
      if (this.socket === socket && typeof event.data === 'string') this.receive(event.data)
    }
    socket.onerror = () => {
      // onclose follows and handles reconnecting.
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      this.setStatus('closed')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return
    const delay = this.backoffMs
    this.backoffMs = Math.min(this.maxBackoffMs, this.backoffMs * 2)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.open()
    }, delay)
  }

  private receive(raw: string) {
    let frame: { op?: unknown; topic?: unknown; seq?: unknown; data?: unknown; message?: unknown }
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (frame.op === 'error') {
      console.warn('[bridge] error:', frame.message)
      return
    }
    if (frame.op !== 'message' || typeof frame.topic !== 'string' || typeof frame.seq !== 'number') return
    const last = this.lastSeq.get(frame.topic) ?? 0
    if (frame.seq <= last) return
    this.lastSeq.set(frame.topic, frame.seq)
    for (const handler of this.handlers.get(frame.topic) ?? []) handler(frame.data, frame.seq)
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
}

/** Bridge URL from VITE_BRIDGE_URL, defaulting to port 8080 on the host serving the page (handy on a LAN). */
export function defaultBridgeUrl(): string {
  const configured = import.meta.env.VITE_BRIDGE_URL as string | undefined
  if (configured) return configured
  const secure = location.protocol === 'https:'
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8080/ws`
}
