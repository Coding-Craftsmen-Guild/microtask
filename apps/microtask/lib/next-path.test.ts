import { describe, expect, it } from 'vitest'
import { MAX_NEXT_LENGTH, loginPathFor, safeNextPath } from './next-path'

const TAB = '\u0009'
const NEWLINE = '\u000a'
const RETURN = '\u000d'
const NUL = '\u0000'
const DEL = '\u007f'

describe('safeNextPath — hostile input', () => {
  it.each([
    ['an absolute https URL', 'https://evil.example/'],
    ['an absolute http URL', 'http://evil.example/'],
    ['an absolute URL with credentials', 'https://user:pw@evil.example/'],
    ['a protocol-relative host', '//evil.example/'],
    ['a protocol-relative host with three slashes', '///evil.example'],
    ['a backslash-prefixed host', '\\\\evil.example'],
    ['a single backslash prefix', '\\evil.example'],
    ['slash then backslash', '/\\evil.example'],
    ['slash backslash slash', '/\\/evil.example'],
    ['a javascript scheme', 'javascript:alert(1)'],
    ['a javascript scheme in mixed case', 'JaVaScRiPt:alert(1)'],
    [`a javascript scheme split by a tab`, `java${TAB}script:alert(1)`],
    ['a data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['a mailto scheme', 'mailto:someone@evil.example'],
    ['a bare hostname', 'evil.example'],
    ['a relative path with no leading slash', 'p/01H/t/01H'],
    ['a leading space before the slash', ' /p/01H'],
    [`a leading tab before the slash`, `${TAB}/p/01H`],
    [`a leading newline before the slash`, `${NEWLINE}/p/01H`],
    [`an embedded tab a browser would strip`, `/${TAB}/evil.example`],
    [`an embedded newline a browser would strip`, `/${NEWLINE}/evil.example`],
    [`an embedded carriage return`, `/${RETURN}/evil.example`],
    [`an embedded NUL`, `/p/01H${NUL}`],
    [`an embedded DEL`, `/p/01H${DEL}`],
    ['an embedded space', '/p/01 H'],
    ['the empty string', ''],
    ['a value longer than the cap', `/${'a'.repeat(MAX_NEXT_LENGTH)}`],
    ['undefined', undefined],
    ['null', null],
  ])('sends %s to /', (_label, value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('never returns a value another origin could be read out of', () => {
    const attempts = [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      `/${TAB}//evil.example`,
    ]
    for (const attempt of attempts) {
      expect(new URL(safeNextPath(attempt), 'http://app.invalid').origin).toBe('http://app.invalid')
    }
  })
})

describe('safeNextPath — paths it honours', () => {
  it.each([
    ['/', '/'],
    ['/login', '/login'],
    ['/p/01HXYZ', '/p/01HXYZ'],
    ['/p/01HXYZ/t/01HABC', '/p/01HXYZ/t/01HABC'],
    ['/p/01HXYZ/t/01HABC?tab=01HDEF', '/p/01HXYZ/t/01HABC?tab=01HDEF'],
    ['/p/01HXYZ#notes', '/p/01HXYZ#notes'],
    ['/p/01HXYZ?a=1&b=2#f', '/p/01HXYZ?a=1&b=2#f'],
    ['/p/%C3%A9', '/p/%C3%A9'],
  ])('keeps %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected)
  })

  it('accepts a value at exactly the cap, so the bound is not off by one', () => {
    const atCap = `/${'a'.repeat(MAX_NEXT_LENGTH - 1)}`
    expect(atCap.length).toBe(MAX_NEXT_LENGTH)
    expect(safeNextPath(atCap)).toBe(atCap)
  })
})

describe('loginPathFor', () => {
  it('carries the deep link the admin was going to', () => {
    expect(loginPathFor('/p/01HXYZ/t/01HABC?tab=01HDEF')).toBe(
      '/login?next=%2Fp%2F01HXYZ%2Ft%2F01HABC%3Ftab%3D01HDEF',
    )
  })

  it('omits the parameter entirely for the root', () => {
    expect(loginPathFor('/')).toBe('/login')
  })

  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', ''])(
    'never carries %s forward',
    (hostile) => {
      expect(loginPathFor(hostile)).toBe('/login')
    },
  )
})
