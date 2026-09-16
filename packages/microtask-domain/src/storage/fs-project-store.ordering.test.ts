import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileSystem } from '@repo/kernel'
import { MemoryFileSystem } from '@repo/kernel/testing'
import { manifest, taskDocument, taskEntry } from '../testing/index.js'
import { FsProjectStore } from './fs-project-store.js'
import { buildManifestFile, buildTaskFile, projectDir, tasksDir } from './paths.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const TAB = '01M240FB4GD6PF6V0PKZVF6FDA'

class RecordingFileSystem implements FileSystem {
  readonly writes: string[] = []
  readonly removals: string[] = []
  readonly log: { op: 'write' | 'remove' | 'move'; file: string }[] = []
  failOn: (file: string) => boolean = () => false
  killMove = false

  readonly #inner = new MemoryFileSystem()

  async readText(file: string) {
    return this.#inner.readText(file)
  }

  async writeTextAtomic(file: string, text: string) {
    if (this.failOn(file)) throw new Error('killed mid-write')
    this.writes.push(file)
    this.log.push({ op: 'write', file })
    await this.#inner.writeTextAtomic(file, text)
  }

  async readBytes(file: string) {
    return this.#inner.readBytes(file)
  }

  async appendBytes(file: string, bytes: Uint8Array) {
    await this.#inner.appendBytes(file, bytes)
  }

  async remove(file: string) {
    this.removals.push(file)
    this.log.push({ op: 'remove', file })
    return this.#inner.remove(file)
  }

  async removeDir(dir: string) {
    return this.#inner.removeDir(dir)
  }

  async listDirs(dir: string) {
    return this.#inner.listDirs(dir)
  }

  async listFiles(dir: string) {
    return this.#inner.listFiles(dir)
  }

  async size(file: string) {
    return this.#inner.size(file)
  }

  async move(from: string, to: string) {
    this.log.push({ op: 'move', file: to })
    if (this.killMove) throw new Error('killed mid-move')
    await this.#inner.move(from, to)
  }
}

const isManifest = (file: string) => file.includes('project.json')

const step = ({ op, file }: { op: 'write' | 'remove' | 'move'; file: string }) =>
  `${op} ${isManifest(file) ? 'manifest' : 'task'}`

function setup() {
  const files = new RecordingFileSystem()
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

  it('records the ordering over a filesystem that answers for the directories it wrote, not a stub that answers [] to everything', async () => {
    const { store, entry } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    expect((await store.listManifests('microtask')).map((found) => found.id)).toEqual([P])
    expect(await store.deleteProject('microtask', P)).toBe(true)
    expect(await store.listManifests('microtask')).toEqual([])
  })
})

const SEP_BUILD = `${sep}build${sep}`
const SEP_PROJECTS = `${sep}projects${sep}`

const T2 = '01M240FB4GD6PF6V0PKZVF6FDB'
const TAB2 = '01M240FB4GD6PF6V0PKZVF6FDC'

const whole = () => ({
  manifest: manifest(P, { tasks: [taskEntry(T, 'Go-live'), taskEntry(T2, 'Cost it up')] }),
  documents: [taskDocument(T, TAB), taskDocument(T2, TAB2)],
})

const buildTask = (id: string) => buildTaskFile('/data', 'microtask', P, id)
const buildManifest = () => buildManifestFile('/data', 'microtask', P)
const liveDir = () => projectDir('/data', 'microtask', P)
const liveTasks = () => tasksDir('/data', 'microtask', P)

describe('the bulk rule (ADR 0006): built whole, then moved into place', () => {
  it('assembles every task and the manifest under build/, and publishes with one move', async () => {
    const { files, store } = setup()
    await store.publishProject('microtask', whole())
    expect(files.log.filter((one) => one.op === 'move')).toEqual([
      { op: 'move', file: liveDir() },
    ])
    const built = files.writes.filter((file) => file.includes(SEP_BUILD))
    expect(built).toEqual([buildTask(T), buildTask(T2), buildManifest()])
  })

  it('writes nothing at all under projects/ before the move, so no reader sees a partial project', async () => {
    const { files, store } = setup()
    await store.publishProject('microtask', whole())
    expect(files.writes.filter((file) => file.includes(SEP_PROJECTS))).toEqual([])
  })

  it('shows the project wholly present once the move has happened', async () => {
    const { store } = setup()
    await store.publishProject('microtask', whole())
    expect((await store.listManifests('microtask')).map((one) => one.id)).toEqual([P])
    expect(await store.readTask('microtask', P, T)).not.toBeNull()
    expect(await store.readTask('microtask', P, T2)).not.toBeNull()
  })

  it('shows it wholly absent when the kill lands between the last task file and the move', async () => {
    const { files, store } = setup()
    files.killMove = true
    await expect(store.publishProject('microtask', whole())).rejects.toThrow('killed mid-move')
    expect(await store.listManifests('microtask')).toEqual([])
    expect(await store.readManifest('microtask', P)).toBeNull()
    expect(await store.readTask('microtask', P, T)).toBeNull()
  })

  it('had in fact finished building when that kill landed, so absence is the move and not a short build', async () => {
    const { files, store } = setup()
    files.killMove = true
    await expect(store.publishProject('microtask', whole())).rejects.toThrow('killed mid-move')
    expect(await files.readText(buildTask(T))).not.toBeNull()
    expect(await files.readText(buildTask(T2))).not.toBeNull()
    expect(await files.readText(buildManifest())).not.toBeNull()
  })

  it('shows a replaced project wholly absent rather than half replaced, which is the window this names', async () => {
    const { files, store, entry } = setup()
    await store.saveTask('microtask', entry, taskDocument(T, TAB))
    files.killMove = true
    await expect(store.publishProject('microtask', whole())).rejects.toThrow('killed mid-move')
    expect(await store.readManifest('microtask', P)).toBeNull()
    expect(await store.readTask('microtask', P, T)).toBeNull()
  })

  it('reclaims an interrupted build on the next publish rather than moving its leftovers along', async () => {
    const { files, store } = setup()
    await files.writeTextAtomic(buildTask('01M240FB4GD6PF6V0PKZVF6FDD'), '{"id":"stale"}')
    await store.publishProject('microtask', whole())
    expect((await store.readManifest('microtask', P))?.tasks.map((one) => one.id)).toEqual([T, T2])
    expect(await files.listFiles(liveTasks())).toEqual([
      `${T}.json`,
      `${T2}.json`,
    ])
  })
})
