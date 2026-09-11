import { ApiError } from '@repo/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seal } from '../lib/crypto'
import { LOGIN_REFUSED } from '../lib/login'
import { ADMIN_COOKIE, LINK_COOKIE, payloadOf } from '../lib/principal'
import { sessionCookies, type SealedCookie } from '../lib/session-store'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const jar = new Map<string, SealedCookie>()

const loginWith = vi.fn<(password: string) => Promise<unknown>>()

vi.mock('../lib/api', () => ({ loginWith: (password: string) => loginWith(password) }))

vi.mock('../lib/session', () => ({
  session: () =>
    Promise.resolve(
      sessionCookies({
        jar: {
          get: (name: string) => {
            const found = jar.get(name)
            return found === undefined ? undefined : { value: found.value }
          },
          set: (cookie: SealedCookie) => {
            jar.set(cookie.name, cookie)
          },
        },
        secret: SECRET,
        secure: true,
      }),
    ),
}))

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { signIn, signOut } = await import('./auth')

const form = (fields: Readonly<Record<string, string>>): FormData => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

const redirectOf = async (attempt: Promise<unknown>): Promise<string> => {
  const outcome = await attempt.then(
    () => null,
    (error: unknown) => error,
  )
  if (!(outcome instanceof Redirected)) throw new Error(`expected a redirect, got ${String(outcome)}`)
  return outcome.location
}

const refusal = (detail: string): ApiError =>
  new ApiError({ status: 401, code: 'unauthorized', detail, instance: '/v1/auth/login' })

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  jar.clear()
  loginWith.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  warn.mockRestore()
})

describe('signIn', () => {
  it('seals mt_admin for exactly the bearer lifetime and redirects to next=', async () => {
    loginWith.mockResolvedValue({ token: 'admin.1.sig', expiresAt: 'x', expiresInSeconds: 1234 })
    const location = await redirectOf(signIn({ message: null }, form({ password: 'pw', next: '/p/01H' })))
    expect(location).toBe('/p/01H')
    expect(jar.get(ADMIN_COOKIE)?.maxAge).toBe(1234)
  })

  it('seals a cookie that opens back to the bearer the API minted', async () => {
    loginWith.mockResolvedValue({ token: 'admin.1.sig', expiresAt: 'x', expiresInSeconds: 60 })
    await redirectOf(signIn({ message: null }, form({ password: 'pw' })))
    const cookies = sessionCookies({
      jar: { get: (name) => jar.get(name), set: () => undefined },
      secret: SECRET,
      secure: true,
    })
    expect(cookies.admin()).toEqual({ kind: 'admin', token: 'admin.1.sig' })
  })

  it('passes the password to the API and nowhere else', async () => {
    loginWith.mockResolvedValue({ token: 't', expiresAt: 'x', expiresInSeconds: 60 })
    await redirectOf(signIn({ message: null }, form({ password: 'correct horse' })))
    expect(loginWith).toHaveBeenCalledWith('correct horse')
  })

  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', '/login'])(
    'lands on / rather than on %s',
    async (next) => {
      loginWith.mockResolvedValue({ token: 't', expiresAt: 'x', expiresInSeconds: 60 })
      expect(await redirectOf(signIn({ message: null }, form({ password: 'pw', next })))).toBe('/')
    },
  )

  it('answers a wrong password and an unknown service key identically', async () => {
    loginWith.mockRejectedValueOnce(refusal('The credentials presented were not accepted.'))
    const wrongPassword = await signIn({ message: null }, form({ password: 'guess' }))
    loginWith.mockRejectedValueOnce(refusal('This request carried no recognised service key.'))
    const unknownService = await signIn({ message: null }, form({ password: 'guess' }))
    expect(wrongPassword).toEqual(unknownService)
    expect(wrongPassword).toEqual({ message: LOGIN_REFUSED })
  })

  it('writes no cookie when the API refuses', async () => {
    loginWith.mockRejectedValue(refusal('no'))
    await signIn({ message: null }, form({ password: 'guess' }))
    expect(jar.size).toBe(0)
  })

  it('logs each refusal once, without the password', async () => {
    loginWith.mockRejectedValue(refusal('no'))
    await signIn({ message: null }, form({ password: 'correct horse' }))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('auth.login.refused')
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('correct horse')
  })

  it('makes no request for an empty password', async () => {
    expect(await signIn({ message: null }, form({ password: '' }))).toEqual({ message: LOGIN_REFUSED })
    expect(loginWith).not.toHaveBeenCalled()
  })

  it('leaves mt_link alone when it seals mt_admin', async () => {
    const link = seal(SECRET, payloadOf({ kind: 'link', token: 'share' }))
    jar.set(LINK_COOKIE, { name: LINK_COOKIE, value: link, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 9 })
    loginWith.mockResolvedValue({ token: 't', expiresAt: 'x', expiresInSeconds: 60 })
    await redirectOf(signIn({ message: null }, form({ password: 'pw' })))
    expect(jar.get(LINK_COOKIE)?.value).toBe(link)
  })
})

describe('signOut', () => {
  it('clears mt_admin, leaves mt_link, and lands on /login', async () => {
    const link = seal(SECRET, payloadOf({ kind: 'link', token: 'share' }))
    jar.set(LINK_COOKIE, { name: LINK_COOKIE, value: link, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 9 })
    jar.set(ADMIN_COOKIE, { name: ADMIN_COOKIE, value: 'sealed', httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 9 })
    expect(await redirectOf(signOut())).toBe('/login')
    expect(jar.get(ADMIN_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(jar.get(LINK_COOKIE)?.value).toBe(link)
  })

  it('makes no API call, because there is deliberately no logout route (ADR 0032)', async () => {
    await redirectOf(signOut())
    expect(loginWith).not.toHaveBeenCalled()
  })
})
