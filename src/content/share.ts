import { MediaSrcSchema } from './schema'

/** Share links put the board in the URL's fragment, which never reaches a server. */
export const SHARE_HASH = '#board='
/** Biggest board (JSON) a link or download may unpack to. */
export const MAX_BOARD_BYTES = 1_000_000
/** Links longer than this may not survive chat apps and some browsers: export the JSON file instead. */
export const LONG_LINK_CHARS = 30_000

/** Reads a byte stream to the end, giving up past `limit` bytes. */
async function collect(stream: ReadableStream<Uint8Array>, limit = Infinity): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error(`Board is too big (over ${MAX_BOARD_BYTES / 1_000_000} MB)`)
    }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

const through = (bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit?: number) =>
  collect(new Blob([bytes as BlobPart]).stream().pipeThrough(transform), limit)

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  // In slices: spreading a big array into fromCharCode overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('The link is damaged (unexpected characters)')
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** A link that opens the editor and offers to import this board. */
export async function boardToLink(board: unknown, origin = location.origin): Promise<string> {
  const packed = await through(new TextEncoder().encode(JSON.stringify(board)), new CompressionStream('deflate-raw'))
  return `${origin}/editor${SHARE_HASH}${toBase64Url(packed)}`
}

/** The board in a share link (or just its `#board=…` fragment), as raw JSON: validate it like any import. */
export async function linkToBoard(link: string): Promise<unknown> {
  const at = link.indexOf(SHARE_HASH)
  if (at < 0) throw new Error('Not a board link')
  let json: Uint8Array
  try {
    json = await through(fromBase64Url(link.slice(at + SHARE_HASH.length)), new DecompressionStream('deflate-raw'), MAX_BOARD_BYTES)
  } catch (e) {
    throw (e as Error).message.startsWith('Board is too big') ? e : new Error('The link is damaged or incomplete')
  }
  return JSON.parse(new TextDecoder().decode(json))
}

/**
 * A board JSON file from the web, e.g. a raw GitHub or gist link (those allow cross-site reads). Sends no
 * cookies, and stops reading past the size limit.
 */
export async function fetchBoard(url: string, fetchFn: typeof fetch = fetch): Promise<unknown> {
  if (!MediaSrcSchema.safeParse(url).success) throw new Error('Use an http(s) link')
  const response = await fetchFn(url, { credentials: 'omit' })
  if (!response.ok) throw new Error(`The server answered ${response.status}`)
  if (!response.body) throw new Error('The server sent nothing')
  return JSON.parse(new TextDecoder().decode(await collect(response.body, MAX_BOARD_BYTES)))
}
