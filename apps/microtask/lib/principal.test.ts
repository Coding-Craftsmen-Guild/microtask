import { describe, expect, it } from 'vitest'
import * as principal from './principal'
import { ADMIN_COOKIE, adminFrom, linkPrincipal, payloadOf } from './principal'

describe('the one cookie', () => {
  it('names mt_admin, the only cookie this app seals', () => {
    expect(ADMIN_COOKIE).toBe('mt_admin')
  })

  it('exports no link cookie, no link lifetime and no link cookie reader, because none exists (ADR 0040)', () => {
    expect(Object.keys(principal).sort()).toEqual(['ADMIN_COOKIE', 'adminFrom', 'linkPrincipal', 'payloadOf'])
  })
})

describe('adminFrom', () => {
  it('round-trips an admin principal', () => {
    const admin = { kind: 'admin', token: 'admin.123.sig' } as const
    expect(adminFrom(payloadOf(admin))).toEqual(admin)
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
  })
})

describe('linkPrincipal — the URL segment is the whole credential', () => {
  it.each([
    ['the shortest token the API mints', 'a'.repeat(16)],
    ['the longest', 'Z'.repeat(64)],
    ['every character a token may hold', 'AZaz09_-AZaz09_-'],
  ])('reads %s as a link principal', (_label, token) => {
    expect(linkPrincipal(token)).toEqual({ kind: 'link', token })
  })

  it.each([
    ['an empty segment', ''],
    ['fifteen characters', 'a'.repeat(15)],
    ['sixty-five characters', 'a'.repeat(65)],
    ['the terminal page’s own name', 'unavailable'],
    ['a space', `${'a'.repeat(16)} `],
    ['a newline, which would split the Authorization header', `${'a'.repeat(16)}\n`],
    ['a slash', `${'a'.repeat(8)}/${'a'.repeat(8)}`],
    ['a dot segment', '..'.repeat(8)],
    ['a non-ASCII letter', `${'a'.repeat(15)}é`],
  ])('refuses %s before any request is built', (_label, token) => {
    expect(linkPrincipal(token)).toBeNull()
  })
})
