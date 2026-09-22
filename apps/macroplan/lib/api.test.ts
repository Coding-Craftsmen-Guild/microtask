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

const { apiForSession } = await import('./api')

const headerOf = (name: string): string | undefined =>
  (sent[0]?.init.headers as Record<string, string> | undefined)?.[name]

describe('apiForSession', () => {
  it('builds the admin client from mp_admin', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    const client = await apiForSession()
    expect(client?.credential).toBe('admin')
    await client?.projects.list()
    expect(headerOf('authorization')).toBe('Bearer admin.1.sig')
  })

  it('answers null when this browser presents no admin session', async () => {
    expect(await apiForSession()).toBeNull()
    expect(held.opened).toBe(1)
  })

  it('presents this app own service key, not the other product key', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession())?.projects.list()
    expect(headerOf('x-api-key')).toBe('the-macroplan-service-key')
  })

  it('calls the API named by API_BASE_URL', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession())?.projects.list()
    expect(sent[0]?.url.startsWith('http://api.internal:4321/')).toBe(true)
  })
})

describe('what this app cannot build', () => {
  it('exports no link client, so a share token has no way in here yet (ADR 0014)', async () => {
    const api = await import('./api')
    expect(Object.keys(api).sort()).toEqual(['apiForSession', 'apiOptions', 'loginWith'])
  })
})
