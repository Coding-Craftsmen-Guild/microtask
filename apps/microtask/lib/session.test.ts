import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SealedCookie } from '@repo/app-session/cookies'

const store = new Map<string, SealedCookie>()

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
  headers: () => Promise.resolve({ get: () => 'https' }),
}))

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  store.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const { session } = await import('./session')

describe('this app binds the shared session to mt_admin', () => {
  it('seals into mt_admin and into no other cookie', async () => {
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect([...store.keys()]).toEqual(['mt_admin'])
  })

  it('reads back what it sealed, so the binding is a live session and not a name', async () => {
    ;(await session()).sealAdmin('admin.1.sig', 600)
    expect((await session()).admin()).toEqual({ kind: 'admin', token: 'admin.1.sig' })
  })

  it('does not read Macroplan’s cookie, even sealed under the same secret', async () => {
    ;(await session()).sealAdmin('admin.1.sig', 600)
    const sealed = store.get('mt_admin')
    if (sealed === undefined) throw new Error('nothing was sealed')
    store.clear()
    store.set('mp_admin', { ...sealed, name: 'mp_admin' })
    expect((await session()).admin()).toBeNull()
  })
})
