import { ApiError } from '@repo/api-client'
import { describe, expect, it, vi } from 'vitest'
import {
  LOGIN_REFUSED,
  refusalFor as sessionRefusalFor,
  reportLoginRefusal,
  signInDestination,
  type SignInState,
} from './login'


const SERVICE_UNAVAILABLE = 'Macroplan could not reach its API. Try again in a moment.'

const refusalFor = (error: unknown): SignInState => sessionRefusalFor(error, SERVICE_UNAVAILABLE)

const unauthorized = (detail: string): ApiError =>
  new ApiError({ status: 401, code: 'unauthorized', detail, instance: '/v1/auth/login' })

describe('refusalFor — the login route must not become a password oracle', () => {
  it('answers a wrong password and an unknown service key with the same state', () => {
    const wrongPassword = unauthorized('The credentials presented were not accepted.')
    const unknownService = unauthorized('This request carried no recognised service key.')
    expect(refusalFor(wrongPassword)).toEqual(refusalFor(unknownService))
  })

  it('never forwards the API detail, so a future change there cannot leak through', () => {
    expect(refusalFor(unauthorized('the password is wrong')).message).toBe(LOGIN_REFUSED)
    expect(refusalFor(unauthorized('the password is wrong')).message).not.toContain('password is')
  })

  it('answers every 401 code identically', () => {
    const codes = ['unauthorized', 'unknown_service', 'no_principal', 'wrong_password']
    const states = codes.map((code) =>
      refusalFor(new ApiError({ status: 401, code, detail: code, instance: '/v1/auth/login' })),
    )
    for (const state of states) expect(state).toEqual({ message: LOGIN_REFUSED })
  })

  it('answers a 422 with the same refusal, so a malformed body is not a probe either', () => {
    const invalid = new ApiError({
      status: 422,
      code: 'invalid',
      detail: 'password must be at least 1 character',
      instance: '/v1/auth/login',
    })
    expect(refusalFor(invalid)).toEqual({ message: LOGIN_REFUSED })
  })

  it.each([500, 502, 503])('distinguishes a %s, which is not a statement about credentials', (status) => {
    const broken = new ApiError({ status, code: 'internal_error', detail: 'boom', instance: '/x' })
    expect(refusalFor(broken)).toEqual({ message: SERVICE_UNAVAILABLE })
  })

  it('reports an unreachable API rather than a bad password', () => {
    expect(refusalFor(new TypeError('fetch failed'))).toEqual({ message: SERVICE_UNAVAILABLE })
  })
})

describe('reportLoginRefusal — distinguishable in the logs', () => {
  it('writes one structured line naming the event and the status', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    reportLoginRefusal(unauthorized('nope'))
    expect(warn).toHaveBeenCalledTimes(1)
    const line: unknown = JSON.parse(String(warn.mock.calls[0]?.[0]))
    expect(line).toEqual({
      event: 'auth.login.refused',
      status: 401,
      code: 'unauthorized',
      instance: '/v1/auth/login',
    })
    warn.mockRestore()
  })

  it('records a non-ApiError failure without inventing a status', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    reportLoginRefusal(new TypeError('fetch failed'))
    const line: unknown = JSON.parse(String(warn.mock.calls[0]?.[0]))
    expect(line).toEqual({
      event: 'auth.login.refused',
      status: 0,
      code: 'unreachable',
      instance: null,
    })
    warn.mockRestore()
  })

  it('never puts the password anywhere near the log line', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    reportLoginRefusal(unauthorized('correct horse battery staple'))
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('correct horse')
    warn.mockRestore()
  })
})

describe('signInDestination', () => {
  it('honours a sanitised deep link', () => {
    expect(signInDestination('/p/01HXYZ/t/01HABC?tab=01HDEF')).toBe('/p/01HXYZ/t/01HABC?tab=01HDEF')
  })

  it.each([
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    undefined,
    null,
  ])('falls back to / for %s', (hostile) => {
    expect(signInDestination(hostile)).toBe('/')
  })

  it('never sends a freshly signed-in admin back to the password form they just submitted', () => {
    expect(signInDestination('/login')).toBe('/')
    expect(signInDestination('/login?next=%2F')).toBe('/')
    expect(signInDestination('/login/anything')).toBe('/')
  })

  it('still allows a path that merely begins with the same letters', () => {
    expect(signInDestination('/loginsomething')).toBe('/loginsomething')
  })
})
