import { z } from 'zod'
import type { PublicState } from '@/game/types'

export const PROTOCOL_VERSION = 1

const id = z.string().min(1).max(64)
const base = { v: z.literal(PROTOCOL_VERSION) }

export const MessageSchema = z.discriminatedUnion('type', [
  // Host → everyone
  z.object({ ...base, type: z.literal('state'), from: z.literal('host'), state: z.looseObject({ roomCode: z.string() }) }),
  z.object({ ...base, type: z.literal('buzzers_open'), from: z.literal('host'), clueId: z.string(), attempt: z.number().int() }),
  // Players and board screens → host
  z.object({ ...base, type: z.literal('hello'), from: z.enum(['player', 'board']), playerId: id.optional() }),
  z.object({ ...base, type: z.literal('ping'), from: z.literal('player'), playerId: id }),
  z.object({ ...base, type: z.literal('join'), from: z.literal('player'), playerId: id, name: z.string().max(64) }),
  z.object({
    ...base,
    type: z.literal('buzz'),
    from: z.literal('player'),
    playerId: id,
    clueId: z.string(),
    attempt: z.number().int(),
  }),
  z.object({
    ...base,
    type: z.literal('wager'),
    from: z.literal('player'),
    playerId: id,
    kind: z.enum(['daily', 'final']),
    amount: z.number(),
  }),
  z.object({ ...base, type: z.literal('final_answer'), from: z.literal('player'), playerId: id, text: z.string().max(500) }),
])

export type Message = z.infer<typeof MessageSchema>
export type StateMessage = Omit<Extract<Message, { type: 'state' }>, 'state'> & { state: PublicState }

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
/** A message without the version field, which `encode` adds. */
export type OutgoingMessage = DistributiveOmit<Message, 'v' | 'state'> | Omit<StateMessage, 'v'>

export function encode(message: OutgoingMessage): Record<string, unknown> {
  return { v: PROTOCOL_VERSION, ...message }
}

export function decode(data: unknown): Message | null {
  const result = MessageSchema.safeParse(data)
  return result.success ? result.data : null
}
