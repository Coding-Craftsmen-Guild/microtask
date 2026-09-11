import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPrincipal } from './principal'

const held: { admin: AdminPrincipal | null; opened: number } = { admin: null, opened: 0 }

vi.mock('./session', () => ({
  session: () => {
    held.opened += 1
    return Promise.resolve({ admin: () => held.admin })
  },
}))

const sent: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(
      new Response(JSON.stringify({ projects: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  })
  held.admin = null
  held.opened = 0
  sent.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { apiForLink, apiForSession } = await import('./api')

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'

const headerOf = (name: string): string | undefined =>
  (sent[0]?.init.headers as Record<string, string> | undefined)?.[name]

describe('apiForSession', () => {
  it('builds the admin client from mt_admin', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    const client = await apiForSession('admin')
    expect(client?.credential).toBe('admin')
    await client?.projects.list()
    expect(headerOf('authorization')).toBe('Bearer admin.1.sig')
  })

  it('answers null when this browser presents no admin session', async () => {
    expect(await apiForSession('admin')).toBeNull()
  })

  it('calls the API named by API_BASE_URL with the key named by API_KEY', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession('admin'))?.projects.list()
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/projects')
    expect(headerOf('x-api-key')).toBe('the-service-key')
  })
})

describe('apiForLink — the URL token is the only authority on /s/*', () => {
  it('builds a link client that presents the token it was handed, beside the service key', async () => {
    const client = apiForLink(TOKEN)
    expect(client?.credential).toBe('link')
    await client?.projects.list()
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headerOf('x-api-key')).toBe('the-service-key')
  })

  it('opens no session — so an admin signed in on the same browser cannot elevate a link page', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    const client = apiForLink(TOKEN)
    await client?.projects.list()
    expect(held.opened).toBe(0)
    expect(client?.credential).toBe('link')
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('resolves each URL’s own token, whichever link this browser opened before', async () => {
    await apiForLink('tok_FIRSTLINKFIRSTLINK')?.projects.list()
    await apiForLink('tok_SECONDLINKSECONDLI')?.projects.list()
    const bearers = sent.map((one) => (one.init.headers as Record<string, string>)['authorization'])
    expect(bearers).toEqual(['Bearer tok_FIRSTLINKFIRSTLINK', 'Bearer tok_SECONDLINKSECONDLI'])
  })

  it.each(['', 'unavailable', 'short', `${TOKEN}\nx-api-key: forged`, `${TOKEN}/..`])(
    'answers null, and builds no request, for the segment %j',
    (segment) => {
      expect(apiForLink(segment)).toBeNull()
      expect(sent).toHaveLength(0)
    },
  )
})
