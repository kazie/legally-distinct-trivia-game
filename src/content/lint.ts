import { containsWords, normalizeAnswer, significantWords } from './normalize'
import { cluePath, type Board, type BoardIssue, type Media } from './schema'

const MAX_CLUE_LENGTH = 200
const MAX_CATEGORY_LENGTH = 30

/**
 * Whether the answer shows up in normalized `text`: `true` for the whole answer, else the key word that does.
 * A one-word answer that is a short common word ("The Who" → "who", "Yes") would match ordinary text, so it
 * only counts when it has a significant word. Phrases ("Top Gun") are distinctive even when every word is short.
 */
function giveaway(text: string, answer: string): true | string | null {
  const words = significantWords(answer)
  if ((words.length || answer.includes(' ')) && containsWords(text, answer)) return true
  return words.find((word) => containsWords(text, word)) ?? null
}

/** The readable part of a media link: `…/Mozart_-_Eine_kleine.mp3` → "mozart eine kleine mp3". */
function linkText(src: string): string {
  try {
    return normalizeAnswer(decodeURIComponent(new URL(src).pathname))
  } catch {
    return ''
  }
}

/**
 * Things worth a second look that don't stop a board from being played: answers given away by the clue,
 * duplicates, and text too long for the TV. Only for valid boards; paths use the validation issue format.
 */
export function lintBoard(board: Board): BoardIssue[] {
  const warnings: BoardIssue[] = []
  const answers = new Map<string, string>()
  const clues = new Map<string, string>()

  function checkClue(path: string, item: { clue: string; answer: string; media?: Media }) {
    const clue = normalizeAnswer(item.clue)
    const answer = normalizeAnswer(item.answer)
    const inClue = giveaway(clue, answer)
    if (inClue === true) warnings.push({ path, message: 'The answer appears in the clue' })
    else if (inClue) warnings.push({ path, message: `Part of the answer ("${inClue}") appears in the clue` })
    // Anyone can read a link: a picture called mars.jpg tells. (Answer media is meant to show the answer.)
    const inLink = item.media && giveaway(linkText(item.media.src), answer)
    if (inLink) {
      const what = inLink === true ? 'the answer' : `part of the answer ("${inLink}")`
      warnings.push({ path: `${path}.media.src`, message: `The media link gives away ${what}` })
    }
    if (item.clue.length > MAX_CLUE_LENGTH) {
      warnings.push({ path, message: `Long clue (${item.clue.length} characters) may not fit the TV` })
    }

    const duplicate = (seen: Map<string, string>, key: string, what: string) => {
      // Text with no letters or digits (emoji, punctuation) normalizes to nothing: not comparable.
      if (!key) return
      const first = seen.get(key)
      if (first) warnings.push({ path, message: `Same ${what} as ${first}` })
      else seen.set(key, path)
    }
    duplicate(answers, answer, 'answer')
    // "Name this song" over different audio files is fine: compare the media too.
    duplicate(clues, clue && `${clue}|${item.media?.src ?? ''}`, 'clue')
  }

  board.rounds.forEach((round, r) =>
    round.categories.forEach((category, c) => {
      if (category.name.length > MAX_CATEGORY_LENGTH) {
        warnings.push({ path: `rounds.${r}.categories.${c}.name`, message: 'Long category name may not fit the board' })
      }
      category.clues.forEach((clue, i) => checkClue(cluePath(r, c, i), clue))
    }),
  )
  if (board.final) checkClue('final', board.final)
  if (board.tiebreaker) checkClue('tiebreaker', board.tiebreaker)
  return warnings
}
