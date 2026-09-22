import { describe, expect, it } from 'vitest'
import * as principal from './principal'
import { ADMIN_COOKIE, adminFrom, linkPrincipal, payloadOf } from './principal'

describe('the one cookie', () => {
  it('names mt_admin, the only cookie this app seals, and not Macroplan’s mp_admin', () => {
    expect(ADMIN_COOKIE).toBe('mt_admin')
    expect(ADMIN_COOKIE).not.toBe('mp_admin')
  })

  it('exports no link cookie, no link lifetime and no link cookie reader, because none exists (ADR 0040)', () => {
    expect(Object.keys(principal).sort()).toEqual(['ADMIN_COOKIE', 'adminFrom', 'linkPrincipal', 'payloadOf'])
  })
})

describe('the admin half is re-exported from @repo/app-session, not re-implemented', () => {
  it('round-trips an admin principal through the shared seal payload', () => {
    const admin = { kind: 'admin', token: 'admin.123.sig' } as const
    expect(adminFrom(payloadOf(admin))).toEqual(admin)
  })

  it('still refuses a link payload offered as an admin principal', () => {
    expect(adminFrom(payloadOf({ kind: 'link', token: 'a' }))).toBeNull()
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
