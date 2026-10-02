import { z } from 'zod'

/** Media must be an absolute http(s) link: no local paths, `data:`, `javascript:` or other schemes. */
export const MediaSrcSchema = z.url({
  protocol: /^https?$/,
  error: 'Media must be an http(s) link, e.g. https://example.com/pic.jpg',
})

export const MediaSchema = z.object({
  type: z.enum(['image', 'audio', 'video']),
  src: MediaSrcSchema,
})

/** Media also arrives over the network, so screens check it again before rendering. */
export function safeMedia(media: Media | null | undefined): Media | null {
  return media && MediaSrcSchema.safeParse(media.src).success ? media : null
}

export const ClueSchema = z.object({
  value: z.number().int().positive(),
  clue: z.string().trim().min(1, 'Clue text is required'),
  answer: z.string().trim().min(1, 'Answer is required'),
  dailyDouble: z.boolean().optional(),
  media: MediaSchema.optional(),
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

export const FinalSchema = z.object({
  category: z.string().trim().min(1),
  clue: z.string().trim().min(1),
  answer: z.string().trim().min(1),
  media: MediaSchema.optional(),
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
})

export type Media = z.infer<typeof MediaSchema>
export type Clue = z.infer<typeof ClueSchema>
export type Category = z.infer<typeof CategorySchema>
export type Round = z.infer<typeof RoundSchema>
export type Final = z.infer<typeof FinalSchema>
export type Board = z.infer<typeof BoardSchema>

export interface BoardIssue {
  path: string
  message: string
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
