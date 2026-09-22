import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { LOGIN_REFUSED, refusalFor } from './login'
import { SERVICE_UNAVAILABLE } from './problem'

describe('this app binds the shared refusal to its own product name', () => {
  it('says Microtask could not reach its API when the API cannot be reached', () => {
    expect(refusalFor(new TypeError('fetch failed'))).toEqual({ message: SERVICE_UNAVAILABLE })
    expect(SERVICE_UNAVAILABLE).toContain('Microtask')
  })

  it('still answers every client-side refusal with the one non-committal sentence', () => {
    const unauthorized = new ApiError({
      status: 401,
      code: 'unauthorized',
      detail: 'the password is wrong',
      instance: '/v1/auth/login',
    })
    expect(refusalFor(unauthorized)).toEqual({ message: LOGIN_REFUSED })
  })

  it.each([500, 503])('tells a %i apart, because it is not a statement about a credential', (status) => {
    const broken = new ApiError({ status, code: 'internal_error', detail: 'boom', instance: '/x' })
    expect(refusalFor(broken)).toEqual({ message: SERVICE_UNAVAILABLE })
  })
})
