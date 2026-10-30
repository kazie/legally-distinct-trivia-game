import { describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { lintBoard } from '@/content/lint'
import { normalizeAnswer, significantWords } from '@/content/normalize'
import { BoardSchema, type Board } from '@/content/schema'

function board(clues: Pick<Board['rounds'][0]['categories'][0]['clues'][0], 'clue' | 'answer' | 'media'>[], extra: Partial<Board> = {}): Board {
  return {
    id: 'lint',
    title: 'Lint',
    rounds: [{ name: 'R1', categories: [{ name: 'Cat', clues: clues.map((c, i) => ({ value: (i + 1) * 100, ...c })) }] }],
    ...extra,
  }
}

describe('normalizeAnswer', () => {
  it('ignores case, accents, punctuation and a leading article', () => {
    expect(normalizeAnswer('  The Beatles! ')).toBe('beatles')
    expect(normalizeAnswer('Café Crème')).toBe('cafe creme')
    expect(normalizeAnswer('AC/DC')).toBe('ac dc')
    expect(normalizeAnswer('Tom & Jerry')).toBe('tom and jerry')
  })

  it('keeps only meaningful words', () => {
    expect(significantWords(normalizeAnswer('The Tower of London and Paris'))).toEqual(['tower', 'london', 'paris'])
  })
})

describe('lintBoard', () => {
  it('flags an answer given away by its clue', () => {
    const warnings = lintBoard(board([{ clue: 'This planet, Mars, is red', answer: 'Mars' }]))
    expect(warnings).toEqual([{ path: 'rounds.0.categories.0.clues.0', message: 'The answer appears in the clue' }])
  })

  it('flags part of a multi-word answer in the clue', () => {
    const [warning] = lintBoard(board([{ clue: 'Gustave built this Paris landmark', answer: 'Eiffel Tower by Gustave' }]))
    expect(warning?.message).toContain('"gustave"')
  })

  it('does not flag words that only contain the answer', () => {
    expect(lintBoard(board([{ clue: 'Marshmallows are made from this', answer: 'Mars' }]))).toEqual([])
  })

  it('flags duplicate answers and clues, long clues and long category names', () => {
    const b = board(
      [
        { clue: 'Red planet', answer: 'Mars' },
        { clue: 'Red planet', answer: 'the mars' },
        { clue: 'x'.repeat(201), answer: 'Long' },
      ],
      { final: { category: 'F', clue: 'Fourth planet', answer: 'Mars' } },
    )
    b.rounds[0]!.categories[0]!.name = 'A category name that is far too long'
    const messages = lintBoard(b).map((w) => `${w.path}: ${w.message}`)
    expect(messages).toEqual([
      'rounds.0.categories.0.name: Long category name may not fit the board',
      'rounds.0.categories.0.clues.1: Same answer as rounds.0.categories.0.clues.0',
      'rounds.0.categories.0.clues.1: Same clue as rounds.0.categories.0.clues.0',
      'rounds.0.categories.0.clues.2: Long clue (201 characters) may not fit the TV',
      'final: Same answer as rounds.0.categories.0.clues.0',
    ])
  })


  it('does not flag answers made only of short common words', () => {
    expect(lintBoard(board([{ clue: 'This band who sang My Generation', answer: 'The Who' }]))).toEqual([])
    expect(lintBoard(board([{ clue: 'The band behind This Is the Day', answer: 'The The' }]))).toEqual([])
  })

  it('flags short multi-word answers, and skips duplicates of text with no letters', () => {
    expect(lintBoard(board([{ clue: 'This 1986 film, Top Gun, starred Tom Cruise', answer: 'Top Gun' }])).map((w) => w.message)).toEqual([
      'The answer appears in the clue',
    ])
    expect(lintBoard(board([{ clue: '🦁👑', answer: '🍎' }, { clue: '🧊❄️', answer: '🍌' }]))).toEqual([])
  })

  it('treats clues with the same text but different media as different', () => {
    const song = (src: string) => ({ clue: 'Name this song', answer: src, media: { type: 'audio' as const, src: `https://e.x/${src}.mp3` } })
    expect(lintBoard(board([song('one'), song('two')]))).toEqual([])
    expect(lintBoard(board([song('one'), { ...song('two'), media: song('one').media }])).map((w) => w.message)).toEqual([
      'Same clue as rounds.0.categories.0.clues.0',
    ])
  })

  it('reports what it finds in the sample board', () => {
    // Not an assertion on content quality, just that a real board lints without throwing.
    expect(Array.isArray(lintBoard(BoardSchema.parse(sample)))).toBe(true)
  })
})
