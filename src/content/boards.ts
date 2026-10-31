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

/** `base`, or `base-2`, `base-3`… when a board (draft or file) already has that id. */
export function uniqueBoardId(base: string): string {
  const taken = new Set(allBoards().map((b) => b.id))
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/** Saves a board as a new draft without replacing any other, and returns the id it got. */
export function saveNewDraft(board: object, base: string): string {
  const id = uniqueBoardId(base.replace(/[^a-z0-9-]/g, '-').toLowerCase() || 'imported')
  saveDraft(id, { ...board, id })
  return id
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
  download(filename, JSON.stringify(data, null, 2) + '\n', 'application/json')
}

/** One cell: quoted when needed, and text a spreadsheet would run as a formula (`=…`) made harmless. */
function csvCell(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  download(filename, toCsv(rows), 'text/csv')
}

function download(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
