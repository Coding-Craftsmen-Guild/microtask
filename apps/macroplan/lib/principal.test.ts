import { describe, expect, it } from 'vitest'
import * as principal from './principal'
import { ADMIN_COOKIE, adminFrom, linkPrincipal, payloadOf } from './principal'

const TOKEN = 'a_plan_seats_token1'

describe('the one cookie', () => {
  it('names mp_admin, which is not Microtask mt_admin (ADR 0014)', () => {
    expect(ADMIN_COOKIE).toBe('mp_admin')
    expect(ADMIN_COOKIE).not.toBe('mt_admin')
  })

  it('is the only cookie name this module spells, the link half holding its credential in the URL', () => {
    expect(Object.keys(principal).sort()).toEqual([
      'ADMIN_COOKIE',
      'adminFrom',
      'linkPrincipal',
      'payloadOf',
    ])
  })
})

describe('the admin half is re-exported from @repo/app-session, not re-implemented', () => {
  it('round-trips an admin principal through the shared seal payload', () => {
    const admin = { kind: 'admin', token: 'admin.123.sig' } as const
    expect(adminFrom(payloadOf(admin))).toEqual(admin)
  })

  it('refuses a payload of any other kind offered as an admin principal', () => {
    expect(adminFrom(payloadOf({ kind: 'link', token: 'a' }))).toBeNull()
  })
})

describe('linkPrincipal, the credential a /s/<token> URL carries and nothing else', () => {
  it('reads a share-token-shaped segment into a link principal', () => {
    expect(linkPrincipal(TOKEN)).toEqual({ kind: 'link', token: TOKEN })
  })

  it.each([
    ['A'.repeat(16), 'the shortest token the schema admits'],
    ['A'.repeat(64), 'the longest token the schema admits'],
    ['aZ0_-aZ0_-aZ0_-a', 'every character class a token may hold'],
  ])('admits %j, %s', (token) => {
    expect(linkPrincipal(token)?.token).toBe(token)
  })

  it.each([
    ['', 'an empty segment'],
    ['unavailable', 'the terminal page own segment, which is eleven characters'],
    ['A'.repeat(15), 'one character short of the minimum'],
    ['A'.repeat(65), 'one character past the maximum'],
    ['a_plan_seats_token1.', 'a character no token may hold'],
    ['a_plan_seats_token1 ', 'a trailing space'],
  ])('refuses %j, %s', (segment) => {
    expect(linkPrincipal(segment)).toBeNull()
  })

  it('refuses a newline before anything builds a request, which would split the header (ADR 0040)', () => {
    expect(linkPrincipal(`${TOKEN}\nX-Injected: 1`)).toBeNull()
    expect(linkPrincipal(`${TOKEN}\n`)).toBeNull()
    expect(linkPrincipal(`\n${TOKEN}`)).toBeNull()
  })

  it('refuses a value a browser sent as something other than a string', () => {
    const hostile = { toString: () => TOKEN } as unknown as string
    expect(linkPrincipal(hostile)).toBeNull()
  })

  it('seals nothing: a link principal is not a payload this app could ever read back as admin', () => {
    const link = linkPrincipal(TOKEN)
    expect(link).not.toBeNull()
    expect(adminFrom(payloadOf(link as { kind: 'link'; token: string }))).toBeNull()
  })
})
