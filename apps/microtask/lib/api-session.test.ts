import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminPrincipal, LinkPrincipal } from './principal'

const held: { admin: AdminPrincipal | null; link: LinkPrincipal | null } = { admin: null, link: null }

vi.mock('./session', () => ({
  session: () => Promise.resolve({ admin: () => held.admin, link: () => held.link }),
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
  held.link = null
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
  it('builds the admin client from mt_admin for the admin audience', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    held.link = { kind: 'link', token: 'sharetoken' }
    const client = await apiForSession('admin')
    expect(client?.credential).toBe('admin')
    await client?.projects.list()
    expect(headerOf('authorization')).toBe('Bearer admin.1.sig')
  })

  it('builds the link client from mt_link for the link audience', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    held.link = { kind: 'link', token: 'sharetoken' }
    const client = await apiForSession('link')
    expect(client?.credential).toBe('link')
    await client?.projects.list()
    expect(headerOf('authorization')).toBe('Bearer sharetoken')
  })

  it('answers null for a link route when only an admin session exists', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    expect(await apiForSession('link')).toBeNull()
  })

  it('answers null for an admin route when only a link session exists', async () => {
    held.link = { kind: 'link', token: 'sharetoken' }
    expect(await apiForSession('admin')).toBeNull()
  })

  it('calls the API named by API_BASE_URL with the key named by API_KEY', async () => {
    held.admin = { kind: 'admin', token: 'admin.1.sig' }
    await (await apiForSession('admin'))?.projects.list()
    expect(sent[0]?.url).toBe('http://api.internal:4321/v1/microtask/projects')
    expect(headerOf('x-api-key')).toBe('the-service-key')
  })
})
