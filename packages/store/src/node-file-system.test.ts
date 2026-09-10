import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeFileSystem } from './node-file-system.js'

const WRITERS = 20
const SIZE = 50_000
const PAYLOADS = Array.from({ length: WRITERS }, (_, i) =>
  String.fromCharCode(65 + i).repeat(SIZE),
)

describe('NodeFileSystem.writeTextAtomic under concurrency', () => {
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
