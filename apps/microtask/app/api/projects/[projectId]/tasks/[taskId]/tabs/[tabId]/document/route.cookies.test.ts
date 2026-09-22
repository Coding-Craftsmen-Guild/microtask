import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '@repo/app-session/crypto'
import { payloadOf } from '../../../../../../../../../lib/principal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
let current: Request = new Request('http://x/')
let opened = 0

const parse = (header: string | null): Map<string, string> =>
  new Map(
    (header ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.includes('='))
      .map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)] as [string, string]),
  )

vi.mock('next/headers', () => ({
  cookies: () => {
    opened += 1
    return Promise.resolve({
      get: (name: string) => {
        const value = parse(current.headers.get('cookie')).get(name)
        return value === undefined ? undefined : { name, value }
      },
      set: () => {
        throw new Error('the route must not write a cookie')
      },
    })
  },
  headers: () => Promise.resolve(current.headers),
}))

const sent: { url: string; init: RequestInit }[] = []
let answer: () => Response = () => Response.json({ updatedAt: 'S2' })

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(answer())
  })
  sent.length = 0
  opened = 0
  answer = () => Response.json({ updatedAt: 'S2' })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { PUT } = await import('./route')

const HOST = 'microtask.example'
const params = { params: Promise.resolve({ projectId: 'p', taskId: 't', tabId: 'b' }) }
const admin = `mt_admin=${seal(SECRET, payloadOf({ kind: 'admin', token: 'admin.1.sig' }))}`
const link = `mt_link=${seal(SECRET, payloadOf({ kind: 'link', token: 'sharetoken-sharetoken' }))}`

const put = (headers: Record<string, string>): Promise<Response> => {
  current = new Request(`http://${HOST}/api/projects/p/tasks/t/tabs/b/document`, {
    method: 'PUT',
    headers: { host: HOST, 'if-match': 'S1', ...headers },
    body: JSON.stringify({ type: 'doc', content: [] }),
  })
  return PUT(current, params)
}

describe('PUT …/document opens mt_admin from the request itself, through the real session store', () => {
  it('answers 401 with no API call to a request carrying no cookie at all', async () => {
    const response = await put({ origin: `https://${HOST}` })
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })
  it('answers 401 to a request carrying mt_link alone', async () => {
    const response = await put({ origin: `https://${HOST}`, cookie: link })
    expect(response.status).toBe(401)
    expect(sent).toHaveLength(0)
  })
  it('answers 401 to a link principal moved into mt_admin', async () => {
    const response = await put({ origin: `https://${HOST}`, cookie: link.replace('mt_link', 'mt_admin') })
    expect(response.status).toBe(401)
  })
  it('answers 401 to an mt_admin that will not open', async () => {
    const response = await put({ origin: `https://${HOST}`, cookie: `${admin.slice(0, -2)}AA` })
    expect(response.status).toBe(401)
  })
  it('sends the bearer mt_admin wraps, and writes no cookie of its own', async () => {
    const response = await put({ origin: `https://${HOST}`, cookie: `${link}; ${admin}` })
    expect(response.status).toBe(200)
    expect((sent[0]?.init.headers as Record<string, string>)['authorization']).toBe('Bearer admin.1.sig')
  })
  it('refuses a hostile Origin even with a live mt_admin, and never reaches the API', async () => {
    const response = await put({ origin: 'https://evil.example', cookie: admin })
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })
  it('refuses a hostile Origin before it opens the cookie jar at all', async () => {
    const response = await put({ origin: 'https://evil.example', cookie: admin })
    expect(response.status).toBe(403)
    expect(opened).toBe(0)
    await put({ origin: `https://${HOST}`, cookie: admin })
    expect(opened).toBeGreaterThan(0)
  })
  it('refuses an Origin that names this host as userinfo', async () => {
    const response = await put({ origin: `https://${HOST}@evil.example`, cookie: admin })
    expect(response.status).toBe(403)
  })
  it('refuses an Origin that names this host as a prefix of its own', async () => {
    const response = await put({ origin: `https://${HOST}.evil.example`, cookie: admin })
    expect(response.status).toBe(403)
  })
  it('matches a Host header written in capitals', async () => {
    const response = await put({ host: 'MicroTask.Example', origin: `https://${HOST}`, cookie: admin })
    expect(response.status).toBe(200)
  })
  it('matches an X-Forwarded-Host written in capitals', async () => {
    const response = await put({ host: 'app.internal:3000', 'x-forwarded-host': 'MicroTask.Example', origin: `https://${HOST}`, cookie: admin })
    expect(response.status).toBe(200)
  })

  it('keeps a 409 a 409 when a proxy replaced the problem with HTML', async () => {
    answer = () => new Response('<html>conflict</html>', { status: 409 })
    const response = await put({ origin: `https://${HOST}`, cookie: admin })
    expect(response.status).toBe(409)
  })
  it('keeps a 409 a 409, as a problem document, when it arrived with no body', async () => {
    answer = () => new Response(null, { status: 409 })
    const response = await put({ origin: `https://${HOST}`, cookie: admin })
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
  })
  it('answers 503, never 200, to a success body the contract refuses', async () => {
    answer = () => Response.json({ nope: true })
    const response = await put({ origin: `https://${HOST}`, cookie: admin })
    expect(response.status).toBe(503)
  })
})
