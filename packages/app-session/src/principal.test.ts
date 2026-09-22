import { describe, expect, it } from 'vitest'
import * as principal from './principal'
import { adminFrom, payloadOf } from './principal'

describe('the shared half is the admin half and nothing else', () => {
  it('exports no cookie name, no link principal and no link reader (ADR 0014, ADR 0040)', () => {
    expect(Object.keys(principal).sort()).toEqual(['adminFrom', 'payloadOf'])
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

describe('payloadOf', () => {
  it('writes the two fields and nothing else, whatever the principal carries', () => {
    expect(payloadOf({ kind: 'admin', token: 'b' })).toBe('{"kind":"admin","token":"b"}')
  })
})
