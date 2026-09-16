import { describe, expect, it } from 'vitest'
import { Invalid } from '@repo/kernel'
import { normaliseImportPath } from './harvested-path.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T1 = '01M25000000000000000000001'

describe('normaliseImportPath', () => {
  it('returns a clean relative path unchanged', () => {
    expect(normaliseImportPath(`volume/${P1}/tasks/${T1}.json`)).toBe(`volume/${P1}/tasks/${T1}.json`)
  })

  it('collapses a doubled separator and a "." segment, which name the same file', () => {
    expect(normaliseImportPath('volume//./a/project.json')).toBe('volume/a/project.json')
  })

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['an absolute path to a plausible manifest', '/data/microtask/projects/x/project.json'],
    ['a ".." segment', 'volume/../../etc/passwd'],
    ['a bare ".."', '..'],
    ['a trailing ".." segment', 'volume/a/..'],
    ['a drive letter with backslashes', String.raw`C:\data\project.json`],
    ['a drive letter with forward slashes', 'C:/data/project.json'],
    ['a lowercase drive letter', 'c:/data/project.json'],
    ['a backslash-separated path', String.raw`volume\a\project.json`],
    ['a UNC path', String.raw`\\server\share\project.json`],
    ['an empty path', ''],
    ['a blank path', '   '],
    ['a path naming a directory', 'volume/a/'],
    ['a path that is only "."', '.'],
    ['a path that is only "." segments', './././.'],
    ['a NUL byte, which every node:fs call turns into a 500', 'volume/a\u0000b/project.json'],
    ['a newline in a segment', 'volume/a\nb/project.json'],
    ['a segment with a trailing space, which win32 strips', 'volume/a /project.json'],
    ['a segment with a leading space', 'volume/ a/project.json'],
    ['a segment with a trailing dot, which win32 strips', 'volume/a./project.json'],
    ['a segment longer than any filesystem holds', `volume/${'x'.repeat(256)}/project.json`],
    ['a segment of 200 two-byte characters, which is 400 bytes', `volume/${'é'.repeat(200)}/a.json`],
    ['a path longer than the bound', `${'deep/'.repeat(300)}project.json`],
  ])('rejects %s rather than repairing it', (_label, hostile) => {
    expect(() => normaliseImportPath(hostile)).toThrow(Invalid)
  })

  it.each([
    ['a control character', 'volume/a\u0000b/project.json', 'control character'],
    ['whitespace around a segment', 'volume/a /project.json', 'whitespace'],
    ['a segment ending in a dot', 'volume/a./project.json', 'end with "."'],
    ['a segment longer than a filesystem holds', `volume/${'x'.repeat(256)}/a.json`, 'segment'],
    ['more characters than the whole bound allows', `${'deep/'.repeat(300)}a.json`, 'characters'],
    ['nothing but "." segments', './.', 'harvest root'],
  ])(
    'says which rule %s broke, one rule per refusal being what a 422 can act on',
    (_label, hostile, named) => {
      expect(() => normaliseImportPath(hostile)).toThrow(named)
    },
  )

  it('keeps a space inside a segment, which a real directory name is allowed to carry', () => {
    expect(normaliseImportPath('my drop/a b/project.json')).toBe('my drop/a b/project.json')
  })

  it('keeps a dot inside a segment, so only a trailing one is refused', () => {
    expect(normaliseImportPath('volume/a.b/project.json')).toBe('volume/a.b/project.json')
  })

  it('accepts a path far deeper than a real drop, so the bound refuses only the absurd', () => {
    const deep = `${'enclosing/'.repeat(20)}volume/a/project.json`
    expect(normaliseImportPath(deep)).toBe(deep)
  })

  it('rejects a path that is not a string at all', () => {
    expect(() => normaliseImportPath(42)).toThrow(Invalid)
  })
})
