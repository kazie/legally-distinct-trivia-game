import { validateBoard, type Board } from './schema'

export type BoardSource = 'repo' | 'draft'

export interface BoardEntry {
  id: string
  title: string
  source: BoardSource
  board: Board | null
  /** Validation problems; a board with issues can be edited but not played. */
  issues: string[]
}

const DRAFTS_KEY = 'ldtg:drafts'

const repoModules = import.meta.glob<{ default: unknown }>('/boards/*.json', { eager: true })

function toEntry(raw: unknown, source: BoardSource, fallbackId: string): BoardEntry {
  const result = validateBoard(raw)
  const obj = (raw ?? {}) as { id?: unknown; title?: unknown }
  if (result.ok) {
    return { id: result.board.id, title: result.board.title, source, board: result.board, issues: [] }
  }
  return {
    id: typeof obj.id === 'string' ? obj.id : fallbackId,
    title: typeof obj.title === 'string' ? obj.title : fallbackId,
    source,
    board: null,
    issues: result.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  }
}

export function repoBoards(): BoardEntry[] {
  return Object.entries(repoModules)
    .filter(([path]) => !path.endsWith('.schema.json'))
    .map(([path, module]) => toEntry(module.default, 'repo', path.replace(/^.*\/|\.json$/g, '')))
}

/** Drafts are stored raw (possibly invalid) so half-finished boards survive a reload. */
export function loadDrafts(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveDraft(id: string, board: unknown, previousId?: string): void {
  const drafts = loadDrafts()
  if (previousId && previousId !== id) delete drafts[previousId]
  drafts[id] = board
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

export function deleteDraft(id: string): void {
  const drafts = loadDrafts()
  delete drafts[id]
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

export function draftBoards(): BoardEntry[] {
  return Object.entries(loadDrafts()).map(([id, raw]) => toEntry(raw, 'draft', id))
}

export function allBoards(): BoardEntry[] {
  return [...draftBoards(), ...repoBoards()]
}

export function findBoard(id: string, source?: BoardSource): BoardEntry | undefined {
  return allBoards().find((b) => b.id === id && (!source || b.source === source))
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
