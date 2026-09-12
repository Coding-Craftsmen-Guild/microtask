import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeFileSystem } from './node-file-system.js'

const WRITERS = 20
const SIZE = 50_000

/**
 * How long a test in this file may take, against vitest's 5,000 ms default.
 *
 * Every test here writes real files: {@link WRITERS} payloads of {@link SIZE} characters, each one
 * a temp write plus a rename, so the serialised case is 40 filesystem operations on 1 MB. Idle that
 * is ~780 ms. Inside a cold `turbo run test` it shares a disk with 33 other tasks, and it has come
 * back over 5,000 ms three times during this repo's import/export work — each time passing alone
 * immediately afterwards, and each time on a change in a package `@repo/store` cannot even reach.
 *
 * The duration is a property of the machine, not of the code under test, so the budget is raised
 * rather than the work reduced: {@link WRITERS} and {@link SIZE} are what make the rename race
 * observable at all, and shrinking them to fit a timeout would quietly retire the test's whole
 * point. A real regression here hangs or corrupts rather than merely slowing down, and this still
 * fails it.
 */
const SLOW_IO_TIMEOUT_MS = 60_000
const PAYLOADS = Array.from({ length: WRITERS }, (_, i) =>
  String.fromCharCode(65 + i).repeat(SIZE),
)

describe('NodeFileSystem.writeTextAtomic under concurrency', { timeout: SLOW_IO_TIMEOUT_MS }, () => {
  const sut = new NodeFileSystem()
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-file-system-'))
    file = path.join(dir, 'contended.json')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 })
  })

  const raceAll = async () =>
    Promise.allSettled(PAYLOADS.map((text) => sut.writeTextAtomic(file, text)))

  const codesOf = (results: PromiseSettledResult<void>[]) =>
    results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason.code)] : []))

  it('gives each writer its own temporary path, so no writer loses its temp file', async () => {
    expect(codesOf(await raceAll())).not.toContain('ENOENT')
  })

  it('leaves one whole payload behind, never a mix of two', async () => {
    await raceAll()
    const final = await sut.readText(file)
    expect(final).toHaveLength(SIZE)
    expect(PAYLOADS).toContain(final)
  })

  it('leaves no temporary file behind, even when the platform rejects a rename', async () => {
    await raceAll()
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('lets at least one concurrent writer commit', async () => {
    const results = await raceAll()
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeGreaterThan(0)
  })

  it('lets every writer commit once serialised, as the lock arranges', async () => {
    for (const text of PAYLOADS) await sut.writeTextAtomic(file, text)
    expect(await sut.readText(file)).toBe(PAYLOADS.at(-1))
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
