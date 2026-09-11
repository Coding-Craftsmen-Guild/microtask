import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { SERVICE_UNAVAILABLE, remedyFor, remedyForNoSession } from './problem'
import { LINK_UNAVAILABLE_PATH } from './routes'

const refusal = (code: string, status = 401): ApiError =>
  new ApiError({
    status,
    code,
    detail: `the API said ${code}`,
    instance: '/v1/microtask/projects',
  })

const CREDENTIAL_CODES = ['unknown_service', 'no_principal', 'unknown_principal', 'unauthorized']

describe('remedyFor — the admin branch', () => {
  it.each(CREDENTIAL_CODES)('sends a %s 401 to /login carrying the deep link', (code) => {
    expect(remedyFor(refusal(code), 'admin', '/p/01HXYZ/t/01HABC')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fp%2F01HXYZ%2Ft%2F01HABC',
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
    expect(remedyFor(refusal(code), 'link', '/s/sometoken')).toEqual({
      kind: 'unavailable',
      location: LINK_UNAVAILABLE_PATH,
    })
  })

  it('keeps the terminal page inside the /s/ subtree ADR 0037 marks noindex', () => {
    expect(LINK_UNAVAILABLE_PATH.startsWith('/s/')).toBe(true)
  })

  it('produces no remedy naming /login for any 401 a link holder can provoke', () => {
    for (const code of CREDENTIAL_CODES) {
      for (const path of ['/s/tokena', '/s/tokena/t/01H', '/login', '/']) {
        const remedy = remedyFor(refusal(code), 'link', path)
        expect(remedy.kind).toBe('unavailable')
        expect(JSON.stringify(remedy)).not.toContain('login')
      }
    }
  })
})

describe('remedyFor — everything that is not a 401', () => {
  it.each([403, 404, 409, 413, 422, 500, 503])('shows a %s with the API detail', (status) => {
    expect(remedyFor(refusal('forbidden', status), 'admin', '/p/01H')).toEqual({
      kind: 'problem',
      status,
      detail: 'the API said forbidden',
    })
  })

  it('shows a 403 to a link holder rather than ending their session', () => {
    expect(remedyFor(refusal('forbidden', 403), 'link', '/s/tokena')).toMatchObject({
      kind: 'problem',
      status: 403,
    })
  })

  it.each([
    ['a network failure', new TypeError('fetch failed')],
    ['a schema failure', new Error('invalid response')],
    ['a thrown string', 'something went wrong'],
    ['nothing at all', undefined],
  ])('reports %s as unreachable rather than as a login', (_label, thrown) => {
    expect(remedyFor(thrown, 'admin', '/p/01H')).toEqual({
      kind: 'problem',
      status: 0,
      detail: SERVICE_UNAVAILABLE,
    })
  })
})

describe('remedyForNoSession', () => {
  it('sends an admin with no cookie to /login carrying the deep link', () => {
    expect(remedyForNoSession('admin', '/p/01HXYZ')).toEqual({
      kind: 'login',
      location: '/login?next=%2Fp%2F01HXYZ',
    })
  })

  it('sends a link holder with no cookie to the terminal page', () => {
    expect(remedyForNoSession('link', '/s/tokena')).toEqual({
      kind: 'unavailable',
      location: LINK_UNAVAILABLE_PATH,
    })
  })
})
