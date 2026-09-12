import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Conflict, Invalid } from '@repo/kernel'
import { manifestFile } from '../storage/paths.js'
import {
  duplicatePaths,
  groupImportFiles,
  MANIFEST_FILE_NAME,
  normaliseImportPath,
  type ImportFile,
} from './grouping.js'

const ROOT = path.resolve('/data')
const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240FB4GD6PF6V0PKZVF6FD9'
const T1 = '01M25000000000000000000001'
const T2 = '01M25000000000000000000002'
const T3 = '01M25000000000000000000003'

const at = (path: string): ImportFile => ({ path, json: { seen: path } })

const paths = (files: readonly ImportFile[]): readonly string[] => files.map((file) => file.path)

function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const next = random(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const swap = out[i] as T
    out[i] = out[j] as T
    out[j] = swap
  }
  return out
}

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

describe('groupImportFiles', () => {
  it('groups a manifest and its tasks/*.json into one v2 project directory', () => {
    const groups = groupImportFiles([
      at(`volume/${P1}/project.json`),
      at(`volume/${P1}/tasks/${T1}.json`),
      at(`volume/${P1}/tasks/${T2}.json`),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.path).toBe(`volume/${P1}`)
    expect(groups[0]?.manifest?.path).toBe(`volume/${P1}/project.json`)
    expect(paths(groups[0]?.taskFiles ?? [])).toEqual([
      `volume/${P1}/tasks/${T1}.json`,
      `volume/${P1}/tasks/${T2}.json`,
    ])
  })

  it('keeps each project directory its own group', () => {
    const groups = groupImportFiles([
      at(`volume/${P1}/project.json`),
      at(`volume/${P1}/tasks/${T1}.json`),
      at(`volume/${P2}/project.json`),
      at(`volume/${P2}/tasks/${T2}.json`),
      at(`volume/${P2}/tasks/${T3}.json`),
    ])
    expect(groups.map((group) => group.path)).toEqual([`volume/${P1}`, `volume/${P2}`])
    expect(groups.map((group) => group.taskFiles.length)).toEqual([1, 2])
  })

  it('gives a loose self-describing file a group of its own', () => {
    const groups = groupImportFiles([at('export.json')])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.path).toBe('export.json')
    expect(groups[0]?.file?.path).toBe('export.json')
    expect(groups[0]?.manifest).toBeNull()
  })

  it('does not absorb a loose file into a neighbouring project directory', () => {
    const groups = groupImportFiles([
      at(`volume/${P1}/project.json`),
      at(`volume/${P1}/notes.json`),
    ])
    expect(groups.map((group) => group.path)).toEqual([`volume/${P1}`, `volume/${P1}/notes.json`])
    expect(groups[1]?.file?.path).toBe(`volume/${P1}/notes.json`)
  })

  it('matches every recognised name case-sensitively, so one spelling cannot be read two ways', () => {
    const groups = groupImportFiles([
      at(`volume/${P1}/Project.json`),
      at(`volume/${P2}/project.json`),
      at(`volume/${P2}/tasks/${T1}.JSON`),
    ])
    expect(groups.map((group) => group.path)).toEqual([
      `volume/${P2}`,
      `volume/${P1}/Project.json`,
      `volume/${P2}/tasks/${T1}.JSON`,
    ])
    expect(groups[0]?.taskFiles).toEqual([])
  })

  it('reports an orphaned tasks directory against the directory missing the manifest', () => {
    const groups = groupImportFiles([at(`volume/${P1}/tasks/${T1}.json`)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.path).toBe(`volume/${P1}`)
    expect(groups[0]?.manifest).toBeNull()
    expect(paths(groups[0]?.taskFiles ?? [])).toEqual([`volume/${P1}/tasks/${T1}.json`])
  })

  it('groups a manifest dropped at the harvest root under "."', () => {
    const groups = groupImportFiles([at('project.json'), at(`tasks/${T1}.json`)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.path).toBe('.')
    expect(groups[0]?.taskFiles).toHaveLength(1)
  })

  it('refuses two files harvested for one path, since neither can be known to be meant', () => {
    expect(() =>
      groupImportFiles([at(`volume/${P1}/project.json`), at(`volume/${P1}/project.json`)]),
    ).toThrow(Conflict)
  })

  it('answers a collision with a different error from a hostile path, the remedies differing', () => {
    const twice = [at(`volume/${P1}/project.json`), at(`volume/${P1}/project.json`)]
    expect(() => groupImportFiles(twice)).not.toThrow(Invalid)
    expect(() => groupImportFiles([at('/etc/passwd')])).not.toThrow(Conflict)
  })

  it('refuses two paths that normalise to one', () => {
    expect(() =>
      groupImportFiles([at(`volume/${P1}/project.json`), at(`volume/./${P1}/project.json`)]),
    ).toThrow(Conflict)
  })

  it('re-runs normalisation on what it receives, so a hostile path never reaches a group', () => {
    expect(() => groupImportFiles([at('../../etc/passwd')])).toThrow(Invalid)
    expect(() => groupImportFiles([at(`volume/${P1}/project.json`), at('/etc/passwd')])).toThrow(Invalid)
  })

  it('orders by code unit, and every directory group before every loose file', () => {
    const cased = groupImportFiles([at('a.json'), at('B.json')])
    expect(cased.map((group) => group.path)).toEqual(['B.json', 'a.json'])
    const mixed = groupImportFiles([at('A.json'), at('z/project.json')])
    expect(mixed.map((group) => group.path)).toEqual(['z', 'A.json'])
  })

  it('groups the same way whatever order readdir or a drop handed the files over in', () => {
    const harvested = [
      at(`volume/${P1}/project.json`),
      at(`volume/${P1}/tasks/${T1}.json`),
      at(`volume/${P1}/tasks/${T2}.json`),
      at(`volume/${P1}/tasks/${T3}.json`),
      at(`volume/${P2}/project.json`),
      at(`volume/${P2}/tasks/${T1}.json`),
      at(`volume/${P2}/tasks/${T2}.json`),
      at(`orphan/${P2}/tasks/${T3}.json`),
      at('export.json'),
      at('legacy/one.json'),
      at('legacy/two.json'),
      at('project.json'),
    ]
    const expected = groupImportFiles(harvested)
    expect(expected.length).toBeGreaterThan(4)
    for (const seed of [1, 7, 42, 1234, 99999]) {
      expect(groupImportFiles(shuffled(harvested, seed))).toEqual(expected)
    }
  })
})

describe('duplicatePaths', () => {
  it('names every path more than one file claimed, so a zip can report its own entries', () => {
    const collided = duplicatePaths([
      at(`volume/${P1}/project.json`),
      at(`volume/./${P1}/project.json`),
      at('export.json'),
      at('export.json'),
      at('legacy.json'),
    ])
    expect(collided).toEqual([`volume/${P1}/project.json`, 'export.json'])
  })

  it('names a collided path once, however many files claimed it', () => {
    expect(duplicatePaths([at('a.json'), at('a.json'), at('a.json')])).toEqual(['a.json'])
  })

  it('finds none in a drop that has none, which is the case grouping proceeds on', () => {
    expect(duplicatePaths([at('a.json'), at(`volume/${P1}/project.json`)])).toEqual([])
  })

  it('refuses a hostile path rather than answering a question about it', () => {
    expect(() => duplicatePaths([at('../../etc/passwd')])).toThrow(Invalid)
  })
})

describe('MANIFEST_FILE_NAME', () => {
  it('names the file the path builder writes, so the two copies cannot drift apart', () => {
    expect(manifestFile(ROOT, 'microtask', P1)).toBe(
      path.join(ROOT, 'microtask', 'projects', P1, MANIFEST_FILE_NAME),
    )
  })
})
