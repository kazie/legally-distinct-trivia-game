// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MediaView from '@/components/MediaView.vue'
import { checkAllMedia, collectMedia, type MediaStatus } from '@/content/mediaCheck'
import { validateBoard, type Board, type Media } from '@/content/schema'
import { createGame, reduce, type Action } from '@/game/engine'
import { toPublicState } from '@/game/publicView'
import type { GameState } from '@/game/types'

const SUSHI: Media = { type: 'image', src: 'https://e.x/sushi.jpg', reveal: { style: 'blur', seconds: 10, shrinkPoints: true } }

const board: Board = {
  id: 'media',
  title: 'Media',
  rounds: [
    {
      name: 'R1',
      categories: [
        {
          name: 'Food',
          clues: [
            { value: 400, clue: 'Where this dish is from', answer: 'Japan', media: SUSHI, source: 'Wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Sushi' },
            { value: 800, clue: 'Fastest land animal', answer: 'Cheetah', answerMedia: { type: 'image', src: 'https://e.x/cat.jpg' } },
          ],
        },
      ],
    },
  ],
  final: { category: 'F', clue: 'Final', answer: 'Nobel', answerMedia: { type: 'video', src: 'https://e.x/n.mp4', start: 5, end: 9 }, source: 'Nobel Prize' },
}

function run(state: GameState, ...actions: Action[]): GameState {
  return actions.reduce(reduce, state)
}

function started(dailyDoubles: string[] = []): GameState {
  return run(
    createGame('ABCD'),
    { type: 'loadBoard', board, dailyDoubles },
    { type: 'playerJoined', id: 'p1', name: 'Ann', now: 0 },
    { type: 'playerJoined', id: 'p2', name: 'Bob', now: 0 },
    { type: 'startGame', settings: { buzzStyle: 'button' } },
  )
}

/** Opens buzzers on the current clue at host time `now`. */
function open(s: GameState, now: number, seq: number): GameState {
  s = reduce(s, { type: 'openBuzzers', target: 0 })
  return reduce(s, { type: 'buzzersOpened', clueId: s.current!.id, attempt: s.current!.attempt, seq, now })
}

const buzz = (s: GameState, playerId: string, seq: number, now: number): GameState =>
  reduce(s, { type: 'buzz', playerId, clueId: s.current!.id, attempt: s.current!.attempt, seq, now })

describe('board schema: media and sources', () => {
  it('accepts clips, blur reveals, answer media and sources', () => {
    expect(validateBoard(board).ok).toBe(true)
  })

  it('rejects clips on pictures, reveals on audio, backwards clips and non-http links', () => {
    const bad = structuredClone(board)
    const [first, second] = bad.rounds[0]!.categories[0]!.clues
    first!.media = { type: 'image', src: 'https://e.x/a.jpg', start: 2 }
    second!.media = { type: 'audio', src: 'https://e.x/a.mp3', start: 5, end: 3, reveal: { style: 'blur' } }
    second!.answerMedia = { type: 'image', src: 'javascript:alert(1)' }
    bad.final!.sourceUrl = 'file:///etc/passwd'
    const result = validateBoard(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((i) => i.path).sort()).toEqual([
        'final.sourceUrl',
        'rounds.0.categories.0.clues.0.media.start',
        'rounds.0.categories.0.clues.1.answerMedia.src',
        'rounds.0.categories.0.clues.1.media.end',
        'rounds.0.categories.0.clues.1.media.reveal',
      ])
    }
  })
})

describe('public view: answer extras', () => {
  it('keeps answer media and sources secret until the answer is revealed', () => {
    let s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 1 } })
    expect(toPublicState(s, 0).current).toMatchObject({ answer: null, answerMedia: null, source: null, sourceUrl: null })
    s = reduce(s, { type: 'revealAnswer' })
    expect(toPublicState(s, 0).current).toMatchObject({ answer: 'Cheetah', answerMedia: { src: 'https://e.x/cat.jpg' } })

    s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } }, { type: 'revealAnswer' })
    expect(toPublicState(s, 0).current).toMatchObject({ source: 'Wikipedia', sourceUrl: 'https://en.wikipedia.org/wiki/Sushi' })
  })

  it('shows the final answer media and source only once judging is done', () => {
    let s = run(
      started(),
      { type: 'adjustScore', id: 'p1', delta: 500 },
      { type: 'startFinal' },
      { type: 'openFinalWagers' },
      { type: 'showFinalClue', now: 0, durationMs: 1000 },
      { type: 'closeFinalAnswers' },
    )
    expect(toPublicState(s, 0).final).toMatchObject({ answerMedia: null, source: null })
    s = run(s, { type: 'showFinalResponse' }, { type: 'judgeFinal', correct: false })
    expect(toPublicState(s, 0).final).toMatchObject({ answer: 'Nobel', answerMedia: { start: 5, end: 9 }, source: 'Nobel Prize' })
  })
})

describe('engine: blur reveal', () => {
  const select = (s: GameState) => reduce(s, { type: 'selectClue', ref: { round: 0, category: 0, clue: 0 } })

  it('runs only while buzzers are open and shrinks the value the earlier someone buzzes', () => {
    let s = open(select(started()), 1000, 1)
    expect(s.current!.reveal).toMatchObject({ elapsedMs: 0, runningSince: 1000 })
    // 2.5 of 10 seconds: a quarter sharp, so 400 × (1 − 0.25 / 2).
    s = buzz(s, 'p2', 2, 3500)
    expect(s.current!.reveal).toMatchObject({ elapsedMs: 2500, runningSince: null })
    expect(s.current!.value).toBe(350)
    s = reduce(s, { type: 'judge', correct: false })
    expect(s.players.find((p) => p.id === 'p2')!.score).toBe(-350)

    // Paused while closed: the next opening picks up where it left off.
    s = open(s, 60_000, 3)
    s = reduce(s, { type: 'closeBuzzers', now: 62_500 })
    expect(s.current!.reveal).toMatchObject({ elapsedMs: 5000, runningSince: null })
    s = open(s, 70_000, 4)
    s = buzz(s, 'p1', 5, 90_000)
    // Sharp after 10 s: half the value, and no further.
    expect(s.current!.value).toBe(200)
    expect(toPublicState(s, 0).current!.reveal).not.toBeNull()
    s = reduce(s, { type: 'judge', correct: true })
    expect(toPublicState(s, 0).current!.reveal).toBeNull()
  })

  it('sharpens a Daily Double picture from when the clue shows, without touching the wager', () => {
    let s = run(
      select(started(['0-0-0'])),
      { type: 'setDdWager', id: 'p1', amount: 300 },
      { type: 'showDdClue', now: 5000 },
    )
    expect(s.current!.reveal).toMatchObject({ runningSince: 5000, shrinkPoints: false })
    expect(s.current!.value).toBe(300)
  })

  it('has no reveal for clues without one', () => {
    const s = run(started(), { type: 'selectClue', ref: { round: 0, category: 0, clue: 1 } })
    expect(s.current!.reveal).toBeNull()
  })
})

describe('media check', () => {
  it('collects clue and answer media with readable locations', () => {
    expect(collectMedia(board).map((i) => [i.path, i.label])).toEqual([
      ['rounds.0.categories.0.clues.0.media', 'R1 · Food · 400'],
      ['rounds.0.categories.0.clues.1.answerMedia', 'R1 · Food · 800 (answer)'],
      ['final.answerMedia', 'Final round (answer)'],
    ])
  })

  it('checks each link once, a few at a time', async () => {
    let running = 0
    let most = 0
    const seen: string[] = []
    const check = async (m: Media): Promise<MediaStatus> => {
      seen.push(m.src)
      most = Math.max(most, ++running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return m.src.includes('bad') ? 'broken' : 'ok'
    }
    const media = ['a', 'b', 'bad', 'c', 'd', 'e', 'a'].map((n): Media => ({ type: 'image', src: `https://e.x/${n}.jpg` }))
    const results = await checkAllMedia(media, check, 2)
    expect(seen).toHaveLength(6)
    expect(most).toBe(2)
    expect(results.get('https://e.x/bad.jpg')).toBe('broken')
    expect(results.get('https://e.x/a.jpg')).toBe('ok')
  })
})

describe('MediaView', () => {
  it('plays only the clip: starts at the start and pauses at the end', async () => {
    const w = mount(MediaView, { props: { media: { type: 'audio', src: 'https://e.x/a.mp3#x', start: 10, end: 20 } } })
    const audio = w.find('audio')
    expect(audio.attributes('src')).toBe('https://e.x/a.mp3#t=10,20')
    const el = audio.element as HTMLAudioElement
    el.currentTime = 25
    await audio.trigger('play')
    expect(el.currentTime).toBe(10)
    let paused = false
    el.pause = () => void (paused = true)
    el.currentTime = 20.1
    await audio.trigger('timeupdate')
    expect(paused).toBe(true)
  })

  it('blurs a picture by progress and never renders unsafe links', () => {
    const w = mount(MediaView, { props: { media: SUSHI, progress: 0.5 } })
    expect(w.find('img').attributes('style')).toContain('blur(20px)')
    const bad = mount(MediaView, { props: { media: { type: 'image', src: 'javascript:alert(1)' } } })
    expect(bad.find('img').exists()).toBe(false)
  })
})
