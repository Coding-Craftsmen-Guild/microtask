import { createHash, createHmac } from 'node:crypto'
import { Invalid, type Clock } from '@repo/kernel'
import { describe, expect, it } from 'vitest'
import { AdminVerifier } from './admin-verifier.js'

const SECRET = 'session-secret-of-at-least-32-chars!'
const OTHER_SECRET = 'a-completely-different-secret-value!!'
const PASSWORD = 'correct horse battery staple'
const START = '2026-09-11T12:00:00.000Z'

const movingClock = (): Clock & { advance: (seconds: number) => void } => {
  let at = Date.parse(START)
  return {
    now: () => new Date(at).toISOString(),
    advance: (seconds: number) => {
      at += seconds * 1000
    },
  }
}

const build = (
  clock: Clock,
  overrides: { secret?: string; ttl?: number; password?: string } = {},
): AdminVerifier =>
  new AdminVerifier({
    config: {
      sessionSecret: overrides.secret ?? SECRET,
      adminTokenTtlSeconds: overrides.ttl ?? 3600,
      adminPassword: overrides.password ?? PASSWORD,
    },
    clock,
  })

describe('AdminVerifier.checkPassword', () => {
  it('accepts the configured password', () => {
    expect(build(movingClock()).checkPassword(PASSWORD)).toBe(true)
  })

  it('rejects a wrong password of the same length', () => {
    const wrong = 'correct horse battery stapel'
    expect(wrong).toHaveLength(PASSWORD.length)
    expect(build(movingClock()).checkPassword(wrong)).toBe(false)
  })

  it('rejects a candidate of a different length without throwing, because it hashes both sides first', () => {
    const verifier = build(movingClock())
    expect(verifier.checkPassword('')).toBe(false)
    expect(verifier.checkPassword('x')).toBe(false)
    expect(verifier.checkPassword(`${PASSWORD} and more`)).toBe(false)
  })

  it('rejects the legacy session cookie value, which was the password hash itself', () => {
    const legacy = createHash('sha256').update(`ccg:${PASSWORD}`).digest('hex')
    expect(build(movingClock()).checkPassword(legacy)).toBe(false)
  })
})

describe('AdminVerifier.issue', () => {
  it('mints a token its own verifier accepts', () => {
    const verifier = build(movingClock())
    expect(verifier.verify(verifier.issue().token)).toBe(true)
  })

  it('reports when the token expires, so a login response can say how long it has', () => {
    const minted = build(movingClock(), { ttl: 900 }).issue()
    expect(minted.expiresInSeconds).toBe(900)
    expect(minted.expiresAt).toBe('2026-09-11T12:15:00.000Z')
  })

  it('never embeds the password or its hash, which is the whole point of minting one', () => {
    const minted = build(movingClock()).issue()
    expect(minted.token).not.toContain(PASSWORD)
    expect(minted.token).not.toContain(createHash('sha256').update(`ccg:${PASSWORD}`).digest('hex'))
  })

  it('is not accepted as a password, so the two credentials are not interchangeable', () => {
    const verifier = build(movingClock())
    expect(verifier.checkPassword(verifier.issue().token)).toBe(false)
  })
})

describe('AdminVerifier.verify', () => {
  it('accepts a token one second before it expires', () => {
    const clock = movingClock()
    const verifier = build(clock, { ttl: 3600 })
    const token = verifier.issue().token
    clock.advance(3599)
    expect(verifier.verify(token)).toBe(true)
  })

  it('refuses a token one second after it expires, which is what legacy never did', () => {
    const clock = movingClock()
    const verifier = build(clock, { ttl: 3600 })
    const token = verifier.issue().token
    clock.advance(3601)
    expect(verifier.verify(token)).toBe(false)
  })

  it('refuses a token minted under a different signing secret, so rotating it ends every session', () => {
    const clock = movingClock()
    const token = build(clock, { secret: SECRET }).issue().token
    expect(build(clock, { secret: OTHER_SECRET }).verify(token)).toBe(false)
  })

  it('refuses a token whose expiry was edited to a later one, because the expiry is signed', () => {
    const clock = movingClock()
    const verifier = build(clock, { ttl: 60 })
    const [subject, expiresAt, signature] = verifier.issue().token.split('.')
    const stretched = `${subject}.${String(Number(expiresAt) + 86400)}.${signature}`
    expect(verifier.verify(stretched)).toBe(false)
  })

  it('refuses a token whose signature was edited', () => {
    const verifier = build(movingClock())
    const [subject, expiresAt, signature] = verifier.issue().token.split('.')
    const flipped = `${signature?.slice(0, -1) ?? ''}${signature?.endsWith('A') === true ? 'B' : 'A'}`
    expect(verifier.verify(`${subject}.${expiresAt}.${flipped}`)).toBe(false)
  })

  it('refuses a token claiming a subject this API does not mint', () => {
    const verifier = build(movingClock())
    const [, expiresAt, signature] = verifier.issue().token.split('.')
    expect(verifier.verify(`superadmin.${expiresAt}.${signature}`)).toBe(false)
  })

  const malformed = [
    ['the empty string', ''],
    ['a bare word', 'admin'],
    ['two segments only', 'admin.9999999999'],
    ['four segments', 'admin.9999999999.sig.extra'],
    ['a non-numeric expiry', 'admin.tomorrow.sig'],
    ['a negative expiry', 'admin.-1.sig'],
    ['a share token', 'shr_ptarmigan_wholeproject'],
    ['a signature of the wrong length', 'admin.9999999999.short'],
  ] as const

  for (const [label, token] of malformed) {
    it(`refuses ${label} without throwing`, () => {
      const verifier = build(movingClock())
      expect(() => verifier.verify(token)).not.toThrow()
      expect(verifier.verify(token)).toBe(false)
    })
  }

  it('fails closed when the clock does not report a parseable instant', () => {
    const verifier = build({ now: () => 'not a date' })
    expect(() => verifier.verify('admin.9999999999.sig')).not.toThrow()
    expect(verifier.verify('admin.9999999999.sig')).toBe(false)
  })

  it('refuses a correctly signed token claiming a subject other than admin', () => {
    const clock = movingClock()
    const verifier = build(clock, { ttl: 3600 })
    const [, expiresAt] = verifier.issue().token.split('.')
    const payload = `superadmin.${expiresAt ?? ''}`
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')
    expect(verifier.verify(`${payload}.${signature}`)).toBe(false)
  })

  it('refuses a correctly signed token whose expiry is exponential rather than a plain decimal', () => {
    const verifier = build(movingClock(), { ttl: 3600 })
    const payload = 'admin.1e99'
    const signature = createHmac('sha256', SECRET).update(payload).digest('base64url')
    expect(Number('1e99')).toBeGreaterThan(Date.parse(START) / 1000)
    expect(verifier.verify(`${payload}.${signature}`)).toBe(false)
  })

  it('refuses a correctly signed token with a fourth segment appended', () => {
    const verifier = build(movingClock(), { ttl: 3600 })
    expect(verifier.verify(`${verifier.issue().token}.extra`)).toBe(false)
  })
})

describe('AdminVerifier and an unusable clock', () => {
  it('refuses to mint a token it cannot date, rather than minting one nobody can check', () => {
    expect(() => build({ now: () => 'not a date' }).issue()).toThrow(Invalid)
  })
})
