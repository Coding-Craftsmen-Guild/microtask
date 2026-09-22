import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { assertWithin, cleanDescription } from './limits.js'

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const NUL = String.fromCharCode(0)
const ESC = String.fromCharCode(0x1b)
const DEL = String.fromCharCode(0x7f)
const EMOJI = String.fromCodePoint(0x1f600)

describe('cleanDescription', () => {
  it('leaves an 8192-byte ASCII string exactly at the cap unchanged', () => {
    const input = 'a'.repeat(8192)
    const cleaned = cleanDescription(input)
    expect(cleaned).toBe(input)
    expect(encoder.encode(cleaned)).toHaveLength(8192)
  })

  it('truncates 4097 four-byte emoji to a whole number of code points under the cap', () => {
    const input = EMOJI.repeat(4097)
    const cleaned = cleanDescription(input)
    const bytes = encoder.encode(cleaned)
    expect(bytes.length).toBe(8192)
    expect([...cleaned]).toHaveLength(2048)
    expect(decoder.decode(bytes)).toBe(cleaned)
  })

  it('normalises CRLF and lone CR to LF', () => {
    expect(cleanDescription('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('strips NUL, ESC and DEL but keeps newline and tab', () => {
    const input = `a${NUL}b${ESC}c${DEL}d\ne\tf`
    expect(cleanDescription(input)).toBe('abcd\ne\tf')
  })

  it('returns an empty string for a non-string value', () => {
    expect(cleanDescription(undefined)).toBe('')
  })
})

describe('assertWithin', () => {
  it('permits the count one below the cap', () => {
    expect(() => assertWithin('itemsPerPlan', 1_999)).not.toThrow()
  })

  it('rejects the count at the cap, because one more is being added', () => {
    expect(() => assertWithin('itemsPerPlan', 2_000)).toThrow(Invalid)
    expect(() => assertWithin('itemsPerPlan', 2_000)).toThrow('2000')
  })
})
