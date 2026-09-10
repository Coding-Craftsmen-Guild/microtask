import { describe, expect, it } from 'vitest'
import type { FileSystem } from '@repo/kernel'
import { manifest, taskDocument, taskEntry } from '../testing/index.js'
import { FsProjectStore } from './fs-project-store.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'

class MemoryFileSystem implements FileSystem {
  readonly writes: string[] = []
  readonly removals: string[] = []
  readonly log: { op: 'write' | 'remove'; file: string }[] = []
  failOn: (file: string) => boolean = () => false

  readonly #store = new Map<string, string>()

  async readText(file: string) {
    return this.#store.get(file) ?? null
  }

  async writeTextAtomic(file: string, text: string) {
    if (this.failOn(file)) throw new Error('killed mid-write')
    this.writes.push(file)
    this.log.push({ op: 'write', file })
    this.#store.set(file, text)
  }

  async remove(file: string) {
    this.removals.push(file)
    this.log.push({ op: 'remove', file })
    return this.#store.delete(file)
  }

  async removeDir() {
    return true
  }

  async listDirs() {
    return []
  }
}

const isManifest = (file: string) => file.includes('project.json')

const step = ({ op, file }: { op: 'write' | 'remove'; file: string }) =>
  `${op} ${isManifest(file) ? 'manifest' : 'task'}`

function setup() {
  const files = new MemoryFileSystem()
  const store = new FsProjectStore({ files, root: () => '/data' })
  const entry = manifest(P, { tasks: [taskEntry(T, 'Go-live')] })
  const emptied = manifest(P, { tasks: [] })
  return { files, store, entry, emptied }
}

describe('write ordering (ADR 0006)', () => {
  it('writes the task file before the manifest, so a crash orphans a file at worst', async () => {
    const { files, store, entry } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    expect(files.writes.map((file) => (isManifest(file) ? 'manifest' : 'task'))).toEqual([
      'task',
      'manifest',
    ])
  })

  it('leaves no manifest entry pointing at a missing task file when the manifest write dies', async () => {
    const { files, store, entry } = setup()
    files.failOn = isManifest
    await expect(store.saveTask('microtask', entry, taskDocument(T, TAB))).rejects.toThrow(
      'killed mid-write',
    )
    expect(await store.readTask('microtask', P, T)).not.toBeNull()
    expect(await store.readManifest('microtask', P)).toBeNull()
  })

  it('writes the manifest before unlinking, so a crash never strands a referenced file', async () => {
    const { files, store, entry, emptied } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    files.log.length = 0
    await store.deleteTask('microtask', emptied, T)
    expect(files.log.map(step)).toEqual(['write manifest', 'remove task'])
    expect(files.removals.some((file) => file.includes(T))).toBe(true)
  })

  it('keeps the task file when the manifest write dies during a delete', async () => {
    const { files, store, entry, emptied } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    files.failOn = isManifest
    await expect(store.deleteTask('microtask', emptied, T)).rejects.toThrow('killed mid-write')
    expect(files.removals).toEqual([])
    expect(await store.readTask('microtask', P, T)).not.toBeNull()
  })
})
