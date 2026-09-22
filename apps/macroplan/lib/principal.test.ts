import { describe, expect, it } from 'vitest'
import * as principal from './principal'
import { ADMIN_COOKIE, adminFrom, payloadOf } from './principal'

describe('the one cookie', () => {
  it('names mp_admin, which is not Microtask mt_admin (ADR 0014)', () => {
    expect(ADMIN_COOKIE).toBe('mp_admin')
    expect(ADMIN_COOKIE).not.toBe('mt_admin')
  })

  it('exports no link principal and no second cookie, because this app has neither', () => {
    expect(Object.keys(principal).sort()).toEqual(['ADMIN_COOKIE', 'adminFrom', 'payloadOf'])
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
