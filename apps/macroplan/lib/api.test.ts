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
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(
      new Response(JSON.stringify({ plans: [] }), {
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

const { apiForLink, apiForSession, apiOptions, clientFor } = await import('./api')

const TOKEN = 'a_plan_seats_token1'

const headerOf = (name: string): string | undefined =>
  (sent[0]?.init.headers as Record<string, string> | undefined)?.[name]

describe('apiForSession', () => {
  it('builds the admin client from mp_admin', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    const client = await apiForSession()
    expect(client?.credential).toBe('admin')
    await client?.plans.list()
    expect(headerOf('authorization')).toBe('Bearer admin.1.sig')
  })

  it('answers null when this browser presents no admin session', async () => {
    expect(await apiForSession()).toBeNull()
    expect(held.opened).toBe(1)
  })

  it('presents this app own service key, not the other product key', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession())?.plans.list()
    expect(headerOf('x-api-key')).toBe('the-macroplan-service-key')
  })

  it('calls the API named by API_BASE_URL', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession())?.plans.list()
    expect(sent[0]?.url.startsWith('http://api.internal:4321/')).toBe(true)
  })

  // **The enumeration stays, and audit 7n's sibling question is why.** What this case is really
  // asserting is a property — "this client reaches this product's routes and no Microtask route" — and
  // the two URL assertions below are that property, so the key list looks like maintenance the property
  // would save. It is not: a property can only be exercised by *calling* something, so a `folders` or
  // `tabs` group added to `MacroplanApi` and called by nothing would leave both URL assertions green.
  // The list is what fails then. Phase 4's bridge methods will break it, and breaking is the right
  // outcome — a new group on this client is exactly the review this exists to force. There are two
  // copies of the list and deliberately no third: this one and
  // `packages/api-client/src/macroplan-clients.test.ts`, which checks the factory where this checks what
  // a session hands a page.
  it('reaches this product own routes and no project route, the surface holding none', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    const client = await apiForSession()
    expect(Object.keys(client ?? {}).sort()).toEqual([
      'credential',
      'currentShare',
      'epics',
      'features',
      'items',
      'plans',
      'shareLinks',
    ])
    await client?.plans.list()
    expect(sent[0]?.url).toContain('/v1/macroplan/')
    expect(sent[0]?.url).not.toContain('/v1/microtask/')
  })
})

describe('apiForLink', () => {
  it('builds the link client from the segment, with no cookie behind it', () => {
    const client = apiForLink(TOKEN)
    expect(client?.credential).toBe('link')
    expect(held.opened).toBe(0)
  })

  it('is synchronous, there being no cookie jar to await', () => {
    expect(apiForLink(TOKEN)).not.toBeInstanceOf(Promise)
  })

  it('presents that token as the bearer and nothing of the admin session', async () => {
    await apiForLink(TOKEN)?.currentShare().catch(() => undefined)
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(headerOf('x-api-key')).toBe('the-macroplan-service-key')
    expect(held.opened).toBe(0)
  })

  it.each([['', 'empty'], ['unavailable', 'the terminal segment'], [`${TOKEN}\n`, 'a newline']])(
    'answers null for %j, %s, before any request is built',
    (segment) => {
      expect(apiForLink(segment)).toBeNull()
      expect(sent).toHaveLength(0)
    },
  )
})

describe('clientFor — the one place a principal turns into authority', () => {
  it('mints an admin client for an admin principal and a link client for a link one', () => {
    const options = apiOptions()
    expect(clientFor({ kind: 'admin', token: 'admin.1.sig' }, options).credential).toBe('admin')
    expect(clientFor({ kind: 'link', token: TOKEN }, options).credential).toBe('link')
  })

  it('sends each principal own token as the bearer, so neither can be reached with the other', async () => {
    await clientFor({ kind: 'link', token: TOKEN }, apiOptions())
      .currentShare()
      .catch(() => undefined)
    expect(headerOf('authorization')).toBe(`Bearer ${TOKEN}`)
  })

  it('takes options as a parameter, so a test can say where the call goes', async () => {
    const options = { baseUrl: 'https://elsewhere.test', serviceKey: 'a-key-of-its-own' }
    await clientFor({ kind: 'admin', token: 'admin.1.sig' }, options).plans.list()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.url.startsWith('https://elsewhere.test/')).toBe(true)
    expect(headerOf('x-api-key')).toBe('a-key-of-its-own')
    expect(headerOf('authorization')).toBe('Bearer admin.1.sig')
  })
})

describe('what this module exports', () => {
  it('mints authority from a principal and from nothing else', async () => {
    const api = await import('./api')
    expect(Object.keys(api).sort()).toEqual([
      'apiForLink',
      'apiForSession',
      'apiOptions',
      'clientFor',
      'loginWith',
    ])
  })
})
