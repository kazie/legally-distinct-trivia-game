// Writes boards/board.schema.json from the Zod schema, for editor autocompletion in hand-written boards.
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { BoardSchema } from '../src/content/schema.ts'

const schema = z.toJSONSchema(BoardSchema, { io: 'input', unrepresentable: 'any' })
writeFileSync(new URL('../boards/board.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n')
console.log('Wrote boards/board.schema.json')
