import { describe, expect, it } from 'vitest'
import sample from '../boards/sample.json'
import { boardToLink, fetchBoard, linkToBoard, MAX_BOARD_BYTES } from '@/content/share'

const pack = async (text: string) => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  return Buffer.from(bytes).toString('base64url')
}

describe('share links', () => {
  it('packs a board into a link and back', async () => {
    const link = await boardToLink(sample, 'https://ldtg.example')
    expect(link).toMatch(/^https:\/\/ldtg\.example\/editor#board=[\w-]+$/)
    // Compressed: shorter than the JSON even after base64.
    expect(link.length).toBeLessThan(JSON.stringify(sample).length)
    expect(await linkToBoard(link)).toEqual(sample)
    expect(await linkToBoard(link.slice(link.indexOf('#')))).toEqual(sample)
  })

  it('refuses boards that unpack to more than the limit', async () => {
    const huge = `"${'a'.repeat(MAX_BOARD_BYTES + 10)}"`
    await expect(linkToBoard(`#board=${await pack(huge)}`)).rejects.toThrow('too big')
  })

  it('reports damaged links instead of importing junk', async () => {
    await expect(linkToBoard('https://x/editor')).rejects.toThrow('Not a board link')
    await expect(linkToBoard('#board=not base64!')).rejects.toThrow('damaged')
    await expect(linkToBoard('#board=AAAA')).rejects.toThrow('damaged')
    await expect(linkToBoard(`#board=${await pack('{ nope')}`)).rejects.toThrow(SyntaxError)
  })
})

describe('import from URL', () => {
  const respond = (body: string, status = 200): typeof fetch => async (_url, init) => {
    expect(init?.credentials).toBe('omit')
    return new Response(body, { status })
  }

  it('reads a JSON board without cookies', async () => {
    expect(await fetchBoard('https://raw.example/board.json', respond('{"id":"x"}'))).toEqual({ id: 'x' })
  })

  it('refuses other schemes, errors and oversized files', async () => {
    await expect(fetchBoard('file:///etc/passwd', respond('{}'))).rejects.toThrow('http(s)')
    await expect(fetchBoard('https://raw.example/missing.json', respond('', 404))).rejects.toThrow('404')
    await expect(fetchBoard('https://raw.example/big.json', respond('x'.repeat(MAX_BOARD_BYTES + 1)))).rejects.toThrow('too big')
  })
})
