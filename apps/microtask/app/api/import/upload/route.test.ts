import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '../../../../lib/crypto'
import { payloadOf } from '../../../../lib/principal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const HOST = 'microtask.example'
const SESSION = '01M240ERCRWWCN16Q5AHP1FZAQ'

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

let answer: () => Response = () => Response.json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 })

const problem = (status: number, code: string, extra: object = {}): Response =>
  new Response(
    JSON.stringify({
      type: `/problems/${code}`,
      title: 't',
      status,
      code,
      detail: 'the API said so',
      instance: '/v1/microtask/import/sessions/x/files',
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
  answer = () => Response.json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 3 })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { POST } = await import('./route')

const adminCookie = `mt_admin=${seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))}`
const linkCookie = `mt_admin=${seal(SECRET, payloadOf({ kind: 'link', token: 'sharetoken-sharetoken' }))}`

interface Upload {
  readonly query?: string
  readonly cookie?: string | null
  readonly origin?: string | null
  readonly body?: BodyInit
}

const DEFAULT_QUERY = `?sessionId=${SESSION}&path=drop%2Fa.json&offset=0`

const upload = (options: Upload = {}): Promise<Response> => {
  const headers: Record<string, string> = { host: HOST }
  const cookie = options.cookie === undefined ? adminCookie : options.cookie
  const origin = options.origin === undefined ? `https://${HOST}` : options.origin
  if (cookie !== null) headers['cookie'] = cookie
  if (origin !== null) headers['origin'] = origin
  current = new Request(`http://${HOST}/api/import/upload${options.query ?? DEFAULT_QUERY}`, {
    method: 'POST',
    headers,
    body: options.body ?? new Uint8Array([1, 2, 3]),
  })
  return POST(current)
}

const bodyOf = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('POST /api/import/upload establishes its own authority, in the order it can afford', () => {
  it('refuses a cross-site request 403 before any cookie is spent', async () => {
    const response = await upload({ origin: 'https://evil.example' })
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it.each([
    ['no cookie at all', null],
    ['a link principal in mt_admin', linkCookie],
  ])(
    'answers a cross-site request carrying %s 403 and not 401, which is the check that ran first',
    async (_name, cookie) => {
      const response = await upload({ origin: 'https://evil.example', cookie })
      expect(response.status).toBe(403)
      expect(sent).toHaveLength(0)
    },
  )

  it('refuses a cross-site request with an unopenable cookie 403, for the same reason', async () => {
    const response = await upload({
      origin: 'https://evil.example',
      cookie: `${adminCookie.slice(0, -2)}AA`,
    })
    expect(response.status).toBe(403)
  })

  it('refuses a request with no Origin at all, which no browser sends on a POST', async () => {
    expect((await upload({ origin: null })).status).toBe(403)
  })

  it('answers 401 with no API call when no cookie is presented', async () => {
    const response = await upload({ cookie: null })
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it('answers 401 to a link principal moved into mt_admin, since import creates projects', async () => {
    const response = await upload({ cookie: linkCookie })
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it('answers 401 to an mt_admin that will not open', async () => {
    expect((await upload({ cookie: `${adminCookie.slice(0, -2)}AA` })).status).toBe(401)
  })
})

describe('POST /api/import/upload forwards one chunk, addressed by session, path and offset', () => {
  it('sends the chunk to the session files route with all three coordinates', async () => {
    await upload({ query: `?sessionId=${SESSION}&path=drop%2Ftasks%2F01T.json&offset=1000000` })
    expect(sent[0]?.url).toBe(
      `http://api.internal:4321/v1/microtask/import/sessions/${SESSION}/files?path=drop%2Ftasks%2F01T.json&offset=1000000`,
    )
    expect(sent[0]?.init.method).toBe('POST')
  })

  it('sends the body as bytes rather than as a JSON document of indices', async () => {
    await upload({ body: new Uint8Array([7, 8, 9]) })
    const headers = (sent[0]?.init.headers ?? {}) as Record<string, string>
    expect(headers['content-type']).toBe('application/octet-stream')
    expect(new Uint8Array(sent[0]?.init.body as ArrayBuffer)).toEqual(new Uint8Array([7, 8, 9]))
  })

  it('sends an empty file as an empty chunk, so a zero-byte file is staged and not lost', async () => {
    answer = () => Response.json({ path: 'drop/empty.json', chunkBytes: 0, sessionBytes: 0 })
    const response = await upload({ body: new Uint8Array() })
    expect(response.status).toBe(200)
    expect((sent[0]?.init.body as ArrayBuffer).byteLength).toBe(0)
  })

  it('presents both credentials, since either alone is a 401 (ADR 0012)', async () => {
    await upload()
    const headers = (sent[0]?.init.headers ?? {}) as Record<string, string>
    expect(headers['authorization']).toBe('Bearer admin.1.sig')
    expect(headers['x-api-key']).toBe('the-service-key')
  })

  it('answers the staged path the server normalised, not the one the browser sent', async () => {
    answer = () => Response.json({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 12 })
    const response = await upload({ query: `?sessionId=${SESSION}&path=drop%2F.%2Fa.json&offset=0` })
    expect(await bodyOf(response)).toEqual({ path: 'drop/a.json', chunkBytes: 3, sessionBytes: 12 })
  })

  it('marks its answer uncacheable, since it reports one append and nothing else', async () => {
    expect((await upload()).headers.get('cache-control')).toBe('no-store')
  })
})

describe('POST /api/import/upload refuses a chunk it cannot address', () => {
  it('refuses a missing offset rather than sending NaN or guessing zero', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('refuses a non-numeric offset', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=later` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('refuses a negative offset', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=-1` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('refuses a fractional offset, which would address no byte boundary', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=1.5` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it.each([
    ['present but empty', ''],
    ['whitespace', '%20%20'],
    ['hexadecimal', '0x10'],
    ['exponent', '1e3'],
    ['signed', '%2B5'],
    ['padded with spaces', '%205%20'],
  ])('refuses a %s offset, which Number() would read as a number no browser sent', async (_name, raw) => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=${raw}` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('refuses an offset too large to be a byte count this runtime can compare', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=${'9'.repeat(30)}` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('accepts a plain decimal offset, so the guard refuses shapes and not offsets', async () => {
    await upload({ query: `?sessionId=${SESSION}&path=a.json&offset=1000000` })
    expect(sent[0]?.url).toContain('offset=1000000')
  })

  it('refuses a missing path, which is the one thing the API cannot infer', async () => {
    const response = await upload({ query: `?sessionId=${SESSION}&offset=0` })
    expect(response.status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it('forwards a hostile path to the API rather than judging it here', async () => {
    answer = () => problem(422, 'invalid')
    const response = await upload({ query: `?sessionId=${SESSION}&path=..%2F..%2Fetc&offset=0` })
    expect(sent[0]?.url).toContain('path=..%2F..%2Fetc')
    expect(response.status).toBe(422)
  })
})

describe('POST /api/import/upload hands the API refusal back in the kind the browser acts on', () => {
  it('keeps a 413 and its maxBytes, so the browser can name the cap', async () => {
    answer = () => problem(413, 'too_large', { maxBytes: 1_000_000 })
    const response = await upload()
    expect(response.status).toBe(413)
    expect((await bodyOf(response))['maxBytes']).toBe(1_000_000)
  })

  it('keeps a 409, which is a full session or an offset that is not where the file ends', async () => {
    answer = () => problem(409, 'conflict')
    expect((await upload()).status).toBe(409)
  })

  it('keeps a 404, which is a session that expired, was swept, or never existed', async () => {
    answer = () => problem(404, 'not_found')
    expect((await upload()).status).toBe(404)
  })

  it('answers 503 when the API cannot be reached, never 200 for a chunk nothing staged', async () => {
    answer = () => {
      throw new Error('ECONNREFUSED')
    }
    expect((await upload()).status).toBe(503)
  })

  it('says this surface plain sentence rather than the API detail', async () => {
    answer = () => problem(409, 'conflict')
    expect((await bodyOf(await upload()))['detail']).not.toBe('the API said so')
  })
})

describe('a forwarded refusal names this app path, never the internal API one (ADR 0041)', () => {
  it('answers a 409 against /api/import/upload rather than the session files path', async () => {
    answer = () => problem(409, 'conflict')
    expect(await bodyOf(await upload())).toMatchObject({ instance: '/api/import/upload' })
  })

  it('keeps maxBytes on a 413 while still naming this path', async () => {
    answer = () => problem(413, 'too_large', { maxBytes: 1_000_000 })
    const body = await bodyOf(await upload())
    expect(body).toMatchObject({ instance: '/api/import/upload', maxBytes: 1_000_000 })
  })

  it('leaks no /v1/ path and no session id anywhere in the document', async () => {
    answer = () => problem(404, 'not_found')
    const said = await (await upload()).text()
    expect(said).not.toContain('/v1/')
    expect(said).not.toContain('sessions/')
  })
})
