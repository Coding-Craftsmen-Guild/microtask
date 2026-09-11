import { describe, expect, it } from 'vitest'
import type { SaveRequest } from '../editor/save-document'
import { adminDocumentRoot, saveTabDocument, tabDocumentUrl, type Fetch } from './save-tab'

const DOCUMENT = { type: 'doc' as const, content: [{ type: 'paragraph' }] }
const REQUEST: SaveRequest = { document: DOCUMENT, ifMatch: '2026-09-11T10:00:00.000Z', keepalive: false }

interface Seen {
  readonly url: string
  readonly init: RequestInit
}

const answering = (response: () => Response): { fetch: Fetch; seen: Seen[] } => {
  const seen: Seen[] = []
  return {
    seen,
    fetch: (url, init) => {
      seen.push({ url, init })
      return Promise.resolve(response())
    },
  }
}

const problem = (status: number, detail?: string): Response =>
  new Response(JSON.stringify({ status, code: 'x', ...(detail === undefined ? {} : { detail }) }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

describe('the admin document route’s address', () => {
  it('is the task’s tabs collection under /api, with every id encoded', () => {
    expect(adminDocumentRoot({ projectId: 'P1', taskId: 'T/1' })).toBe('/api/projects/P1/tasks/T%2F1/tabs')
  })

  it('names one tab’s document under that root', () => {
    expect(tabDocumentUrl('/api/projects/P1/tasks/T1/tabs', 'B 1')).toBe('/api/projects/P1/tasks/T1/tabs/B%201/document')
  })
})

describe('saveTabDocument sends one conditional write and reads the answer into an outcome', () => {
  it('PUTs the document as JSON with the precondition in If-Match', async () => {
    const { fetch, seen } = answering(() => Response.json({ updatedAt: 'S2' }))
    await saveTabDocument('/api/doc', fetch)(REQUEST)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('/api/doc')
    expect(seen[0]?.init.method).toBe('PUT')
    expect(seen[0]?.init.headers).toEqual({
      'content-type': 'application/json',
      'if-match': '2026-09-11T10:00:00.000Z',
    })
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual(DOCUMENT)
  })

  it('asks for keepalive exactly when the island does, and not otherwise', async () => {
    const { fetch, seen } = answering(() => Response.json({ updatedAt: 'S2' }))
    await saveTabDocument('/api/doc', fetch)({ ...REQUEST, keepalive: true })
    await saveTabDocument('/api/doc', fetch)(REQUEST)
    expect(seen.map((one) => one.init.keepalive)).toEqual([true, false])
  })

  it('reads a 200 into saved, carrying the stamp the next write must present', async () => {
    const { fetch } = answering(() => Response.json({ updatedAt: 'S2' }))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({ kind: 'saved', updatedAt: 'S2' })
  })

  it('reads a 409 into conflict, which the island never retries', async () => {
    const { fetch } = answering(() => problem(409, 'This tab changed elsewhere'))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({ kind: 'conflict' })
  })

  it('reads a 413 into a failure carrying the problem’s own sentence', async () => {
    const { fetch } = answering(() => problem(413, 'This request body is larger than 2500000 bytes.'))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'This request body is larger than 2500000 bytes.',
    })
  })

  it('reads a 401 into a failure rather than a conflict, so the island keeps the edit and retries', async () => {
    const { fetch } = answering(() => problem(401, 'Sign in again in another tab.'))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'Sign in again in another tab.',
    })
  })

  it('falls back to the status when a failure carries no readable sentence', async () => {
    const { fetch } = answering(() => new Response('<html>Bad gateway</html>', { status: 502 }))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'The save failed (HTTP 502).',
    })
  })

  it('falls back to the status when the problem’s detail is empty', async () => {
    const { fetch } = answering(() => problem(503, ''))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'The save failed (HTTP 503).',
    })
  })

  it('falls back to the status when the problem has no detail member', async () => {
    const { fetch } = answering(() => problem(500))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'The save failed (HTTP 500).',
    })
  })

  it('treats a 200 without a stamp as a failure, since the next write would have nothing to present', async () => {
    const { fetch } = answering(() => Response.json({ ok: true }))
    expect(await saveTabDocument('/api/doc', fetch)(REQUEST)).toEqual({
      kind: 'failed',
      message: 'The save answered without the tab’s new version.',
    })
  })

  it('treats a 200 whose body is not JSON as a failure rather than a save', async () => {
    const { fetch } = answering(() => new Response('ok', { status: 200 }))
    expect((await saveTabDocument('/api/doc', fetch)(REQUEST)).kind).toBe('failed')
  })
})
