import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupedBytes, RefusedUploadError, UPLOAD_REFUSALS, uploadRefusalText } from './refusal'
import { postChunk } from './post-chunk'
import { UPLOAD_ROUTE_PATH } from './paths'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

const refusal = (status: number, maxBytes: number | null = null) =>
  new RefusedUploadError({ status, code: 'x', maxBytes })

describe('a 413 names the cap it hit, taken from the problem document extension', () => {
  it('names the number the document carried rather than saying "too large"', () => {
    const said = uploadRefusalText(refusal(413, 1_000_000))
    expect(said).toContain('1,000,000 bytes')
    expect(said).not.toBe(UPLOAD_REFUSALS.tooLarge)
  })

  it('names a different cap when the document carries one, so no number is hard-coded here', () => {
    expect(uploadRefusalText(refusal(413, 250_000))).toContain('250,000 bytes')
    expect(uploadRefusalText(refusal(413, 250_000))).not.toContain('1,000,000')
  })

  it('groups the digits, so the cap reads as a number and not as a blur', () => {
    expect(groupedBytes(1_000_000)).toBe('1,000,000')
    expect(groupedBytes(4_000_000)).toBe('4,000,000')
    expect(groupedBytes(999)).toBe('999')
    expect(groupedBytes(0)).toBe('0')
  })

  it('falls back to the plain sentence for a 413 that carried no cap at all', () => {
    expect(uploadRefusalText(refusal(413, null))).toBe(UPLOAD_REFUSALS.tooLarge)
  })
})

describe('every other refusal gets this surface own sentence for its status', () => {
  it.each([
    [401, UPLOAD_REFUSALS.unauthorised],
    [403, UPLOAD_REFUSALS.forbidden],
    [404, UPLOAD_REFUSALS.missing],
    [409, UPLOAD_REFUSALS.conflict],
    [422, UPLOAD_REFUSALS.invalid],
    [429, UPLOAD_REFUSALS.busy],
    [503, UPLOAD_REFUSALS.broken],
  ])('says the %s sentence', (status, expected) => {
    expect(uploadRefusalText(refusal(status))).toBe(expected)
  })

  it('says the broken sentence for something that is not a refusal at all', () => {
    expect(uploadRefusalText(new TypeError('fetch failed'))).toBe(UPLOAD_REFUSALS.broken)
    expect(uploadRefusalText(undefined)).toBe(UPLOAD_REFUSALS.broken)
  })

  it('never says nothing, since a file with no reason is the silent failure ADR 0018 names', () => {
    for (const reason of [refusal(401), refusal(500), new Error('x'), null, 'a string']) {
      expect(uploadRefusalText(reason).length).toBeGreaterThan(10)
    }
  })

  it('never repeats the route detail, which is written for whoever reads the API', () => {
    const said = uploadRefusalText(refusal(403))
    expect(said).not.toContain('Not permitted')
  })
})

describe('postChunk posts one chunk to the app own route and reads what was staged', () => {
  const sent: { url: string; init: RequestInit }[] = []
  let answer: () => Response = () =>
    Response.json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 })

  beforeEach(() => {
    sent.length = 0
    answer = () => Response.json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 })
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return Promise.resolve(answer())
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const chunk = new Blob([new Uint8Array([1, 2, 3])])

  it('addresses the route by session, path and offset', async () => {
    await postChunk({ sessionId: SESSION, path: 'drop/a.json', offset: 1_000_000 }, chunk)
    expect(sent[0]?.url).toBe(
      `${UPLOAD_ROUTE_PATH}?sessionId=${SESSION}&path=drop%2Fa.json&offset=1000000`,
    )
  })

  it('sends the slice itself as bytes, not base64 inside a document', async () => {
    await postChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk)
    expect(sent[0]?.init.body).toBe(chunk)
    expect((sent[0]?.init.headers as Record<string, string>)['content-type']).toBe(
      'application/octet-stream',
    )
  })

  it('answers the staged path and counts, parsed through the published schema', async () => {
    const staged = await postChunk({ sessionId: SESSION, path: 'drop/./a.json', offset: 0 }, chunk)
    expect(staged).toEqual({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 })
  })

  it('rejects a success body the contract refuses rather than reading a wrong count', async () => {
    answer = () => Response.json({ path: 'a', chunkBytes: 'three', sessionBytes: 3 })
    await expect(postChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk)).rejects.toThrow()
  })

  it('reads a 413 and keeps the cap it named', async () => {
    answer = () =>
      new Response(JSON.stringify({ code: 'too_large', maxBytes: 1_000_000 }), {
        status: 413,
        headers: { 'content-type': 'application/problem+json' },
      })
    const error = await postChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(RefusedUploadError)
    expect(uploadRefusalText(error)).toContain('1,000,000 bytes')
  })

  it('reads a refusal whose body is not a problem document at all, keeping the status', async () => {
    answer = () => new Response('<html>502 from a proxy</html>', { status: 502 })
    const error = await postChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk).catch(
      (thrown: unknown) => thrown,
    )
    expect(error).toBeInstanceOf(RefusedUploadError)
    expect(uploadRefusalText(error)).toBe(UPLOAD_REFUSALS.broken)
  })

  it('drops a maxBytes that is not a whole number of bytes rather than rendering it', async () => {
    answer = () =>
      new Response(JSON.stringify({ code: 'too_large', maxBytes: 'lots' }), { status: 413 })
    const error = await postChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk).catch(
      (thrown: unknown) => thrown,
    )
    expect(uploadRefusalText(error)).toBe(UPLOAD_REFUSALS.tooLarge)
  })
})
