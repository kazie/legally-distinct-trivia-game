import { z } from 'zod'

/** Media must be an absolute http(s) link: no local paths, `data:`, `javascript:` or other schemes. */
export const MediaSrcSchema = z.url({
  protocol: /^https?$/,
  error: 'Media must be an http(s) link, e.g. https://example.com/pic.jpg',
})

/** Default length of a blur reveal, in seconds of open buzzers. */
export const DEFAULT_REVEAL_SECONDS = 15

export const RevealSchema = z.object({
  /** The picture starts blurred and sharpens while buzzers are open. */
  style: z.literal('blur'),
  /** Buzzer-open seconds until the picture is sharp (default 15). */
  seconds: z.number().min(3).max(120).optional(),
  /** The earlier someone buzzes in, the more the clue is worth: from the full value down to half. */
  shrinkPoints: z.boolean().optional(),
})

export const MediaSchema = z
  .object({
    type: z.enum(['image', 'audio', 'video']),
    src: MediaSrcSchema,
    /** Audio/video only: play just this part of the file (seconds). */
    start: z.number().min(0).optional(),
    end: z.number().positive().optional(),
    /** Images only. */
    reveal: RevealSchema.optional(),
  })
  .superRefine((media, ctx) => {
    if (media.type === 'image' && (media.start !== undefined || media.end !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['start'], message: 'Only audio and video can have a start and end' })
    }
    if (media.end !== undefined && media.end <= (media.start ?? 0)) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'End must be after the start' })
    }
    if (media.type !== 'image' && media.reveal) {
      ctx.addIssue({ code: 'custom', path: ['reveal'], message: 'Only pictures can be revealed bit by bit' })
    }
  })

/** Media also arrives over the network, so screens check it again before rendering. */
export function safeMedia(media: Media | null | undefined): Media | null {
  return media && MediaSrcSchema.safeParse(media.src).success ? media : null
}

/** Extras that go with the answer. The host always sees them; players get media and source once it's revealed. */
const answerExtras = {
  /** Replaces the clue's media on the TV when the answer is revealed. */
  answerMedia: MediaSchema.optional(),
  /** Where the fact comes from, for disputes. */
  source: z.string().trim().min(1).optional(),
  sourceUrl: MediaSrcSchema.optional(),
  /** Other answers to count as right, e.g. "Armstrong" for "Neil Armstrong". Only the host sees them. */
  acceptedAnswers: z.array(z.string().trim().min(1)).optional(),
}

export const ClueSchema = z.object({
  value: z.number().int().positive(),
  clue: z.string().trim().min(1, 'Clue text is required'),
  answer: z.string().trim().min(1, 'Answer is required'),
  dailyDouble: z.boolean().optional(),
  media: MediaSchema.optional(),
  ...answerExtras,
  /** Only ever shown to the host. */
  notes: z.string().optional(),
})

export const CategorySchema = z.object({
  name: z.string().trim().min(1, 'Category name is required'),
  clues: z.array(ClueSchema).min(1, 'A category needs at least one clue'),
})

export const RoundSchema = z
  .object({
    name: z.string().trim().min(1),
    categories: z.array(CategorySchema).min(1, 'A round needs at least one category'),
    /** Number of Daily Doubles the host picks at random when the game starts (on top of flagged clues). */
    randomDailyDoubles: z.number().int().min(0).optional(),
  })
  .superRefine((round, ctx) => {
    const size = round.categories[0]?.clues.length ?? 0
    round.categories.forEach((category, c) => {
      if (category.clues.length !== size) {
        ctx.addIssue({
          code: 'custom',
          path: ['categories', c, 'clues'],
          message: `Every category in a round needs the same number of clues (expected ${size})`,
        })
      }
      category.clues.forEach((clue, i) => {
        const previous = category.clues[i - 1]
        if (previous && clue.value < previous.value) {
          ctx.addIssue({
            code: 'custom',
            path: ['categories', c, 'clues', i, 'value'],
            message: 'Clue values must be in ascending order',
          })
        }
      })
    })
  })

/** A clue on its own, outside the grid: the final round and the tie-breaker. */
export const FinalSchema = z.object({
  category: z.string().trim().min(1),
  clue: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  media: MediaSchema.optional(),
  ...answerExtras,
  notes: z.string().optional(),
})

export const BoardSchema = z.object({
  $schema: z.string().optional(),
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits and dashes'),
  title: z.string().trim().min(1),
  rounds: z.array(RoundSchema).min(1, 'A board needs at least one round'),
  final: FinalSchema.optional(),
  /** Played only when the game ends with first place tied: a buzzer clue for the tied players. */
  tiebreaker: FinalSchema.optional(),
})

export type Media = z.infer<typeof MediaSchema>
export type Reveal = z.infer<typeof RevealSchema>
export type Clue = z.infer<typeof ClueSchema>
export type Category = z.infer<typeof CategorySchema>
export type Round = z.infer<typeof RoundSchema>
export type Final = z.infer<typeof FinalSchema>
export type Board = z.infer<typeof BoardSchema>

export interface BoardIssue {
  path: string
  message: string
}

/** Issue path of one clue, as validation reports it: `rounds.0.categories.2.clues.4`. */
export function cluePath(round: number, category: number, clue: number): string {
  return `rounds.${round}.categories.${category}.clues.${clue}`
}

/** The clue an issue path points at (or inside), if any. */
export function parseCluePath(path: string): { round: number; category: number; clue: number } | null {
  const match = /^rounds\.(\d+)\.categories\.(\d+)\.clues\.(\d+)(?:\.|$)/.exec(path)
  return match ? { round: Number(match[1]), category: Number(match[2]), clue: Number(match[3]) } : null
}

export type BoardValidation = { ok: true; board: Board } | { ok: false; issues: BoardIssue[] }

export function validateBoard(input: unknown): BoardValidation {
  const result = BoardSchema.safeParse(input)
  if (result.success) return { ok: true, board: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  }
}

export function emptyBoard(id = 'new-board'): Board {
  const values = [200, 400, 600, 800, 1000]
  return {
    id,
    title: 'New board',
    rounds: [
      {
        name: 'Round 1',
        categories: Array.from({ length: 5 }, (_, c) => ({
          name: `Category ${c + 1}`,
          clues: values.map((value) => ({ value, clue: '', answer: '' })),
        })),
      },
    ],
  }
}
