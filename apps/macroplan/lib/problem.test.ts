import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { SERVICE_UNAVAILABLE, remedyFor, remedyForNoSession } from './problem'
import { ACTION_REFUSALS, plainRefusal } from './refusal'
import { LINK_UNAVAILABLE_PATH } from './routes'

const refusal = (code: string, status = 401): ApiError =>
  new ApiError({ status, code, detail: `the API said ${code}`, instance: '/v1/macroplan/plans' })

const CREDENTIAL_CODES = ['unknown_service', 'no_principal', 'unknown_principal', 'unauthorized']

describe('remedyFor — the admin branch', () => {
  it.each(CREDENTIAL_CODES)('sends a %s 401 to /login carrying the deep link', (code) => {
    expect(remedyFor(refusal(code), 'admin', '/plans/01HXYZ')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fplans%2F01HXYZ',
    })
  })

  it('never carries a hostile pathname into the login URL', () => {
    expect(remedyFor(refusal('no_principal'), 'admin', '//evil.example')).toEqual({
      kind: 'login',
      location: '/login',
    })
  })
})

describe('remedyFor — the link branch', () => {
  it.each(CREDENTIAL_CODES)('sends a %s 401 to the terminal page, never to /login', (code) => {
    expect(remedyFor(refusal(code), 'link', '/s/a_plan_seats_token1')).toEqual({
      kind: 'unavailable',
      location: LINK_UNAVAILABLE_PATH,
    })
  })

  it('keeps the terminal page inside the /s/ subtree next.config.ts hardens (ADR 0040)', () => {
    expect(LINK_UNAVAILABLE_PATH.startsWith('/s/')).toBe(true)
  })

  it('produces no remedy naming /login for any 401 a plan seat can provoke', () => {
    for (const code of CREDENTIAL_CODES) {
      for (const path of ['/s/a_plan_seats_token1', '/s/a_plan_seats_token1/x', '/login', '/']) {
        const remedy = remedyFor(refusal(code), 'link', path)
        expect(remedy.kind).toBe('unavailable')
        expect(JSON.stringify(remedy)).not.toContain('login')
      }
    }
  })

  it('ignores the pathname entirely, there being nothing for a seat to come back to', () => {
    expect(remedyFor(refusal('no_principal'), 'link', '/plans/01HXYZ')).toEqual({
      kind: 'unavailable',
      location: LINK_UNAVAILABLE_PATH,
    })
  })
})

describe('remedyFor — everything that is not a 401', () => {
  it.each([403, 404, 409, 413, 422, 429, 500, 503])(
    'shows a %i in the admin surface own plain words, never the API sentence',
    (status) => {
      const remedy = remedyFor(refusal('forbidden', status), 'admin', '/plans/01H')
      expect(remedy).toEqual({
        kind: 'problem',
        status,
        detail: plainRefusal(status, ACTION_REFUSALS.admin),
      })
      expect(JSON.stringify(remedy)).not.toContain('the API said')
    },
  )

  it.each([403, 404, 409, 413, 422, 429, 500, 503])(
    'shows a %i in the link surface own plain words, never the API sentence',
    (status) => {
      const remedy = remedyFor(refusal('forbidden', status), 'link', '/s/a_plan_seats_token1')
      expect(remedy).toEqual({
        kind: 'problem',
        status,
        detail: plainRefusal(status, ACTION_REFUSALS.link),
      })
      expect(JSON.stringify(remedy)).not.toContain('the API said')
    },
  )

  it('shows a 403 to a plan seat rather than ending it, and never "Not permitted: plan:retime"', () => {
    const downgraded = new ApiError({
      status: 403,
      code: 'forbidden',
      detail: 'Not permitted: plan:retime',
      instance: '/v1/macroplan/plans/01H',
    })
    const remedy = remedyFor(downgraded, 'link', '/s/a_plan_seats_token1')
    expect(remedy).toEqual({ kind: 'problem', status: 403, detail: ACTION_REFUSALS.link.forbidden })
    expect(JSON.stringify(remedy)).not.toContain('Not permitted')
  })

  it.each([
    ['a network failure', new TypeError('fetch failed')],
    ['a schema failure', new Error('invalid response')],
    ['a thrown string', 'something went wrong'],
    ['nothing at all', undefined],
  ])('reports %s as unreachable on both surfaces, never as a login or a dead link', (_l, thrown) => {
    const problem = { kind: 'problem', status: 0, detail: SERVICE_UNAVAILABLE }
    expect(remedyFor(thrown, 'admin', '/plans/01H')).toEqual(problem)
    expect(remedyFor(thrown, 'link', '/s/a_plan_seats_token1')).toEqual(problem)
  })
})

describe('remedyForNoSession', () => {
  it('sends an admin with no mp_admin to /login, keeping where it was going', () => {
    expect(remedyForNoSession('admin', '/plans/01HXYZ')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fplans%2F01HXYZ',
    })
  })

  it('sends a segment that cannot be a share token to the terminal page, never to /login', () => {
    const remedy = remedyForNoSession('link', '/s/unavailable')
    expect(remedy).toEqual({ kind: 'unavailable', location: LINK_UNAVAILABLE_PATH })
    expect(JSON.stringify(remedy)).not.toContain('login')
  })
})
