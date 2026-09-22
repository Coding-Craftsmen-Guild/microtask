import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { adminRemedyFor, adminRemedyForNoSession, type AdminCopy } from './admin-remedy'

const COPY: AdminCopy = {
  unavailable: 'Macroplan could not reach its API. Try again in a moment.',
  refusals: {
    unauthorised: 'u',
    forbidden: 'f',
    missing: 'm',
    conflict: 'c',
    tooLarge: 't',
    invalid: 'i',
    busy: 'b',
    broken: 'x',
  },
}

const refusal = (code: string, status = 401): ApiError =>
  new ApiError({ status, code, detail: `the API said ${code}`, instance: '/v1/macroplan/plans' })

const CREDENTIAL_CODES = ['unknown_service', 'no_principal', 'unknown_principal', 'unauthorized']

describe('adminRemedyFor', () => {
  it.each(CREDENTIAL_CODES)('sends a %s 401 to /login carrying the deep link', (code) => {
    expect(adminRemedyFor(refusal(code), '/plans/01HXYZ', COPY)).toEqual({
      kind: 'login',
      location: '/login?next=%2Fplans%2F01HXYZ',
    })
  })

  it('never carries a hostile pathname into the login URL', () => {
    expect(adminRemedyFor(refusal('no_principal'), '//evil.example', COPY)).toEqual({
      kind: 'login',
      location: '/login',
    })
  })

  it.each([
    [403, 'f'],
    [404, 'm'],
    [409, 'c'],
    [413, 't'],
    [422, 'i'],
    [500, 'x'],
  ])('shows the surface’s own sentence for a %i, never the API’s detail', (status, expected) => {
    const remedy = adminRemedyFor(refusal('whatever', status), '/plans', COPY)
    expect(remedy).toEqual({ kind: 'problem', status, detail: expected })
    expect(JSON.stringify(remedy)).not.toContain('the API said')
  })

  it('reports an unreachable API as a problem with status 0, never as a login', () => {
    expect(adminRemedyFor(new TypeError('fetch failed'), '/plans', COPY)).toEqual({
      kind: 'problem',
      status: 0,
      detail: COPY.unavailable,
    })
  })
})

describe('adminRemedyForNoSession', () => {
  it('sends a browser with no admin cookie to /login, keeping where it was going', () => {
    expect(adminRemedyForNoSession('/plans/01HXYZ')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fplans%2F01HXYZ',
    })
  })
})
