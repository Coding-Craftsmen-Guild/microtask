import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPrincipal, LinkPrincipal } from '../../../../../../../../../lib/principal'

const held: { admin: AdminPrincipal | null; link: LinkPrincipal | null } = { admin: null, link: null }

vi.mock('../../../../../../../../../lib/session', () => ({
  session: () => Promise.resolve({ admin: () => held.admin, link: () => held.link }),
}))

interface Sent {
  readonly url: string
  readonly init: RequestInit
}

const sent: Sent[] = []
let answer: (sent: Sent) => Response | Promise<Response> = () => Response.json({ updatedAt: 'S2' })

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'
const HOST = 'microtask.example'
const PATH = `/api/projects/${PROJECT}/tasks/${TASK}/tabs/${TAB}/document`
const API_PATH = `/v1/microtask/projects/${PROJECT}/tasks/${TASK}/tabs/${TAB}/document`
const DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    const one = { url, init }
    sent.push(one)
    return Promise.resolve().then(() => answer(one))
  })
  held.admin = { kind: 'admin', token: 'admin.1.sig' }
  held.link = null
  sent.length = 0
  answer = () => Response.json({ updatedAt: 'S2' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { PUT } = await import('./route')

const params = { params: Promise.resolve({ projectId: PROJECT, taskId: TASK, tabId: TAB }) }

const request = (
  headers: Readonly<Record<string, string>>,
  body: string = JSON.stringify(DOCUMENT),
): Request =>
  new Request(`http://${HOST}${PATH}`, {
    method: 'PUT',
    headers: { host: HOST, 'content-type': 'application/json', ...headers },
    body,
  })

const sameOrigin = (headers: Readonly<Record<string, string>> = {}): Request =>
  request({ origin: `https://${HOST}`, 'if-match': 'S1', ...headers })

const problem = (status: number, code: string, detail: string, extra: object = {}): Response =>
  new Response(
    JSON.stringify({ type: `/problems/${code}`, title: 't', status, code, detail, instance: API_PATH, ...extra }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )

const headersOf = (one: Sent | undefined): Record<string, string> =>
  (one?.init.headers ?? {}) as Record<string, string>

const bodyOf = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('PUT …/document forwards a same-origin write to the API', () => {
  it('sends the document to the tab path with If-Match verbatim and both credentials', async () => {
    const response = await PUT(sameOrigin({ 'if-match': '2026-09-11T10:00:00.123Z' }), params)
    expect(response.status).toBe(200)
    expect(await bodyOf(response)).toEqual({ updatedAt: 'S2' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url).toBe(`http://api.internal:4321${API_PATH}`)
    expect(sent[0]?.init.method).toBe('PUT')
    expect(headersOf(sent[0])['If-Match']).toBe('2026-09-11T10:00:00.123Z')
    expect(headersOf(sent[0])['authorization']).toBe('Bearer admin.1.sig')
    expect(headersOf(sent[0])['x-api-key']).toBe('the-service-key')
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual(DOCUMENT)
  })

  it('marks its answer uncacheable, since it reports one write and nothing else', async () => {
    const response = await PUT(sameOrigin(), params)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('accepts an Origin matching X-Forwarded-Host, which is the host the browser saw behind a proxy', async () => {
    const response = await PUT(
      request({ host: 'app.internal:3000', 'x-forwarded-host': HOST, origin: `https://${HOST}`, 'if-match': 'S1' }),
      params,
    )
    expect(response.status).toBe(200)
  })

  it('reads the first X-Forwarded-Host entry when a chain of proxies appended theirs', async () => {
    const response = await PUT(
      request({
        host: 'app.internal:3000',
        'x-forwarded-host': `${HOST}, edge.internal`,
        origin: `https://${HOST}`,
        'if-match': 'S1',
      }),
      params,
    )
    expect(response.status).toBe(200)
  })
})

describe('PUT …/document refuses a request that is not same-origin, before any authority is used', () => {
  it('refuses a hostile Origin with 403 and never reaches the API', async () => {
    const response = await PUT(request({ origin: 'https://evil.example', 'if-match': 'S1' }), params)
    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect((await bodyOf(response))['code']).toBe('forbidden')
    expect(sent).toHaveLength(0)
  })

  it('refuses a missing Origin with 403, because every browser sends one on a PUT', async () => {
    const response = await PUT(request({ 'if-match': 'S1' }), params)
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses the opaque Origin "null" with 403', async () => {
    const response = await PUT(request({ origin: 'null', 'if-match': 'S1' }), params)
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses an Origin that matches Host when X-Forwarded-Host names a different one', async () => {
    const response = await PUT(
      request({ host: HOST, 'x-forwarded-host': 'other.example', origin: `https://${HOST}`, 'if-match': 'S1' }),
      params,
    )
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses an Origin that shares the host name but not the port', async () => {
    const response = await PUT(request({ origin: `https://${HOST}:8443`, 'if-match': 'S1' }), params)
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses an Origin that is not a URL at all', async () => {
    const response = await PUT(request({ origin: 'not a url', 'if-match': 'S1' }), params)
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses a request carrying neither Host nor X-Forwarded-Host, since there is nothing to match', async () => {
    const bare = new Request(`http://${HOST}${PATH}`, {
      method: 'PUT',
      headers: { origin: `https://${HOST}`, 'if-match': 'S1' },
      body: JSON.stringify(DOCUMENT),
    })
    const response = await PUT(bare, params)
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })
})

describe('PUT …/document establishes authority itself, since proxy.ts passes /api/* through', () => {
  it('refuses a cross-origin request before opening a session or reading the body', async () => {
    held.admin = null
    const response = await PUT(request({ origin: 'https://evil.example', 'if-match': 'S1' }, '{not json'), params)
    expect(response.status).toBe(403)
  })

  it('refuses a browser with no session before reading the body', async () => {
    held.admin = null
    const response = await PUT(request({ origin: `https://${HOST}`, 'if-match': 'S1' }, '{not json'), params)
    expect(response.status).toBe(401)
  })

  it('answers 401 with no API call when the browser presents no mt_admin', async () => {
    held.admin = null
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect((await bodyOf(response))['code']).toBe('no_principal')
    expect(sent).toHaveLength(0)
  })

  it('reads mt_admin and never mt_link, so a link cookie alone buys nothing here', async () => {
    held.admin = null
    held.link = { kind: 'link', token: 'sharetoken-sharetoken' }
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })

  it('refuses a body that is not JSON with 400 and no API call', async () => {
    const response = await PUT(request({ origin: `https://${HOST}`, 'if-match': 'S1' }, '{not json'), params)
    expect(response.status).toBe(400)
    expect((await bodyOf(response))['code']).toBe('bad_request')
    expect(sent).toHaveLength(0)
  })

  it('refuses a JSON body that is not a document with 422 and no API call', async () => {
    const response = await PUT(
      request({ origin: `https://${HOST}`, 'if-match': 'S1' }, '{"type":"paragraph"}'),
      params,
    )
    expect(response.status).toBe(422)
    expect(await bodyOf(response)).toMatchObject({ code: 'invalid', in: 'json' })
    expect(sent).toHaveLength(0)
  })
})

describe('PUT …/document passes the API answer through unchanged in kind', () => {
  it('keeps a 409 a 409, with the problem document, and never a 200', async () => {
    answer = () => problem(409, 'conflict', 'This tab changed elsewhere')
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await bodyOf(response)).toMatchObject({
      type: '/problems/conflict',
      title: 'Conflict',
      status: 409,
      code: 'conflict',
      detail: 'This tab changed elsewhere',
      instance: API_PATH,
    })
  })

  it('keeps an API 401 a 401', async () => {
    answer = () => problem(401, 'unknown_principal', 'The bearer is not accepted')
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(401)
    expect(await bodyOf(response)).toMatchObject({ code: 'unknown_principal', detail: 'The bearer is not accepted' })
  })

  it('keeps a 413 a 413 carrying maxBytes', async () => {
    answer = () => problem(413, 'payload_too_large', 'Too large', { maxBytes: 2_500_000 })
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(413)
    expect(await bodyOf(response)).toMatchObject({ code: 'payload_too_large', maxBytes: 2_500_000 })
  })

  it('carries no maxBytes on a problem that had none', async () => {
    answer = () => problem(409, 'conflict', 'This tab changed elsewhere')
    const response = await PUT(sameOrigin(), params)
    expect(await bodyOf(response)).not.toHaveProperty('maxBytes')
  })

  it('keeps a 422 a 422 carrying the target and fields it named', async () => {
    const errors = [{ path: 'If-Match', message: 'Required', code: 'too_small' }]
    answer = () => problem(422, 'invalid', 'Invalid header', { in: 'header', errors })
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(422)
    expect(await bodyOf(response)).toMatchObject({ in: 'header', errors })
  })

  it('keeps an API 500 a 500 rather than dressing it as anything else', async () => {
    answer = () => problem(500, 'internal_error', 'Boom')
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(500)
  })

  it('forwards an absent If-Match as an empty precondition, leaving the refusal to the API', async () => {
    answer = () => problem(422, 'invalid', 'Invalid header', { in: 'header', errors: [] })
    const response = await PUT(request({ origin: `https://${HOST}` }), params)
    expect(headersOf(sent[0])['If-Match']).toBe('')
    expect(response.status).toBe(422)
  })

  it('answers 503 when the API cannot be reached, never a 200 and never a 500', async () => {
    answer = () => Promise.reject(new TypeError('fetch failed'))
    const response = await PUT(sameOrigin(), params)
    expect(response.status).toBe(503)
    expect(await bodyOf(response)).toMatchObject({ status: 503, code: 'service_unavailable' })
  })
})

describe('twenty concurrent writes on one If-Match', () => {
  it('forwards each its own If-Match and hands every 409 the API answers back as a 409', async () => {
    let stamp = 'S1'
    let writes = 0
    answer = ({ init }) => {
      const expected = (init.headers as Record<string, string>)['If-Match']
      if (expected !== stamp) return problem(409, 'conflict', 'This tab changed elsewhere')
      writes += 1
      stamp = `S${String(writes + 1)}`
      return Response.json({ updatedAt: stamp })
    }
    const responses = await Promise.all(Array.from({ length: 20 }, () => PUT(sameOrigin(), params)))
    expect(sent.map((one) => headersOf(one)['If-Match'])).toEqual(Array.from({ length: 20 }, () => 'S1'))
    const histogram = responses.reduce<Record<number, number>>(
      (counts, one) => ({ ...counts, [one.status]: (counts[one.status] ?? 0) + 1 }),
      {},
    )
    expect(histogram).toEqual({ 200: 1, 409: 19 })
  })
})
