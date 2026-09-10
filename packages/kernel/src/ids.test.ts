import { describe, expect, it } from 'vitest'
import { isShareToken, isUlid, shareToken, ulid } from './ids.js'

describe('ulid', () => {
  it('produces a 26-character Crockford base32 id', () => {
    expect(ulid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('sorts lexicographically by the time it was given', () => {
    const earlier = ulid(1_000_000_000_000)
    const later = ulid(2_000_000_000_000)
    expect(earlier < later).toBe(true)
  })

  it('does not collide across many calls at the same instant', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => ulid(1_700_000_000_000)))
    expect(ids.size).toBe(1000)
  })
})

describe('isUlid', () => {
  it.each([
    ['a generated id', ulid(), true],
    ['lowercase', 'abcdefghjkmnpqrstvwxyz0123', false],
    ['too short', 'ABC', false],
    ['ambiguous letters I L O U', 'IIIIIIIIIIIIIIIIIIIIIIIIII', false],
    ['a traversal attempt', '../../etc/passwd', false],
    ['a number', 26, false],
    ['undefined', undefined, false],
  ])('rejects or accepts %s', (_label, value, expected) => {
    expect(isUlid(value)).toBe(expected)
  })
})

describe('shareToken', () => {
  it('produces a url-safe token this app recognises', () => {
    const token = shareToken()
    expect(isShareToken(token)).toBe(true)
    expect(token).not.toContain('/')
    expect(token).not.toContain('+')
    expect(token).not.toContain('=')
  })

  it('rejects a token carrying path separators', () => {
    expect(isShareToken('../../secret')).toBe(false)
  })
})
