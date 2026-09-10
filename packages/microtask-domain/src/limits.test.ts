import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { assertWithin, cleanName, LIMITS } from './limits.js'

describe('cleanName', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanName('  Go   live  ')).toBe('Go live')
  })

  it('collapses newlines and tabs too', () => {
    expect(cleanName('Go\n\tlive')).toBe('Go live')
  })

  it('truncates at the name cap', () => {
    expect(cleanName('x'.repeat(200))).toHaveLength(LIMITS.nameLength)
  })

  it('truncates by code point, so an astral character is never cut in half', () => {
    const emoji = '\u{1F600}'
    const name = cleanName('x'.repeat(LIMITS.nameLength - 1) + emoji)
    expect([...name]).toHaveLength(LIMITS.nameLength)
    expect(name.endsWith(emoji)).toBe(true)
  })

  it('leaves no trailing space when the cut lands on one', () => {
    const long = 'a'.repeat(LIMITS.nameLength - 1) + ' b'
    expect(cleanName(long)).toBe('a'.repeat(LIMITS.nameLength - 1))
  })

  it('rejects an empty name when no fallback is given', () => {
    expect(() => cleanName('   ')).toThrow(Invalid)
  })

  it('returns the fallback for an empty name when one is given', () => {
    expect(cleanName('   ', '')).toBe('')
  })

  it('rejects a non-string', () => {
    expect(() => cleanName(undefined)).toThrow(Invalid)
  })
})

describe('assertWithin', () => {
  it('permits a count below the cap', () => {
    expect(() => assertWithin('tabsPerTask', LIMITS.tabsPerTask - 1)).not.toThrow()
  })

  it('rejects a count at the cap, because one more is being added', () => {
    expect(() => assertWithin('tabsPerTask', LIMITS.tabsPerTask)).toThrow(Invalid)
  })

  it('names what was exceeded, so the API can report it', () => {
    expect(() => assertWithin('shareLinksPerProject', LIMITS.shareLinksPerProject)).toThrow(/share/i)
  })

  it('carries a cap for every limit it knows', () => {
    for (const [key, cap] of Object.entries(LIMITS)) {
      expect(typeof cap, key).toBe('number')
      expect(cap, key).toBeGreaterThan(0)
    }
  })
})
