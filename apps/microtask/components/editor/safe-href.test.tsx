import { describe, expect, it } from 'vitest'
import { SAFE_HREF_SCHEMES } from '@repo/contracts'
import { normalizeHref } from './safe-href'

const TAB = '\u0009'
const LF = '\u000a'
const CR = '\u000d'
const NUL = '\u0000'
const NEL = '\u0085'
const DEL = '\u007f'
const PAD = '\u0080'
const APC = '\u009f'

describe('normalizeHref against the schemes a document may carry', () => {
  it('passes each scheme the contracts allow through untouched', () => {
    expect(normalizeHref('http://example.com/a')).toBe('http://example.com/a')
    expect(normalizeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(normalizeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com')
    expect(normalizeHref('tel:+441234567890')).toBe('tel:+441234567890')
  })

  it('accepts a safe scheme however it is cased', () => {
    expect(normalizeHref('HTTPS://example.com')).toBe('HTTPS://example.com')
    expect(normalizeHref('MailTo:a@b.co')).toBe('MailTo:a@b.co')
  })

  it('covers every scheme the contracts declare, so a widened list cannot go untested', () => {
    for (const scheme of SAFE_HREF_SCHEMES) {
      expect(normalizeHref(`${scheme}:example`)).toBe(`${scheme}:example`)
    }
  })

  it('prepends https to a bare host, which is what the app being replaced did', () => {
    expect(normalizeHref('example.com')).toBe('https://example.com')
    expect(normalizeHref('www.example.com/path?q=1')).toBe('https://www.example.com/path?q=1')
  })
})

describe('normalizeHref refuses the hostile forms browsers normalise away', () => {
  it('refuses a plain javascript url', () => {
    expect(normalizeHref('javascript:alert(1)')).toBe(null)
  })

  it('refuses one hidden behind a leading space, tab, newline, return or NUL', () => {
    expect(normalizeHref(' javascript:alert(1)')).toBe(null)
    expect(normalizeHref(`${TAB}javascript:alert(1)`)).toBe(null)
    expect(normalizeHref(`${LF}javascript:alert(1)`)).toBe(null)
    expect(normalizeHref(`${CR}javascript:alert(1)`)).toBe(null)
    expect(normalizeHref(`${NUL}javascript:alert(1)`)).toBe(null)
  })

  it('refuses one split by a tab, newline, return or NUL inside the scheme', () => {
    expect(normalizeHref(`java${TAB}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${LF}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${CR}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${NUL}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`javascript${TAB}:alert(1)`)).toBe(null)
  })

  it('refuses one split by a C1 control byte, which a C0-only filter would let through', () => {
    expect(normalizeHref(`java${NEL}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${DEL}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${PAD}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`java${APC}script:alert(1)`)).toBe(null)
    expect(normalizeHref(`${APC}javascript:alert(1)`)).toBe(null)
  })

  it('refuses however the scheme is cased', () => {
    expect(normalizeHref('JaVaScRiPt:alert(1)')).toBe(null)
    expect(normalizeHref('JAVASCRIPT:alert(1)')).toBe(null)
  })

  it('refuses every other scheme rather than allowing what is not javascript', () => {
    expect(normalizeHref('data:text/html;base64,PHNjcmlwdD4=')).toBe(null)
    expect(normalizeHref('vbscript:msgbox(1)')).toBe(null)
    expect(normalizeHref('file:///etc/passwd')).toBe(null)
    expect(normalizeHref('blob:https://example.com/abc')).toBe(null)
    expect(normalizeHref('ftp://example.com')).toBe(null)
  })

  it('refuses a safe scheme carrying an interior stripped character, rather than rewriting it', () => {
    expect(normalizeHref(`https://exa${TAB}mple.com`)).toBe(null)
    expect(normalizeHref(`https://example.com/a${NUL}b`)).toBe(null)
    expect(normalizeHref('https://example.com/a b')).toBe(null)
  })

  it('never reads a percent-encoded tab as part of a scheme, since no browser decodes it', () => {
    expect(normalizeHref('%09javascript:alert(1)')).toBe('https://%09javascript:alert(1)')
  })
})

describe('normalizeHref at its edges', () => {
  it('refuses nothing at all, so "remove the link" stays the caller decision it is', () => {
    expect(normalizeHref('')).toBe(null)
    expect(normalizeHref('   ')).toBe(null)
    expect(normalizeHref(`${TAB}${LF} `)).toBe(null)
  })

  it('trims the characters a browser would trim from the ends before deciding', () => {
    expect(normalizeHref('  https://example.com  ')).toBe('https://example.com')
    expect(normalizeHref(`${LF}example.com${TAB}`)).toBe('https://example.com')
  })

  it('refuses a scheme-relative and a path-relative href by making them absolute', () => {
    expect(normalizeHref('//example.com')).toBe('https:////example.com')
    expect(normalizeHref('/somewhere')).toBe('https:///somewhere')
  })
})
