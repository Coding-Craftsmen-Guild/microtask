import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { SERVICE_UNAVAILABLE, remedyFor, remedyForNoSession } from './problem'
import { ACTION_REFUSALS, plainRefusal } from './refusal'

const refusal = (code: string, status = 401): ApiError =>
  new ApiError({ status, code, detail: `the API said ${code}`, instance: '/v1/macroplan/plans' })

describe('remedyFor — one audience, so a 401 is always a sign-in', () => {
  it.each(['unknown_service', 'no_principal', 'unknown_principal', 'unauthorized'])(
    'sends a %s 401 to /login carrying the deep link',
    (code) => {
      expect(remedyFor(refusal(code), '/plans/01HXYZ')).toEqual({
        kind: 'login',
        location: '/login?next=%2Fplans%2F01HXYZ',
      })
    },
  )

  it('never carries a hostile pathname into the login URL', () => {
    expect(remedyFor(refusal('no_principal'), '//evil.example')).toEqual({
      kind: 'login',
      location: '/login',
    })
  })

  it.each([403, 404, 409, 413, 422, 500])('shows this surface own sentence for a %i', (status) => {
    const remedy = remedyFor(refusal('whatever', status), '/plans')
    expect(remedy).toEqual({ kind: 'problem', status, detail: plainRefusal(status, ACTION_REFUSALS) })
    expect(JSON.stringify(remedy)).not.toContain('the API said')
  })

  it('reports an unreachable API as a problem, never as a login, so an outage is not a loop', () => {
    expect(remedyFor(new TypeError('fetch failed'), '/plans')).toEqual({
      kind: 'problem',
      status: 0,
      detail: SERVICE_UNAVAILABLE,
    })
  })

  it('produces no unavailable remedy, because this app has no share-link surface', () => {
    const kinds = [403, 404, 500, 401].map((status) => remedyFor(refusal('x', status), '/plans').kind)
    expect([...new Set(kinds)].sort()).toEqual(['login', 'problem'])
  })
})

describe('remedyForNoSession', () => {
  it('sends a browser with no mp_admin to /login, keeping where it was going', () => {
    expect(remedyForNoSession('/plans/01HXYZ')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fplans%2F01HXYZ',
    })
  })
})
