import { LIMITS } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { cleanName } from './clean-name'

describe('cleanName stores a name the way the API will store it', () => {
  it('collapses every run of whitespace to one space and trims the ends', () => {
    expect(cleanName('  Auth \t\n  rewrite  ')).toBe('Auth rewrite')
  })

  it('cuts at the name limit in code points, not UTF-16 units, and trims what the cut exposes', () => {
    const long = `${'a'.repeat(LIMITS.nameLength - 1)} ${'b'.repeat(5)}`
    expect(cleanName(long)).toBe('a'.repeat(LIMITS.nameLength - 1))
    const emoji = String.fromCodePoint(0x1f680)
    expect([...cleanName(emoji.repeat(LIMITS.nameLength + 3)) as string]).toHaveLength(LIMITS.nameLength)
  })

  it('answers null for a name with nothing left in it, which the API refuses', () => {
    expect(cleanName(' \t ')).toBeNull()
    expect(cleanName('')).toBeNull()
  })
})
