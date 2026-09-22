import { ApiError } from '@repo/api-client'
import { seal } from '@repo/app-session/crypto'
import { sessionCookies, type SealedCookie } from '@repo/app-session/cookies'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOGIN_REFUSED } from '../lib/login'
import { ADMIN_COOKIE, payloadOf } from '../lib/principal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'
const MICROTASK_COOKIE = 'mt_admin'
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
        name: ADMIN_COOKIE,
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

const issued = { token: 'admin.1.sig', expiresAt: 'x', expiresInSeconds: 1234 }

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
  it('seals mp_admin for exactly the bearer lifetime and redirects to next=', async () => {
    loginWith.mockResolvedValue(issued)
    const location = await redirectOf(signIn({ message: null }, form({ password: 'pw', next: '/plans/01H' })))
    expect(location).toBe('/plans/01H')
    expect(jar.get(ADMIN_COOKIE)?.maxAge).toBe(1234)
  })

  it('seals a cookie that opens back to the bearer the API minted', async () => {
    loginWith.mockResolvedValue(issued)
    await redirectOf(signIn({ message: null }, form({ password: 'pw' })))
    const cookies = sessionCookies({
      jar: { get: (name) => jar.get(name), set: () => undefined },
      name: ADMIN_COOKIE,
      secret: SECRET,
      secure: true,
    })
    expect(cookies.admin()).toEqual({ kind: 'admin', token: 'admin.1.sig' })
  })

  it('passes the password to the API and nowhere else', async () => {
    loginWith.mockResolvedValue(issued)
    await redirectOf(signIn({ message: null }, form({ password: 'correct horse' })))
    expect(loginWith).toHaveBeenCalledWith('correct horse')
  })

  it.each(['https://evil.example/', '//evil.example', '/login'])('lands on / rather than on %s', async (next) => {
    loginWith.mockResolvedValue(issued)
    expect(await redirectOf(signIn({ message: null }, form({ password: 'pw', next })))).toBe('/')
  })

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

  it('leaves the Microtask session alone when it seals mp_admin (ADR 0014)', async () => {
    const theirs = seal(SECRET, payloadOf({ kind: 'admin', token: 'their.bearer' }))
    jar.set(MICROTASK_COOKIE, {
      name: MICROTASK_COOKIE,
      value: theirs,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 9,
    })
    loginWith.mockResolvedValue(issued)
    await redirectOf(signIn({ message: null }, form({ password: 'pw' })))
    expect(jar.get(MICROTASK_COOKIE)?.value).toBe(theirs)
  })
})

describe('signOut', () => {
  it('clears mp_admin, leaves the Microtask session, and lands on /login', async () => {
    const theirs = seal(SECRET, payloadOf({ kind: 'admin', token: 'their.bearer' }))
    const attributes = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 9 } as const
    jar.set(MICROTASK_COOKIE, { name: MICROTASK_COOKIE, value: theirs, ...attributes })
    jar.set(ADMIN_COOKIE, { name: ADMIN_COOKIE, value: 'sealed', ...attributes })
    expect(await redirectOf(signOut())).toBe('/login')
    expect(jar.get(ADMIN_COOKIE)).toMatchObject({ value: '', maxAge: 0 })
    expect(jar.get(MICROTASK_COOKIE)?.value).toBe(theirs)
  })

  it('makes no API call, because there is deliberately no logout route (ADR 0032)', async () => {
    await redirectOf(signOut())
    expect(loginWith).not.toHaveBeenCalled()
  })
})
