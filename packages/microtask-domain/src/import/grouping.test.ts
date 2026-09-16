import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Conflict, Invalid } from '@repo/kernel'
import { manifestFile } from '../storage/paths.js'
import {
  collidingPaths,
  duplicatePaths,
  groupImportFiles,
  MANIFEST_FILE_NAME,
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
      `volume/${P1}/project.json`,
      `volume/./${P1}/project.json`,
      'export.json',
      'export.json',
      'legacy.json',
    ])
    expect(collided).toEqual([`volume/${P1}/project.json`, 'export.json'])
  })

  it('names a collided path once, however many files claimed it', () => {
    expect(duplicatePaths(['a.json', 'a.json', 'a.json'])).toEqual(['a.json'])
  })

  it('finds none in a drop that has none, which is the case grouping proceeds on', () => {
    expect(duplicatePaths(['a.json', `volume/${P1}/project.json`])).toEqual([])
  })

  it('refuses a hostile path rather than answering a question about it', () => {
    expect(() => duplicatePaths(['../../etc/passwd'])).toThrow(Invalid)
  })

  it('still refuses a drop harvested twice through grouping, which takes files', () => {
    expect(() => groupImportFiles([at('a.json'), at('a.json')])).toThrow(Conflict)
  })
})

describe('collidingPaths: the pair one path cannot be both ends of', () => {
  it('names the pair where one path is a file and the other is a file inside it', () => {
    expect(collidingPaths(['a', 'a/b'])).toEqual([{ file: 'a', inside: 'a/b' }])
  })

  it('names it whichever order the two arrived in, the answer being about the set', () => {
    expect(collidingPaths(['a/b', 'a'])).toEqual([{ file: 'a', inside: 'a/b' }])
  })

  it('reaches an ancestor that is not the immediate parent, which is the deeper drop', () => {
    expect(collidingPaths(['drop', 'drop/p/tasks/one.json'])).toEqual([
      { file: 'drop', inside: 'drop/p/tasks/one.json' },
    ])
  })

  it('names every ancestor of one path that is also staged, rather than only the nearest', () => {
    expect(collidingPaths(['a', 'a/b', 'a/b/c'])).toEqual([
      { file: 'a', inside: 'a/b' },
      { file: 'a', inside: 'a/b/c' },
      { file: 'a/b', inside: 'a/b/c' },
    ])
  })

  it('compares by segment and not by string prefix, so "ab" is not inside "a"', () => {
    expect(collidingPaths(['a', 'ab', 'a.json', 'a-b/c'])).toEqual([])
  })

  it('normalises first, so a "." segment cannot hide the pair from the prefix test', () => {
    expect(collidingPaths(['a', './a/b'])).toEqual([{ file: 'a', inside: 'a/b' }])
    expect(collidingPaths(['a', 'a//b'])).toEqual([{ file: 'a', inside: 'a/b' }])
  })

  it('is not the duplicate question: one path twice is no collision, and neither is a sibling', () => {
    expect(collidingPaths(['a', 'a'])).toEqual([])
    expect(collidingPaths([`${P1}/project.json`, `${P1}/tasks/${T1}.json`])).toEqual([])
    expect(duplicatePaths(['a', 'a'])).toEqual(['a'])
  })

  it('answers the same pair once however many times either path was listed', () => {
    expect(collidingPaths(['a', 'a/b', 'a', 'a/b'])).toEqual([{ file: 'a', inside: 'a/b' }])
  })

  it('comes back sorted, so it is order-independent the way grouping is', () => {
    const pairs = collidingPaths(['b/one', 'a/one', 'b', 'a'])
    expect(pairs).toEqual([
      { file: 'a', inside: 'a/one' },
      { file: 'b', inside: 'b/one' },
    ])
  })

  it('refuses a hostile path rather than answering a question about it', () => {
    expect(() => collidingPaths(['a', '../../etc/passwd'])).toThrow(Invalid)
  })

  it('finds nothing in the shape a real drop has, which is what makes the pairs above specific', () => {
    expect(
      collidingPaths([
        `volume/${P1}/project.json`,
        `volume/${P1}/tasks/${T1}.json`,
        `volume/${P2}/project.json`,
        'volume/legacy.json',
      ]),
    ).toEqual([])
  })
})

describe('MANIFEST_FILE_NAME', () => {
  it('names the file the path builder writes, so the two copies cannot drift apart', () => {
    expect(manifestFile(ROOT, 'microtask', P1)).toBe(
      path.join(ROOT, 'microtask', 'projects', P1, MANIFEST_FILE_NAME),
    )
  })
})
