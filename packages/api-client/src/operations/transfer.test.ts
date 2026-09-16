import { describe, expect, it } from 'vitest'
import { createTransport } from '../transport.js'
import type { Fetcher } from '../types.js'
import { transferApi } from './transfer.js'

const BASE = 'https://api.example.test'

const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'
const PROJECT = '01M240FB4GD6PF6V0PKZVF6FD9'

const recorder = (respond: () => Response) => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetch: Fetcher = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(respond())
  }
  return { calls, fetch }
}

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const apiOver = (fetch: Fetcher) =>
  transferApi(createTransport({ baseUrl: BASE, serviceKey: 'svc', fetch }, 'token'))

const session = { sessionId: SESSION, openedAt: 'S', maxChunkBytes: 1_000_000, maxSessionBytes: 40_000_000 }

describe('the export operations address the two routes the API publishes', () => {
  it('asks the workspace address, which names no project', async () => {
    const { calls, fetch } = recorder(() => json({}))
    await apiOver(fetch).exportWorkspace(null)
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/export`)
    expect(calls[0]?.init.method).toBe('GET')
  })

  it('asks the project address for one project', async () => {
    const { calls, fetch } = recorder(() => json({}))
    await apiOver(fetch).exportProject(PROJECT, null)
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/projects/${PROJECT}/export`)
  })

  it('sends no tokens parameter when it was given none, so the API applies its own default', async () => {
    const { calls, fetch } = recorder(() => json({}))
    await apiOver(fetch).exportWorkspace(null)
    expect(calls[0]?.url).not.toContain('tokens')
  })

  it('forwards the disposition it was given verbatim, whatever it says', async () => {
    const { calls, fetch } = recorder(() => json({}))
    await apiOver(fetch).exportWorkspace('preserve')
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/export?tokens=preserve`)
  })

  it('forwards a disposition the API will refuse rather than correcting it here', async () => {
    const { calls, fetch } = recorder(() => json({}))
    await apiOver(fetch).exportWorkspace('keep-them-all')
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/export?tokens=keep-them-all`)
  })

  it('answers the response with its body unread, which is what lets a proxy stream it', async () => {
    const { fetch } = recorder(() => json({ format: 'microtask-bundle' }))
    const response = await apiOver(fetch).exportWorkspace(null)
    expect(response.bodyUsed).toBe(false)
  })
})

describe('the import operations address one session, chunk by chunk (ADR 0044)', () => {
  it('opens a session at the sessions collection and decodes the caps it answers', async () => {
    const { calls, fetch } = recorder(() => json(session))
    const opened = await apiOver(fetch).openSession()
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/import/sessions`)
    expect(calls[0]?.init.method).toBe('POST')
    expect(opened.maxChunkBytes).toBe(1_000_000)
  })

  it('addresses a chunk by its session, its harvested path and its offset', async () => {
    const { calls, fetch } = recorder(() => json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 }))
    await apiOver(fetch).uploadChunk(
      { sessionId: SESSION, path: 'drop/a.json', offset: 1_000_000 },
      new Uint8Array([1, 2, 3]),
    )
    expect(calls[0]?.url).toBe(
      `${BASE}/v1/microtask/import/sessions/${SESSION}/files?path=drop%2Fa.json&offset=1000000`,
    )
  })

  it('sends an offset of zero as a value, since the route requires one and defaults nothing', async () => {
    const { calls, fetch } = recorder(() => json({ path: 'a', chunkBytes: 0, sessionBytes: 0 }))
    await apiOver(fetch).uploadChunk({ sessionId: SESSION, path: 'a', offset: 0 }, new Uint8Array())
    expect(calls[0]?.url).toContain('offset=0')
  })

  it('sends the chunk as bytes rather than as a JSON document', async () => {
    const { calls, fetch } = recorder(() => json({ path: 'a', chunkBytes: 2, sessionBytes: 2 }))
    const chunk = new Uint8Array([9, 9])
    await apiOver(fetch).uploadChunk({ sessionId: SESSION, path: 'a', offset: 0 }, chunk)
    expect(calls[0]?.init.body).toBe(chunk)
  })

  it('names the archive to expand by the staged path it was uploaded at', async () => {
    const { calls, fetch } = recorder(() => json({ archive: 'drop.zip', files: 2, bytes: 9, sessionBytes: 9 }))
    await apiOver(fetch).expandArchive(SESSION, 'drop.zip')
    expect(calls[0]?.url).toBe(
      `${BASE}/v1/microtask/import/sessions/${SESSION}/archives?path=drop.zip`,
    )
    expect(calls[0]?.init.method).toBe('POST')
  })

  it('reads the preview with a GET, because it writes nothing', async () => {
    const { calls, fetch } = recorder(() => json({ sessionId: SESSION, groups: [] }))
    await apiOver(fetch).preview(SESSION)
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/import/sessions/${SESSION}/preview`)
    expect(calls[0]?.init.method).toBe('GET')
  })

  it('confirms by naming the session in the body as well as in the path', async () => {
    const { calls, fetch } = recorder(() => json({ sessionId: SESSION, projects: [] }))
    await apiOver(fetch).confirm({ sessionId: SESSION, choices: [{ projectId: PROJECT, choice: 'new' }] })
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/import/sessions/${SESSION}/confirm`)
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      sessionId: SESSION,
      choices: [{ projectId: PROJECT, choice: 'new' }],
    })
  })

  it('percent-encodes a session id, so a caller cannot build a path with a stray segment', async () => {
    const { calls, fetch } = recorder(() => json({ sessionId: SESSION, groups: [] }))
    await apiOver(fetch).preview('../../etc').catch(() => undefined)
    expect(calls[0]?.url).toBe(`${BASE}/v1/microtask/import/sessions/..%2F..%2Fetc/preview`)
  })
})
