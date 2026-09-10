import { describe, expect, it } from 'vitest'
import { Invalid, NotFound } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest } from '../entities/manifest.js'
import { ShareIndex } from '../storage/share-index.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { LIMITS } from '../limits.js'
import type { ProjectRef } from './refs.js'
import { FolderService } from './folder-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ABSENT = '01M240ERCRWWCN16Q5AHP1FZAB'

const AT: ProjectRef = { product: 'microtask', projectId: PROJECT }
const MISSING: ProjectRef = { product: 'microtask', projectId: ABSENT }

const build = () => {
  const store = new MemoryProjectStore()
  const service = new FolderService({
    store,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  const seed = async (overrides: Partial<ProjectManifest> = {}): Promise<void> => {
    await store.saveManifest('microtask', manifest(PROJECT, overrides))
  }
  const read = async (): Promise<ProjectManifest> => {
    const found = await store.readManifest('microtask', PROJECT)
    if (found === null) throw new Error('seed missing')
    return found
  }
  return { store, service, seed, read }
}

const positionsOf = (items: readonly { readonly position: number }[]): readonly number[] =>
  items.map((item) => item.position)

const fill = (count: number): readonly Folder[] =>
  Array.from({ length: count }, (_, i) => folder(`f-${i}`, `F${i}`, { position: i }))

describe('FolderService.list', () => {
  it('lists nothing for a project that has no folders', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.list(AT)).resolves.toEqual([])
  })

  it('lists folders in position order rather than the order they are stored in', async () => {
    const { service, seed } = build()
    await seed({
      folders: [
        folder('f-c', 'C', { position: 2 }),
        folder('f-a', 'A', { position: 0 }),
        folder('f-b', 'B', { position: 1 }),
      ],
    })
    const listed = await service.list(AT)
    expect(listed.map((f) => f.name)).toEqual(['A', 'B', 'C'])
  })

  it('rejects an unknown project', async () => {
    await expect(build().service.list(MISSING)).rejects.toThrow(NotFound)
  })
})

describe('FolderService.create', () => {
  it('appends each new folder at the end of the order', async () => {
    const { service, seed } = build()
    await seed()
    await service.create(AT, 'First')
    await service.create(AT, 'Second')
    const third = await service.create(AT, 'Third')
    expect(third.position).toBe(2)
    const listed = await service.list(AT)
    expect(listed.map((f) => f.name)).toEqual(['First', 'Second', 'Third'])
    expect(positionsOf(listed)).toEqual([0, 1, 2])
  })

  it('creates a folder with no parent field, and takes no parent argument, because folders never nest', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, 'Flat')
    expect(Object.keys(created).sort()).toEqual(['createdAt', 'id', 'name', 'position', 'updatedAt'])
    expect(service.create).toHaveLength(2)
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, '  Client   work  ')
    expect(created.name).toBe('Client work')
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, '   ')).rejects.toThrow(Invalid)
  })

  it('stamps the new folder and its project from the clock', async () => {
    const { service, seed, read } = build()
    await seed()
    const created = await service.create(AT, 'Fresh')
    expect(created.createdAt).toBe(NOW)
    expect(created.updatedAt).toBe(NOW)
    expect((await read()).updatedAt).toBe(NOW)
  })

  it('rejects an unknown project', async () => {
    await expect(build().service.create(MISSING, 'Nope')).rejects.toThrow(NotFound)
  })
})

describe('FolderService.rename', () => {
  it('renames the folder and stamps its updatedAt', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'Old')] })
    const renamed = await service.rename(AT, 'f-a', 'New')
    expect(renamed.name).toBe('New')
    expect(renamed.updatedAt).toBe(NOW)
    expect(renamed.createdAt).toBe(STAMP)
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'Old')] })
    const renamed = await service.rename(AT, 'f-a', '  Client   work  ')
    expect(renamed.name).toBe('Client work')
  })

  it('leaves the folder where it was in the order', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A', { position: 0 }), folder('f-b', 'B', { position: 1 })],
    })
    const renamed = await service.rename(AT, 'f-b', 'Bee')
    expect(renamed.position).toBe(1)
    expect((await service.list(AT)).map((f) => f.name)).toEqual(['A', 'Bee'])
  })

  it('renames twice in a row, so reading inside the lock has not wedged the queue', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'Old')] })
    await service.rename(AT, 'f-a', 'Mid')
    const renamed = await service.rename(AT, 'f-a', 'End')
    expect(renamed.name).toBe('End')
  })

  it('rejects an unknown folder', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await expect(service.rename(AT, 'f-zzz', 'New')).rejects.toThrow(NotFound)
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await expect(service.rename(AT, 'f-a', '  ')).rejects.toThrow(Invalid)
  })
})

describe('FolderService.remove', () => {
  it('removes the folder', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await service.remove(AT, 'f-a')
    await expect(service.list(AT)).resolves.toEqual([])
  })

  it('moves the tasks it held to the project root rather than deleting them', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [taskEntry('t-1', 'Kept', { folderId: 'f-a' })],
    })
    await service.remove(AT, 'f-a')
    const tasks = (await read()).tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ id: 't-1', name: 'Kept', folderId: null })
  })

  it('appends the moved tasks after the tasks already at the root, keeping positions dense', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry('t-root', 'Root', { position: 0 }),
        taskEntry('t-held', 'Held', { folderId: 'f-a', position: 0 }),
      ],
    })
    await service.remove(AT, 'f-a')
    const tasks = [...(await read()).tasks].sort((a, b) => a.position - b.position)
    expect(tasks.map((t) => t.id)).toEqual(['t-root', 't-held'])
    expect(positionsOf(tasks)).toEqual([0, 1])
  })

  it('leaves the tasks in other folders where they are', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A', { position: 0 }), folder('f-b', 'B', { position: 1 })],
      tasks: [taskEntry('t-b', 'Elsewhere', { folderId: 'f-b', position: 0 })],
    })
    await service.remove(AT, 'f-a')
    expect((await read()).tasks[0]).toMatchObject({ folderId: 'f-b', position: 0 })
  })

  it('closes the gap it leaves, so folder positions stay dense', async () => {
    const { service, seed } = build()
    await seed({
      folders: [
        folder('f-a', 'A', { position: 0 }),
        folder('f-b', 'B', { position: 1 }),
        folder('f-c', 'C', { position: 2 }),
      ],
    })
    await service.remove(AT, 'f-b')
    const listed = await service.list(AT)
    expect(listed.map((f) => f.name)).toEqual(['A', 'C'])
    expect(positionsOf(listed)).toEqual([0, 1])
  })

  it('rejects an unknown folder rather than reporting success', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await expect(service.remove(AT, 'f-zzz')).rejects.toThrow(NotFound)
  })
})

describe('FolderService.reorder', () => {
  it('puts the folders in the order it was given, numbered from zero', async () => {
    const { service, seed } = build()
    await seed({
      folders: [
        folder('f-a', 'A', { position: 0 }),
        folder('f-b', 'B', { position: 1 }),
        folder('f-c', 'C', { position: 2 }),
      ],
    })
    const reordered = await service.reorder(AT, ['f-c', 'f-a', 'f-b'])
    expect(reordered.map((f) => f.name)).toEqual(['C', 'A', 'B'])
    expect(positionsOf(reordered)).toEqual([0, 1, 2])
    expect((await service.list(AT)).map((f) => f.name)).toEqual(['C', 'A', 'B'])
  })

  it('refuses an order that leaves a folder out', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A', { position: 0 }), folder('f-b', 'B', { position: 1 })],
    })
    await expect(service.reorder(AT, ['f-a'])).rejects.toThrow(Invalid)
  })

  it('refuses an order naming a folder the project does not have', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await expect(service.reorder(AT, ['f-a', 'f-zzz'])).rejects.toThrow(Invalid)
  })

  it('refuses an order that names the same folder twice', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A', { position: 0 }), folder('f-b', 'B', { position: 1 })],
    })
    await expect(service.reorder(AT, ['f-a', 'f-a'])).rejects.toThrow(Invalid)
  })

  it('leaves the stored order untouched when it refuses', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A', { position: 0 }), folder('f-b', 'B', { position: 1 })],
    })
    await expect(service.reorder(AT, ['f-b'])).rejects.toThrow(Invalid)
    expect((await service.list(AT)).map((f) => f.name)).toEqual(['A', 'B'])
  })
})

describe('FolderService caps', () => {
  it('refuses to exceed the folders-per-project cap', async () => {
    const { service, seed } = build()
    await seed({ folders: fill(LIMITS.foldersPerProject) })
    await expect(service.create(AT, 'One too many')).rejects.toThrow(/Too many/)
  })

  it('holds the cap under concurrent creates, because the count is read inside the lock', async () => {
    const { service, seed } = build()
    await seed({ folders: fill(LIMITS.foldersPerProject - 1) })
    const settled = await Promise.allSettled([
      service.create(AT, 'A'),
      service.create(AT, 'B'),
    ])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    await expect(service.list(AT)).resolves.toHaveLength(LIMITS.foldersPerProject)
  })
})
