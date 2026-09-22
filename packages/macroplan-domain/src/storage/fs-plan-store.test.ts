import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FileSystem } from '@repo/kernel'
import { MemoryFileSystem } from '@repo/kernel/testing'
import { describePlanStore, item, itemDocument, marked, planManifest } from '../testing/index.js'
import { FsPlanStore } from './fs-plan-store.js'
import { itemFile, manifestFile, plansDir } from './paths.js'

const ROOT = '/data'
const PLAN = marked('PN', 1)
const FEATURE = marked('FT', 1)
const ITEM = marked('TM', 1)

describePlanStore('FsPlanStore', () => {
  const files = new MemoryFileSystem()
  const store = new FsPlanStore({ files, root: () => ROOT })
  return {
    store,
    async reset() {
      files.clear()
    },
    async writeUndecodableManifest(product, planId, raw) {
      await files.writeTextAtomic(manifestFile(ROOT, product, planId), raw)
    },
    async writeUndecodableItem(product, planId, itemId, raw) {
      await files.writeTextAtomic(itemFile(ROOT, product, planId, itemId), raw)
    },
    async addContainerWithoutManifest(product, name) {
      const inside = path.join(plansDir(ROOT, product), name, 'items', 'kept.json')
      await files.writeTextAtomic(inside, '{}')
    },
  }
})

type Step = { op: 'write' | 'remove'; file: string }

class OrderedFileSystem implements FileSystem {
  readonly attempts: Step[] = []
  readonly removals: string[] = []
  failWriteAt: number | null = null
  failRemoveAt: number | null = null
  writes = 0
  removes = 0

  readonly #inner = new MemoryFileSystem()

  startCounting() {
    this.attempts.length = 0
    this.removals.length = 0
    this.writes = 0
    this.removes = 0
  }

  async readText(file: string) {
    return this.#inner.readText(file)
  }

  async writeTextAtomic(file: string, text: string) {
    this.attempts.push({ op: 'write', file })
    this.writes += 1
    if (this.writes === this.failWriteAt) throw new Error('killed mid-write')
    await this.#inner.writeTextAtomic(file, text)
  }

  async readBytes(file: string) {
    return this.#inner.readBytes(file)
  }

  async appendBytes(file: string, bytes: Uint8Array) {
    await this.#inner.appendBytes(file, bytes)
  }

  async remove(file: string) {
    this.attempts.push({ op: 'remove', file })
    this.removes += 1
    if (this.removes === this.failRemoveAt) throw new Error('killed mid-unlink')
    this.removals.push(file)
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
    await this.#inner.move(from, to)
  }
}

const MANIFEST = manifestFile(ROOT, 'macroplan', PLAN)
const FILE = itemFile(ROOT, 'macroplan', PLAN, ITEM)

const naming = (ids: readonly string[], name: string) =>
  planManifest(PLAN, { name, items: ids.map((id) => item(id, FEATURE)) })

function setup() {
  const files = new OrderedFileSystem()
  return { files, store: new FsPlanStore({ files, root: () => ROOT }) }
}

describe('write ordering (ADR 0006), which no sequential contract case can observe', () => {
  it('writes the item file before the manifest, so a dead manifest write leaves the file and the manifest as it was', async () => {
    const { files, store } = setup()
    await store.saveManifest('macroplan', naming([], 'Before'))
    files.startCounting()
    files.failWriteAt = 2
    await expect(
      store.saveItem('macroplan', naming([ITEM], 'After'), itemDocument(ITEM)),
    ).rejects.toThrow('killed mid-write')
    expect(files.attempts).toEqual([
      { op: 'write', file: FILE },
      { op: 'write', file: MANIFEST },
    ])
    const left = await store.readManifest('macroplan', PLAN)
    expect(left?.name).toBe('Before')
    expect(left?.items).toEqual([])
    expect(await store.readItem('macroplan', PLAN, ITEM)).not.toBeNull()
  })

  it('writes the manifest before it unlinks, so a dead remove leaves a manifest that no longer names the item and an orphan file', async () => {
    const { files, store } = setup()
    await store.saveItem('macroplan', naming([ITEM], 'Launch'), itemDocument(ITEM))
    files.startCounting()
    files.failRemoveAt = 1
    await expect(store.deleteItems('macroplan', naming([], 'Launch'), [ITEM])).rejects.toThrow(
      'killed mid-unlink',
    )
    expect(files.attempts).toEqual([
      { op: 'write', file: MANIFEST },
      { op: 'remove', file: FILE },
    ])
    expect((await store.readManifest('macroplan', PLAN))?.items).toEqual([])
    expect(await store.readItem('macroplan', PLAN, ITEM)).not.toBeNull()
  })

  it('never leaves the reverse — a manifest still naming an item whose file is gone — when the delete dies on its manifest write', async () => {
    const { files, store } = setup()
    await store.saveItem('macroplan', naming([ITEM], 'Launch'), itemDocument(ITEM))
    files.startCounting()
    files.failWriteAt = 1
    await expect(store.deleteItems('macroplan', naming([], 'Launch'), [ITEM])).rejects.toThrow(
      'killed mid-write',
    )
    expect(files.removals).toEqual([])
    expect((await store.readManifest('macroplan', PLAN))?.items.map((one) => one.id)).toEqual([ITEM])
    expect(await store.readItem('macroplan', PLAN, ITEM)).not.toBeNull()
  })

  it('publishes the manifest once for a twelve-item delete, which is the reason the port takes a list', async () => {
    const { files, store } = setup()
    const ids = Array.from({ length: 12 }, (_, at) => marked('TM', at + 1))
    const full = naming(ids, 'Launch')
    for (const id of ids) await store.saveItem('macroplan', full, itemDocument(id))
    files.startCounting()
    await store.deleteItems('macroplan', naming([], 'Launch'), ids)
    expect(files.attempts.filter((one) => one.op === 'write')).toEqual([
      { op: 'write', file: MANIFEST },
    ])
    expect(files.removals).toHaveLength(12)
  })
})
