import { containsWords, normalizeAnswer, significantWords } from './normalize'
import { cluePath, type Board, type BoardIssue, type Media } from './schema'

const MAX_CLUE_LENGTH = 200
const MAX_CATEGORY_LENGTH = 30

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
    // A one-word answer that is a short common word ("The Who" → "who", "Yes") would match ordinary clue
    // text. Phrases ("Top Gun") are distinctive even when every word is short.
    const words = significantWords(answer)
    const giveaway = words.find((word) => containsWords(clue, word))
    if ((words.length || answer.includes(' ')) && containsWords(clue, answer)) warnings.push({ path, message: 'The answer appears in the clue' })
    else if (giveaway) warnings.push({ path, message: `Part of the answer ("${giveaway}") appears in the clue` })
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
  return warnings
}
