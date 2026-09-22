import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '@repo/app-session/crypto'
import { payloadOf } from '../../../lib/principal'
import { exportFilename } from './filename'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const HOST = 'microtask.example'

let current: Request = new Request('http://x/')

const parse = (header: string | null): Map<string, string> =>
  new Map(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes('='))
      .map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]),
  )

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = parse(current.headers.get('cookie')).get(name)
        return value === undefined ? undefined : { name, value }
      },
      set: () => {
        throw new Error('the route must not write a cookie')
      },
    }),
  headers: () => Promise.resolve(current.headers),
}))

const sent: { url: string; init: RequestInit }[] = []

const BUNDLE = '{"format":"microtask-bundle","projects":[]}'

let pulls = 0

const lazyBundle = (): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1
        controller.enqueue(new TextEncoder().encode(BUNDLE))
        controller.close()
      },
    },
    { highWaterMark: 0 },
  )

let answer: () => Response = () =>
  new Response(lazyBundle(), { status: 200, headers: { 'content-type': 'application/json' } })

const problem = (status: number, code: string, extra: object = {}): Response =>
  new Response(
    JSON.stringify({
      type: `/problems/${code}`,
      title: 't',
      status,
      code,
      detail: 'the API said so',
      instance: '/v1/microtask/export',
      ...extra,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(answer())
  })
  sent.length = 0
  pulls = 0
  answer = () =>
    new Response(lazyBundle(), { status: 200, headers: { 'content-type': 'application/json' } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { GET } = await import('./route')

const adminCookie = `mt_admin=${seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))}`
const linkCookie = `mt_admin=${seal(SECRET, payloadOf({ kind: 'link', token: 'sharetoken-sharetoken' }))}`

const download = (query = '', cookie: string | null = adminCookie): Promise<Response> => {
  const headers: Record<string, string> = { host: HOST }
  if (cookie !== null) headers['cookie'] = cookie
  current = new Request(`http://${HOST}/api/export${query}`, { method: 'GET', headers })
  return GET(current)
}

const SOURCE = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8')

describe('GET /api/export establishes its own authority, since proxy.ts passes /api/* ungated', () => {
  it('answers 401 and calls the API not at all when no cookie is presented', async () => {
    const response = await download('', null)
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it('answers 401 and no bytes to a link principal moved into mt_admin', async () => {
    const response = await download('', linkCookie)
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
    expect(response.headers.get('content-disposition')).toBeNull()
    expect(await response.text()).not.toContain('microtask-bundle')
  })

  it('answers 401 to an mt_admin that will not open, which ADR 0032 reads as absent', async () => {
    const response = await download('', `${adminCookie.slice(0, -2)}AA`)
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it('answers a refusal as a problem document rather than as an empty download', async () => {
    const response = await download('', null)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })

  it('presents both credentials to the API once it has an admin cookie (ADR 0012)', async () => {
    await download()
    const headers = (sent[0]?.init.headers ?? {}) as Record<string, string>
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export')
    expect(headers['authorization']).toBe('Bearer admin.1.sig')
    expect(headers['x-api-key']).toBe('the-service-key')
  })
})

describe('GET /api/export forwards ?tokens= unchanged, so the API stays the one authority', () => {
  it('sends no tokens parameter at all when the request carried none', async () => {
    await download()
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export')
  })

  it('forwards tokens=preserve verbatim', async () => {
    await download('?tokens=preserve')
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export?tokens=preserve')
  })

  it('forwards tokens=strip verbatim rather than dropping it as redundant', async () => {
    await download('?tokens=strip')
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export?tokens=strip')
  })

  it('forwards a value the API will refuse instead of correcting it into one it accepts', async () => {
    answer = () => problem(422, 'invalid')
    const response = await download('?tokens=everything')
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export?tokens=everything')
    expect(response.status).toBe(422)
  })

  it('forwards an empty tokens= as the empty string rather than as an absent parameter', async () => {
    answer = () => problem(422, 'invalid')
    await download('?tokens=')
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export?tokens=')
  })

  it('ignores every other parameter, so nothing else can be smuggled onto the API call', async () => {
    await download('?tokens=preserve&projectId=../../etc&limit=1')
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/export?tokens=preserve')
  })
})

describe('GET /api/export offers the bundle as a download and streams it', () => {
  it('names the file by the UTC stamp rule, with nothing the caller sent in it', async () => {
    const response = await download('?tokens=preserve')
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="microtask-export-\d{8}-\d{6}\.json"$/,
    )
  })

  it('builds that name from the instant it served, which exportFilename states as its rule', () => {
    expect(exportFilename(new Date('2026-09-17T10:30:00.123Z'))).toBe(
      'microtask-export-20260917-103000.json',
    )
  })

  it('marks the answer uncacheable, since a bundle may carry live share tokens', async () => {
    const response = await download('?tokens=preserve')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('settles without pulling a byte of the upstream body, so nothing here buffers it', async () => {
    const response = await download()
    expect(pulls).toBe(0)
    expect(await response.text()).toBe(BUNDLE)
    expect(pulls).toBe(1)
  })

  it('reads no JSON anywhere on the path, which is what a stream cannot survive', () => {
    expect(SOURCE).not.toMatch(/\.json\(\)/)
    expect(SOURCE).not.toMatch(/\.text\(\)/)
    expect(SOURCE).not.toMatch(/\.arrayBuffer\(\)/)
  })

  it('answers 200 with the upstream media type rather than inventing one', async () => {
    const response = await download()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
  })
})

describe('GET /api/export hands the API refusal back unchanged in kind', () => {
  it('keeps a 409 a 409, which is a task file that would not read', async () => {
    answer = () => problem(409, 'conflict')
    const response = await download()
    expect(response.status).toBe(409)
    expect(response.headers.get('content-disposition')).toBeNull()
  })

  it('keeps a 403 a 403, so a credential the API refuses is not reported as an outage', async () => {
    answer = () => problem(403, 'forbidden')
    expect((await download()).status).toBe(403)
  })

  it('answers 503 when the API cannot be reached, never 200 with an empty file', async () => {
    answer = () => {
      throw new Error('ECONNREFUSED')
    }
    const response = await download()
    expect(response.status).toBe(503)
    expect(response.headers.get('content-disposition')).toBeNull()
  })

  it('says the surface plain sentence rather than the API detail', async () => {
    answer = () => problem(403, 'forbidden')
    expect(await (await download()).text()).not.toContain('the API said so')
  })
})

describe('a forwarded refusal names this app path, never the internal API one (ADR 0041)', () => {
  it('answers a 409 against /api/export rather than /v1/microtask/export', async () => {
    answer = () => problem(409, 'conflict')
    const body = await (await download()).json()
    expect(body).toMatchObject({ instance: '/api/export' })
  })

  it('leaks no /v1/ path anywhere in the document, which is a host no browser can reach', async () => {
    answer = () => problem(409, 'conflict')
    expect(await (await download()).text()).not.toContain('/v1/')
  })

  it('names this path on a 401 decided here too, so both refusals read the same', async () => {
    const body = await (await download('', null)).json()
    expect(body).toMatchObject({ instance: '/api/export' })
  })
})
