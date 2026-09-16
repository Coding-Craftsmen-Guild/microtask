import { deflateRawSync } from 'node:zlib'
import { Conflict, Invalid } from '@repo/kernel'
import { manifest, marked, taskEntry, STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import {
  deflated,
  directory,
  encrypted,
  lying,
  stored,
  symlink,
  textFile,
  zipArchive,
  type ArchiveEntry,
} from '../../../testing/archives.js'
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_ARCHIVE_RATIO,
  expandArchive,
  type ArchiveExpansion,
} from './archive.js'

const P1 = marked('01P', 1)
const T1 = marked('01T', 1)

const ENCODER = new TextEncoder()

const zeros = (length: number): Uint8Array => new Uint8Array(length)

interface Run {
  readonly staged: { path: string; bytes: number }[]
  readonly checked: string[][]
  readonly run: () => Promise<ArchiveExpansion>
}

const expanding = (archive: Uint8Array, check: (paths: readonly string[]) => void = () => undefined): Run => {
  const staged: { path: string; bytes: number }[] = []
  const checked: string[][] = []
  return {
    staged,
    checked,
    run: () =>
      expandArchive(
        archive,
        (paths) => {
          checked.push([...paths])
          check(paths)
        },
        async (path, bytes) => {
          staged.push({ path, bytes: bytes.length })
        },
      ),
  }
}

const refused = async (archive: Uint8Array): Promise<Run & { detail: string }> => {
  const attempt = expanding(archive)
  const caught = await attempt.run().then(
    () => null,
    (err: unknown) => err,
  )
  expect(caught).toBeInstanceOf(Invalid)
  return { ...attempt, detail: caught instanceof Error ? caught.message : '' }
}

const decoded = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

describe('the entry rules, every one of them decided before a byte is staged (ADR 0020)', () => {
  it.each([
    ['a traversal', '../../etc/passwd'],
    ['a traversal below a directory', 'drop/../../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a drive letter', 'C:/Windows/system32/config'],
    ['a backslash path', 'drop\\..\\..\\passwd'],
    ['a NUL byte', 'drop/\u0000/project.json'],
  ])('refuses %s in an entry name, and stages nothing at all', async (_what, hostile) => {
    const attempt = await refused(zipArchive([textFile(hostile, '{}')]))
    expect(attempt.staged).toEqual([])
    expect(attempt.detail).toContain('is refused')
  })

  it('refuses a symbolic link outright rather than following it, naming the entry', async () => {
    const attempt = await refused(zipArchive([symlink('link', '../../etc/passwd')]))
    expect(attempt.detail).toContain('symbolic link')
    expect(attempt.staged).toEqual([])
  })

  it('refuses a symbolic link whose own name and target are both harmless, the mode deciding it', async () => {
    const attempt = await refused(zipArchive([symlink('notes.json', 'project.json')]))
    expect(attempt.detail).toContain('symbolic link')
  })

  it('stages a file of the same name and bytes, so the refusal above is the mode and not the name', async () => {
    const attempt = expanding(zipArchive([textFile('notes.json', 'project.json')]))
    await expect(attempt.run()).resolves.toEqual({ paths: ['notes.json'], bytes: 12 })
  })

  it('refuses an encrypted entry, having no password to read one with', async () => {
    const attempt = await refused(zipArchive([encrypted('secret.json', ENCODER.encode('{}'))]))
    expect(attempt.detail).toContain('encrypted')
    expect(attempt.staged).toEqual([])
  })

  it('refuses one entry over the entry-count cap, naming the count and the cap', async () => {
    const many = Array.from({ length: MAX_ARCHIVE_ENTRIES + 1 }, (_unused, at) =>
      textFile(`drop/${String(at)}.json`, '{}'),
    )
    const attempt = await refused(zipArchive(many))
    expect(attempt.detail).toContain(String(MAX_ARCHIVE_ENTRIES + 1))
    expect(attempt.detail).toContain(String(MAX_ARCHIVE_ENTRIES))
    expect(attempt.staged).toEqual([])
  })

  it('refuses a hostile name in the last entry before staging the harmless ones ahead of it', async () => {
    const attempt = await refused(
      zipArchive([
        textFile('drop/project.json', '{"id":"one"}'),
        textFile('drop/tasks/a.json', '{"id":"two"}'),
        textFile('../../etc/passwd', 'root:x:0:0'),
      ]),
    )
    expect(attempt.staged).toEqual([])
    expect(attempt.checked).toEqual([])
  })

  it('skips a directory entry rather than refusing the trailing separator it is named by', async () => {
    const attempt = expanding(
      zipArchive([directory('drop'), directory('drop/tasks'), textFile('drop/tasks/a.json', '{}')]),
    )
    await expect(attempt.run()).resolves.toEqual({ paths: ['drop/tasks/a.json'], bytes: 2 })
  })

  it('hands the caller the normalised paths, which is what the session has to check', async () => {
    const attempt = expanding(zipArchive([textFile('drop//./a/project.json', '{}')]))
    await attempt.run()
    expect(attempt.checked).toEqual([['drop/a/project.json']])
    expect(attempt.staged).toEqual([{ path: 'drop/a/project.json', bytes: 2 }])
  })

  it('stages nothing when the caller refuses the set, and lets that refusal through untouched', async () => {
    const attempt = expanding(zipArchive([textFile('a.json', '{}')]), () => {
      throw new Conflict('this session already stages a.json')
    })
    await expect(attempt.run()).rejects.toBeInstanceOf(Conflict)
    expect(attempt.staged).toEqual([])
  })

  it('lets a refusal from the staging side through untouched rather than calling it a bad zip', async () => {
    const attempt = zipArchive([textFile('a.json', '{}'), textFile('b.json', '{}')])
    await expect(
      expandArchive(
        attempt,
        () => undefined,
        async (path) => {
          if (path === 'b.json') throw new Conflict('the session is full')
        },
      ),
    ).rejects.toBeInstanceOf(Conflict)
  })

  it('refuses a file that is not a zip at all as a 422, not as a fault', async () => {
    const attempt = await refused(ENCODER.encode('{"id":"a project, not an archive"}'))
    expect(attempt.detail).toContain('not a zip archive')
  })

  it('refuses an entry whose declared size understates what it expands to', async () => {
    const attempt = await refused(zipArchive([lying('lies.bin', zeros(50_000), 7)]))
    expect(attempt.detail).toContain('not a zip archive')
    expect(attempt.staged).toEqual([])
  })

  it('expands an archive of a whole project directory, bytes for bytes', async () => {
    const attempt = expanding(
      zipArchive([
        textFile(`volume/${P1}/project.json`, '{"id":"one"}'),
        textFile(`volume/${P1}/tasks/${T1}.json`, '{"id":"two"}'),
      ]),
    )
    await expect(attempt.run()).resolves.toEqual({
      paths: [`volume/${P1}/project.json`, `volume/${P1}/tasks/${T1}.json`],
      bytes: 24,
    })
  })
})

describe('the size cap and the ratio cap, each pinned by a fixture the other cannot explain', () => {
  const RATIO_BOMB_BYTES = 10_000_000
  const ratioBomb = (): ArchiveEntry => deflated('bomb.bin', zeros(RATIO_BOMB_BYTES))
  const sizeBomb = (): ArchiveEntry => stored('big.bin', zeros(MAX_ARCHIVE_BYTES + 1))

  const measured = (detail: string): number => Number(/expands at ([\d.]+):1/.exec(detail)?.[1] ?? 0)

  it('fixture A sits under the size cap and the entry cap, so only the ratio can refuse it', () => {
    const entry = ratioBomb()
    expect(entry.data.length).toBeLessThan(MAX_ARCHIVE_BYTES)
    expect(deflateRawSync(entry.data).length * MAX_ARCHIVE_RATIO).toBeLessThan(entry.data.length)
    expect(1).toBeLessThan(MAX_ARCHIVE_ENTRIES)
  })

  it('fixture A is refused for its compression ratio, and the document names that cap', async () => {
    const attempt = await refused(zipArchive([ratioBomb()]))
    expect(attempt.detail).toContain('compression ratio')
    expect(attempt.detail).toContain(`${String(MAX_ARCHIVE_RATIO)}:1`)
    expect(attempt.detail).toContain('bomb.bin')
  })

  it('fixture A reports the ratio it measured, above the cap and below deflate own ceiling', async () => {
    const attempt = await refused(zipArchive([ratioBomb()]))
    expect(measured(attempt.detail)).toBeGreaterThan(MAX_ARCHIVE_RATIO)
    expect(measured(attempt.detail)).toBeLessThan(1100)
  })

  it('fixture A never names the size cap, which is the confusion the two fixtures exist to stop', async () => {
    const attempt = await refused(zipArchive([ratioBomb()]))
    expect(attempt.detail).not.toContain(String(MAX_ARCHIVE_BYTES))
    expect(attempt.detail).not.toContain('expands to more than')
  })

  it('fixture B sits under the ratio cap at exactly 1:1, so only the size cap can refuse it', () => {
    const entry = sizeBomb()
    expect(entry.data.length).toBeGreaterThan(MAX_ARCHIVE_BYTES)
    expect(entry.method).toBe(0)
    expect(entry.data.length / entry.data.length).toBeLessThan(MAX_ARCHIVE_RATIO)
  })

  it('fixture B is refused for the total it expands to, and the document names that cap', async () => {
    const attempt = await refused(zipArchive([sizeBomb()]))
    expect(attempt.detail).toContain('expands to more than')
    expect(attempt.detail).toContain(String(MAX_ARCHIVE_BYTES))
    expect(attempt.detail).toContain('big.bin')
  })

  it('fixture B never names the ratio cap, the entry expanding at one byte for one byte', async () => {
    const attempt = await refused(zipArchive([sizeBomb()]))
    expect(attempt.detail).not.toContain('compression ratio')
  })

  it('stages neither bomb, both caps being measured as the bytes arrive', async () => {
    expect((await refused(zipArchive([ratioBomb()]))).staged).toEqual([])
    expect((await refused(zipArchive([sizeBomb()]))).staged).toEqual([])
  })

  it('takes an expansion of exactly the size cap, so the refusal is the boundary and not the route', async () => {
    const attempt = expanding(zipArchive([stored('big.bin', zeros(MAX_ARCHIVE_BYTES))]))
    await expect(attempt.run()).resolves.toEqual({ paths: ['big.bin'], bytes: MAX_ARCHIVE_BYTES })
  })

  it('measures the total across entries, not per entry, so a bomb cannot be split up', async () => {
    const half = Math.ceil((MAX_ARCHIVE_BYTES + 1) / 2)
    const attempt = await refused(
      zipArchive([stored('one.bin', zeros(half)), stored('two.bin', zeros(half))]),
    )
    expect(attempt.detail).toContain('two.bin')
    expect(attempt.staged).toEqual([{ path: 'one.bin', bytes: half }])
  })
})

describe('the ratio cap admits what this product own files compress at', () => {
  const ratioOf = (text: string): number => {
    const raw = ENCODER.encode(text)
    return raw.length / deflateRawSync(raw).length
  }

  const paragraph = (text: string): unknown => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })

  const document = (count: number, text: string): unknown => ({
    type: 'doc',
    content: Array.from({ length: count }, () => paragraph(text)),
  })

  const bigManifest = (): string =>
    JSON.stringify(
      manifest(P1, {
        tasks: Array.from({ length: 40 }, (_unused, at) =>
          taskEntry(marked('01T', at + 1), `Ship milestone ${String(at)}`),
        ),
      }),
    )

  const proseTask = (): string =>
    JSON.stringify({
      id: T1,
      createdAt: STAMP,
      updatedAt: STAMP,
      tabs: Array.from({ length: 40 }, (_unused, at) => ({
        id: marked('01B', at + 1),
        name: `Tab ${String(at)}`,
        position: at,
        createdAt: STAMP,
        updatedAt: STAMP,
        document: document(60, `Notes for milestone ${String(at)}, written out at some length.`),
      })),
    })

  it.each([
    ['a manifest carrying forty tasks', bigManifest],
    ['a task file of forty tabs of prose', proseTask],
    ['a 1 MB tab document of one paragraph repeated', () => JSON.stringify(document(12_000, 'The same sentence over and over again.'))],
  ])('compresses %s under the cap, so the cap refuses no file of ours', (_what, build) => {
    expect(ratioOf(build())).toBeLessThan(MAX_ARCHIVE_RATIO)
  })

  it('leaves at least sixty per cent of headroom over the most repetitive of them', () => {
    const worst = Math.max(ratioOf(bigManifest()), ratioOf(proseTask()))
    expect(worst).toBeLessThan(MAX_ARCHIVE_RATIO / 2)
  })

  it('still sits below what a bomb needs, a megabyte of one byte compressing far past it', () => {
    const megabyte = decoded(zeros(1_000_000)).length
    expect(megabyte).toBe(1_000_000)
    expect(1_000_000 / deflateRawSync(zeros(1_000_000)).length).toBeGreaterThan(MAX_ARCHIVE_RATIO)
    expect(ratioOf('a'.repeat(1_000_000))).toBeGreaterThan(MAX_ARCHIVE_RATIO)
  })
})

describe('a failure from the staging side is not reported as a failure of the archive', () => {
  const zip = (): Uint8Array => zipArchive([textFile('a.json', '{}'), textFile('b.json', '{}')])

  it('lets a filesystem fault out as itself, rather than as an unreadable archive', async () => {
    const fault = Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
    const caught = await expandArchive(
      zip(),
      () => undefined,
      async () => {
        throw fault
      },
    ).then(
      () => null,
      (err: unknown) => err,
    )
    expect(caught).toBe(fault)
    expect(caught).not.toBeInstanceOf(Invalid)
  })

  it('lets one out from the second entry too, after the first has been staged', async () => {
    const fault = new Error('EACCES: permission denied')
    let staged = 0
    await expect(
      expandArchive(
        zip(),
        () => undefined,
        async () => {
          staged += 1
          if (staged === 2) throw fault
        },
      ),
    ).rejects.toBe(fault)
    expect(staged).toBe(2)
  })
})
