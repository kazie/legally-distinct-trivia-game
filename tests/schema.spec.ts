import { describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { emptyBoard, validateBoard } from '@/content/schema'

describe('board schema', () => {
  it('accepts the sample board', () => {
    const result = validateBoard(sample)
    expect(result.ok ? [] : result.issues).toEqual([])
  })

  it('rejects categories with different clue counts', () => {
    const board = emptyBoard('x')
    board.rounds[0]!.categories.forEach((c) => c.clues.forEach((clue) => Object.assign(clue, { clue: 'q', answer: 'a' })))
    board.rounds[0]!.categories[1]!.clues.pop()
    const result = validateBoard(board)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0]!.path).toBe('rounds.0.categories.1.clues')
  })

  it('rejects descending values, empty answers and bad ids', () => {
    const board = emptyBoard('Bad Id')
    const clues = board.rounds[0]!.categories[0]!.clues
    clues.forEach((clue) => Object.assign(clue, { clue: 'q', answer: 'a' }))
    clues[0]!.value = 5000
    clues[1]!.answer = ''
    const result = validateBoard(board)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const paths = result.issues.map((i) => i.path)
      expect(paths).toContain('id')
      expect(paths).toContain('rounds.0.categories.0.clues.1.answer')
      expect(paths).toContain('rounds.0.categories.0.clues.1.value')
    }
  })
})
