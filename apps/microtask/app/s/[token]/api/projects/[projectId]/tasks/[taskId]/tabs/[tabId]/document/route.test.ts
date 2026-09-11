import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '../../../../../../../../../../../lib/crypto'
import { payloadOf } from '../../../../../../../../../../../lib/principal'
import { DOCUMENT_REFUSALS, plainRefusal } from '../../../../../../../../../../../lib/refusal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const ADMIN = `mt_admin=${seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))}`
const consulted: string[] = []

vi.mock('next/headers', () => ({
  cookies: () => {
    consulted.push('cookies')
    return Promise.resolve({ get: () => undefined, set: () => undefined })
  },
  headers: () => {
    consulted.push('headers')
    return Promise.resolve(new Headers())
  },
}))

interface Sent {
  readonly url: string
  readonly init: RequestInit
}

const sent: Sent[] = []
let answer: (sent: Sent) => Response | Promise<Response> = () => Response.json({ updatedAt: 'S2' })

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'
const HOST = 'microtask.example'
const DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }
const API_PATH = `/v1/microtask/projects/${PROJECT}/tasks/${TASK}/tabs/${TAB}/document`
const pathFor = (token: string): string => `/s/${token}/api/projects/${PROJECT}/tasks/${TASK}/tabs/${TAB}/document`

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const one = { url, init }
    sent.push(one)
    return Promise.resolve().then(() => answer(one))
  })
  sent.length = 0
  consulted.length = 0
  answer = () => Response.json({ updatedAt: 'S2' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { PUT } = await import('./route')

interface Put {
  readonly token?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string
}

const put = ({ token = TOKEN, headers = {}, body = JSON.stringify(DOCUMENT) }: Put = {}): Promise<Response> =>
  PUT(
    new Request(`http://${HOST}${pathFor(token)}`, {
      method: 'PUT',
      headers: { host: HOST, origin: `https://${HOST}`, 'if-match': 'S1', 'content-type': 'application/json', ...headers },
      body,
    }),
    { params: Promise.resolve({ token, projectId: PROJECT, taskId: TASK, tabId: TAB }) },
  )

const headersOf = (one: Sent | undefined): Record<string, string> => (one?.init.headers ?? {}) as Record<string, string>

const bodyOf = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

const problem = (status: number, code: string, extra: object = {}): Response =>
  new Response(JSON.stringify({ type: `/problems/${code}`, title: 't', status, code, detail: code, instance: API_PATH, ...extra }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

describe('PUT /s/<token>/api/…/document writes with the URL token and nothing else', () => {
  it('sends the document to the tab path, If-Match verbatim, under the URL token and the service key', async () => {
    const response = await put({ headers: { 'if-match': '2026-09-11T10:00:00.123Z' } })
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ updatedAt: 'S2' })
    expect(sent[0]?.url).toBe(`http://api.internal:4321${API_PATH}`)
    expect(sent[0]?.init.method).toBe('PUT')
    expect(headersOf(sent[0])['If-Match']).toBe('2026-09-11T10:00:00.123Z')
    expect(headersOf(sent[0])['authorization']).toBe(`Bearer ${TOKEN}`)
    expect(headersOf(sent[0])['x-api-key']).toBe('the-service-key')
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual(DOCUMENT)
  })

  it('never opens a cookie, so an mt_admin on the same browser cannot turn a client’s save into an admin one', async () => {
    const response = await put({ headers: { cookie: ADMIN } })
    expect(response.status).toBe(200)
    expect(consulted).toEqual([])
    expect(headersOf(sent[0])['authorization']).toBe(`Bearer ${TOKEN}`)
  })

  it('marks its answer uncacheable', async () => {
    expect((await put()).headers.get('cache-control')).toBe('no-store')
  })

  it('forwards an absent If-Match as an empty precondition, leaving the refusal to the API', async () => {
    answer = () => problem(422, 'invalid', { in: 'header', errors: [] })
    const response = await PUT(
      new Request(`http://${HOST}${pathFor(TOKEN)}`, { method: 'PUT', headers: { host: HOST, origin: `https://${HOST}` }, body: JSON.stringify(DOCUMENT) }),
      { params: Promise.resolve({ token: TOKEN, projectId: PROJECT, taskId: TASK, tabId: TAB }) },
    )
    expect(headersOf(sent[0])['If-Match']).toBe('')
    expect(response.status).toBe(422)
  })
})

describe('PUT /s/<token>/api/…/document refuses before it spends anything', () => {
  it.each([
    ['a hostile Origin', { origin: 'https://evil.example' }],
    ['the opaque Origin "null"', { origin: 'null' }],
    ['an Origin naming this host as a prefix of its own', { origin: `https://${HOST}.evil.example` }],
    ['an Origin matching Host when X-Forwarded-Host names another', { 'x-forwarded-host': 'other.example' }],
  ])('refuses %s with 403 and no API call', async (_label, headers) => {
    const response = await put({ headers })
    expect(response.status).toBe(403)
    expect(await bodyOf(response)).toMatchObject({ code: 'forbidden' })
    expect(sent).toHaveLength(0)
  })

  it('refuses a missing Origin with 403, because every browser sends one on a PUT', async () => {
    const response = await PUT(
      new Request(`http://${HOST}${pathFor(TOKEN)}`, { method: 'PUT', headers: { host: HOST, 'if-match': 'S1' }, body: JSON.stringify(DOCUMENT) }),
      { params: Promise.resolve({ token: TOKEN, projectId: PROJECT, taskId: TASK, tabId: TAB }) },
    )
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('accepts an Origin matching X-Forwarded-Host, the host the browser saw behind the proxy', async () => {
    const response = await put({ headers: { host: 'app.internal:3000', 'x-forwarded-host': HOST } })
    expect(response.status).toBe(200)
  })

  it.each(['short', 'unavailable', 'tok_has.a.dot.in.it.here'])(
    'answers 401 with no API call for the segment %j, which cannot be a token',
    async (token) => {
      const response = await put({ token })
      expect(response.status).toBe(401)
      expect(await bodyOf(response)).toMatchObject({ code: 'unknown_principal', detail: DOCUMENT_REFUSALS.link.unauthorised })
      expect(sent).toHaveLength(0)
    },
  )

  it('refuses a cross-origin request before it looks at the token or the body', async () => {
    const response = await put({ token: 'short', body: '{not json', headers: { origin: 'https://evil.example' } })
    expect(response.status).toBe(403)
  })

  it('refuses a malformed token before it reads the body', async () => {
    expect((await put({ token: 'short', body: '{not json' })).status).toBe(401)
  })

  it('refuses a body that is not JSON with 400, and JSON that is not a document with 422', async () => {
    expect(await bodyOf(await put({ body: '{not json' }))).toMatchObject({ status: 400, code: 'bad_request' })
    const invalid = await put({ body: '{"type":"paragraph"}' })
    expect(invalid.status).toBe(422)
    expect(await bodyOf(invalid)).toMatchObject({ code: 'invalid', in: 'json', errors: [expect.objectContaining({ path: 'type' })] })
    expect(sent).toHaveLength(0)
  })

  it('names the route in its own problems without the token', async () => {
    const refused = await bodyOf(await put({ token: 'short-but-secret', body: '{not json' }))
    expect(refused['instance']).toBe(pathFor('[token]'))
    expect(JSON.stringify(refused)).not.toContain('short-but-secret')
    const cross = await bodyOf(await put({ headers: { origin: 'https://evil.example' } }))
    expect(JSON.stringify(cross)).not.toContain(TOKEN)
  })
})

describe('PUT /s/<token>/api/…/document passes the API answer through unchanged in kind', () => {
  it('keeps a 409 a 409, never a 200', async () => {
    answer = () => problem(409, 'conflict')
    const response = await put()
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await bodyOf(response)).toMatchObject({ code: 'conflict', instance: API_PATH })
  })

  it('keeps the 401 a revoked link gets a 401, and says the link is gone rather than what the API calls its bearer', async () => {
    answer = () => problem(401, 'unknown_principal', { detail: 'The bearer token does not name anyone.' })
    const response = await put()
    expect(response.status).toBe(401)
    const body = await bodyOf(response)
    expect(body).toMatchObject({ code: 'unknown_principal', instance: API_PATH })
    expect(body['detail']).toBe(DOCUMENT_REFUSALS.link.unauthorised)
  })

  it('tells a link downgraded to view that it is read-only now, never "Not permitted: tab:write"', async () => {
    answer = () => problem(403, 'forbidden', { detail: 'Not permitted: tab:write' })
    const body = await bodyOf(await put())
    expect(body).toMatchObject({ status: 403, code: 'forbidden', detail: DOCUMENT_REFUSALS.link.forbidden })
    expect(JSON.stringify(body)).not.toContain('Not permitted')
  })

  it.each([
    [404, 'not_found', 'Tab not found'],
    [413, 'payload_too_large', 'Too large'],
    [422, 'invalid', 'Document is nested too deeply'],
    [500, 'internal_error', 'The server could not complete the request.'],
  ])('says a %i in the link surface’s words, never the API’s', async (status, code, detail) => {
    answer = () => problem(status, code, { detail })
    const body = await bodyOf(await put())
    expect(body).toMatchObject({ status, code, detail: plainRefusal(status, DOCUMENT_REFUSALS.link) })
    expect(JSON.stringify(body)).not.toContain(detail)
  })

  it('keeps the 403 a view link gets a 403', async () => {
    answer = () => problem(403, 'forbidden')
    expect((await put()).status).toBe(403)
  })

  it('keeps a 413 a 413 carrying maxBytes', async () => {
    answer = () => problem(413, 'payload_too_large', { maxBytes: 2_500_000 })
    const response = await put()
    expect(response.status).toBe(413)
    expect(await bodyOf(response)).toMatchObject({ maxBytes: 2_500_000 })
  })

  it('answers 503 when the API cannot be reached, never a 200 and never a 500', async () => {
    answer = () => Promise.reject(new TypeError('fetch failed'))
    const response = await put()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await bodyOf(response))).not.toContain(TOKEN)
  })
})
