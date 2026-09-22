import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { LOGIN_REFUSED, refusalFor, signInDestination } from './login'
import { SERVICE_UNAVAILABLE } from './problem'

// The exhaustive sweep of hostile shapes — the backslash family, control characters, dot
// segments — lives with safeNextPath in @repo/app-session. These few prove this app is wired
// to it, rather than re-proving it here.
const HOSTILE = ['https://evil.example/', '//evil.example', 'javascript:alert(1)', '']

describe('this app binds the shared refusal to its own product name', () => {
  it('says Macroplan could not reach its API when the API cannot be reached', () => {
    expect(refusalFor(new TypeError('fetch failed'))).toEqual({ message: SERVICE_UNAVAILABLE })
    expect(SERVICE_UNAVAILABLE).toContain('Macroplan')
    expect(SERVICE_UNAVAILABLE).not.toContain('Microtask')
  })

  it('answers every client-side refusal with the one non-committal sentence', () => {
    const unauthorized = new ApiError({
      status: 401,
      code: 'unauthorized',
      detail: 'the password is wrong',
      instance: '/v1/auth/login',
    })
    expect(refusalFor(unauthorized)).toEqual({ message: LOGIN_REFUSED })
    expect(refusalFor(unauthorized).message).not.toContain('password is')
  })

  it.each([500, 503])('tells a %i apart, because it is not a statement about a credential', (status) => {
    const broken = new ApiError({ status, code: 'internal_error', detail: 'boom', instance: '/x' })
    expect(refusalFor(broken)).toEqual({ message: SERVICE_UNAVAILABLE })
  })
})

describe('signInDestination', () => {
  it('honours a sanitised deep link', () => {
    expect(signInDestination('/plans/01HXYZ?view=quarter')).toBe('/plans/01HXYZ?view=quarter')
  })

  it.each(HOSTILE)('falls back to / for %j', (hostile) => {
    expect(signInDestination(hostile)).toBe('/')
  })

  it('falls back to / for an absent next', () => {
    expect(signInDestination(null)).toBe('/')
    expect(signInDestination(undefined)).toBe('/')
  })

  it('never sends a freshly signed-in admin back to the form they just submitted', () => {
    expect(signInDestination('/login')).toBe('/')
    expect(signInDestination('/login/anything')).toBe('/')
  })
})
