import type { SocketFactory, WebSocketLike } from '@/net/bridgeClient'

/** In-memory stand-in for the araisan event bridge: per-topic seq, echo, fire-and-forget delivery. */
export class FakeBridge {
  private readonly subscribers = new Map<string, Set<FakeSocket>>()
  private readonly seq = new Map<string, number>()
  readonly sockets = new Set<FakeSocket>()
  published: { topic: string; seq: number; data: unknown }[] = []

  factory: SocketFactory = () => {
    const socket = new FakeSocket(this)
    this.sockets.add(socket)
    queueMicrotask(() => socket.accept())
    return socket
  }

  handle(socket: FakeSocket, raw: string) {
    const frame = JSON.parse(raw)
    if (frame.op === 'subscribe') this.topicSet(frame.topic).add(socket)
    else if (frame.op === 'unsubscribe') this.topicSet(frame.topic).delete(socket)
    else if (frame.op === 'publish') {
      const seq = (this.seq.get(frame.topic) ?? 0) + 1
      this.seq.set(frame.topic, seq)
      this.published.push({ topic: frame.topic, seq, data: frame.data })
      const text = JSON.stringify({ op: 'message', topic: frame.topic, seq, data: frame.data })
      for (const sub of this.topicSet(frame.topic)) {
        if (sub === socket && frame.echo === false) continue
        sub.deliver(text)
      }
    }
  }

  /** Simulates a bridge restart: every connection drops and seq numbering restarts. */
  restart() {
    for (const socket of this.sockets) socket.drop()
    this.sockets.clear()
    this.subscribers.clear()
    this.seq.clear()
  }

  remove(socket: FakeSocket) {
    this.sockets.delete(socket)
    for (const set of this.subscribers.values()) set.delete(socket)
  }

  private topicSet(topic: string) {
    let set = this.subscribers.get(topic)
    if (!set) this.subscribers.set(topic, (set = new Set()))
    return set
  }
}

export class FakeSocket implements WebSocketLike {
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null

  constructor(private readonly bridge: FakeBridge) {}

  accept() {
    if (this.readyState !== 0) return
    this.readyState = 1
    this.onopen?.({})
  }

  send(data: string) {
    if (this.readyState !== 1) throw new Error('not open')
    this.bridge.handle(this, data)
  }

  deliver(text: string) {
    // Real sockets deliver asynchronously; keep ordering but break synchronous re-entrancy.
    queueMicrotask(() => this.readyState === 1 && this.onmessage?.({ data: text }))
  }

  drop() {
    if (this.readyState === 3) return
    this.readyState = 3
    this.onclose?.({})
  }

  close() {
    this.bridge.remove(this)
    this.drop()
  }
}

export class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
}

export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
