import { describe, expect, it } from 'vitest'
import { ADMIN_COOKIE, LINK_COOKIE, LINK_MAX_AGE_SECONDS, adminFrom, linkFrom, payloadOf } from './principal'

describe('cookie names', () => {
  it('names the two disjoint cookies ADR 0032 requires', () => {
    expect([ADMIN_COOKIE, LINK_COOKIE]).toEqual(['mt_admin', 'mt_link'])
  })

  it('gives a share link thirty days, because a share token has no expiry', () => {
    expect(LINK_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60)
  })
})

describe('adminFrom and linkFrom', () => {
  it('round-trips an admin principal', () => {
    const principal = { kind: 'admin', token: 'admin.123.sig' } as const
    expect(adminFrom(payloadOf(principal))).toEqual(principal)
  })

  it('round-trips a link principal', () => {
    const principal = { kind: 'link', token: 'sharetoken' } as const
    expect(linkFrom(payloadOf(principal))).toEqual(principal)
  })

  it('refuses an admin payload offered as a link principal', () => {
    expect(linkFrom(payloadOf({ kind: 'admin', token: 'a' }))).toBeNull()
  })

  it('refuses a link payload offered as an admin principal', () => {
    expect(adminFrom(payloadOf({ kind: 'link', token: 'a' }))).toBeNull()
  })

  it.each([
    ['a payload that is not JSON', 'not json'],
    ['a JSON array', '[]'],
    ['a JSON null', 'null'],
    ['a JSON string', '"admin"'],
    ['an object with no kind', '{"token":"a"}'],
    ['an object with no token', '{"kind":"admin"}'],
    ['an object with an empty token', '{"kind":"admin","token":""}'],
    ['an object with a non-string token', '{"kind":"admin","token":7}'],
    ['an object with an unknown kind', '{"kind":"root","token":"a"}'],
  ])('refuses %s', (_label, raw) => {
    expect(adminFrom(raw)).toBeNull()
    expect(linkFrom(raw.replace('admin', 'link'))).toBeNull()
  })
})
