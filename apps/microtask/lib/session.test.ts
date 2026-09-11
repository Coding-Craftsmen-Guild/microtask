import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_COOKIE } from './principal'
import type { SealedCookie } from './session-store'

const store = new Map<string, SealedCookie>()
const request: { proto: string | null } = { proto: 'https' }

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const found = store.get(name)
        return found === undefined ? undefined : { name, value: found.value }
      },
      set: (cookie: SealedCookie) => {
        store.set(cookie.name, cookie)
      },
    }),
  headers: () =>
    Promise.resolve({ get: (name: string) => (name === 'x-forwarded-proto' ? request.proto : null) }),
}))

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  store.clear()
  request.proto = 'https'
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const { session } = await import('./session')

describe('session', () => {
  it("writes through to Next's cookie store and reads back what it wrote", async () => {
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect(store.get(ADMIN_COOKIE)?.maxAge).toBe(600)
    expect((await session()).admin()).toEqual({ kind: 'admin', token: 'admin.1.sig' })
  })

  it('marks the cookie Secure when the proxy says the client hop was https', async () => {
    request.proto = 'https'
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect(store.get(ADMIN_COOKIE)?.secure).toBe(true)
  })

  it('leaves Secure off when the proxy says http, so local dev keeps a session', async () => {
    request.proto = 'http'
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect(store.get(ADMIN_COOKIE)?.secure).toBe(false)
  })

  it('leaves Secure off when no proxy header arrived at all', async () => {
    request.proto = null
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect(store.get(ADMIN_COOKIE)?.secure).toBe(false)
  })
})
