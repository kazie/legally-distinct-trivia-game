import { describe, expect, it } from 'vitest'
import { allAnswers, levenshtein, matchAnswer } from '@/game/fuzzy'

describe('fuzzy answer matching', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('mars', 'mars')).toBe(0)
  })

  it('matches the same answer written differently exactly', () => {
    expect(matchAnswer('the beatles!', ['The Beatles'])).toBe('exact')
    expect(matchAnswer('Beyonce', ['Beyoncé'])).toBe('exact')
    expect(matchAnswer('Armstrong', allAnswers({ answer: 'Neil Armstrong', acceptedAnswers: ['Armstrong'] }))).toBe('exact')
  })

  it('flags typos and answers inside longer text as close', () => {
    expect(matchAnswer('Alfred Nobell', ['Alfred Nobel'])).toBe('close')
    expect(matchAnswer('Marz', ['Mars'])).toBe('close')
    expect(matchAnswer("I think it's Mars", ['Mars'])).toBe('close')
  })

  it('says no to other answers and empty ones', () => {
    expect(matchAnswer('Edison', ['Alfred Nobel'])).toBe('no')
    expect(matchAnswer('Jupiter', ['Mars'])).toBe('no')
    expect(matchAnswer('  ', ['Mars'])).toBe('no')
    expect(matchAnswer('Marshmallow', ['Mars'])).toBe('no')
  })
})
