import { describe, expect, it } from 'vitest'
import { Invalid, NotFound } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { DocumentJson } from '../entities/document.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { TaskDocument } from '../entities/task.js'
import { ShareIndex } from '../storage/share-index.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { LIMITS } from '../limits.js'
import type { ProjectRef, TaskRef } from './refs.js'
import { TaskService } from './task-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240ERCRWWCN16Q5AHP1FZAB'
const OTHER = '01M240ERCRWWCN16Q5AHP1FZAC'
const THIRD = '01M240ERCRWWCN16Q5AHP1FZAE'
const ABSENT = '01M240ERCRWWCN16Q5AHP1FZAD'

const AT: ProjectRef = { product: 'microtask', projectId: PROJECT }
const MISSING: ProjectRef = { product: 'microtask', projectId: ABSENT }
const on = (taskId: string): TaskRef => ({ ...AT, taskId })

/**
 * Wraps a store so a test can see which port methods the service actually called.
 *
 * The end state cannot tell "went through saveTask" from "wrote the manifest itself" — both
 * leave the same bytes. Calls the store makes on itself are invisible here, because the real
 * method is applied to the raw target rather than to this proxy, so `calls` is exactly what
 * the service asked for and nothing else.
 */
const watched = (store: MemoryProjectStore) => {
  const calls: string[] = []
  const spy = new Proxy(store, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        calls.push(String(property))
        return (value as (...a: unknown[]) => unknown).apply(target, args)
      }
    },
  }) as unknown as ProjectStore
  return { spy, calls }
}

const build = () => {
  const store = new MemoryProjectStore()
  const { spy, calls } = watched(store)
  const service = new TaskService({
    store: spy,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  const seed = async (overrides: Partial<ProjectManifest> = {}): Promise<ProjectManifest> => {
    const seeded = manifest(PROJECT, overrides)
    await store.saveManifest('microtask', seeded)
    calls.length = 0
    return seeded
  }
  const read = async (): Promise<ProjectManifest> => {
    const found = await store.readManifest('microtask', PROJECT)
    if (found === null) throw new Error('seed missing')
    return found
  }
  return { store, service, seed, read, calls }
}

const checklist = (done: number, total: number): DocumentJson => ({
  type: 'doc',
  content: Array.from({ length: total }, (_, i) => ({
    type: 'taskItem',
    attrs: { checked: i < done },
  })),
})

const taskWith = (id: string, documents: readonly DocumentJson[]): TaskDocument => ({
  id,
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: documents.map((document, index) => ({
    id: `tab-${index}`,
    name: index === 0 ? 'General' : `Tab ${index}`,
    position: index,
    document,
    createdAt: STAMP,
    updatedAt: STAMP,
  })),
})

const idsOf = (tasks: readonly TaskEntry[]): readonly string[] => tasks.map((task) => task.id)

const groupOf = (tasks: readonly TaskEntry[], folderId: string | null): readonly TaskEntry[] =>
  [...tasks].filter((task) => task.folderId === folderId).sort((a, b) => a.position - b.position)

describe('TaskService.create', () => {
  it('gives the new task exactly one tab named General holding an empty document', async () => {
    const { service, seed, store } = build()
    await seed()
    const created = await service.create(AT, 'Ship it')
    const document = await store.readTask('microtask', PROJECT, created.id)
    expect(document?.tabs).toHaveLength(1)
    expect(document?.tabs[0]?.name).toBe('General')
    expect(document?.tabs[0]?.document).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(document?.tabs[0]?.position).toBe(0)
  })

  it('goes through store.saveTask rather than writing the manifest itself', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.create(AT, 'Ship it')
    expect(calls).toContain('saveTask')
    expect(calls).not.toContain('saveManifest')
  })

  it('caches zero progress for the empty document it writes', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, 'Ship it')
    expect(created.progress).toEqual({ done: 0, total: 0 })
  })

  it('appends each new task at the end of its group', async () => {
    const { service, seed, read } = build()
    await seed()
    await service.create(AT, 'First')
    await service.create(AT, 'Second')
    const third = await service.create(AT, 'Third')
    expect(third.position).toBe(2)
    expect(groupOf((await read()).tasks, null).map((t) => t.name)).toEqual([
      'First',
      'Second',
      'Third',
    ])
  })

  it('puts the task at the project root when it is given no folder', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, 'Rootward')
    expect(created.folderId).toBeNull()
  })

  it('puts the task in the folder it is given, numbering it within that folder', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [taskEntry('t-root', 'Root', { position: 0 })],
    })
    const created = await service.create(AT, 'Filed', 'f-a')
    expect(created).toMatchObject({ folderId: 'f-a', position: 0 })
    expect(groupOf((await read()).tasks, null)).toHaveLength(1)
  })

  it('rejects a folder the project does not have', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, 'Filed', 'f-zzz')).rejects.toThrow(NotFound)
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, '  Ship   it  ')
    expect(created.name).toBe('Ship it')
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, '   ')).rejects.toThrow(Invalid)
  })

  it('rejects an unknown project', async () => {
    await expect(build().service.create(MISSING, 'Ship it')).rejects.toThrow(NotFound)
  })
})

describe('TaskService.read', () => {
  it('returns the task entry and the document it describes', async () => {
    const { service, seed, store } = build()
    const seeded = await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(0, 0)]))
    const detail = await service.read(on(TASK))
    expect(detail.entry).toMatchObject({ id: TASK, name: 'Ship it' })
    expect(detail.document.tabs).toHaveLength(1)
  })

  it('recomputes and corrects a progress cache that disagrees with the document', async () => {
    const { service, store, read } = build()
    const seeded = manifest(PROJECT, {
      tasks: [taskEntry(TASK, 'Ship it', { progress: { done: 9, total: 9 } })],
    })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(1, 3)]))
    const detail = await service.read(on(TASK))
    expect(detail.entry.progress).toEqual({ done: 1, total: 3 })
    expect((await read()).tasks[0]?.progress).toEqual({ done: 1, total: 3 })
  })

  it('computes a missing cache entry rather than reading it as zero', async () => {
    const { service, store } = build()
    const uncached = { id: TASK, name: 'Ship it', position: 0, folderId: null } as TaskEntry
    const seeded = manifest(PROJECT, { tasks: [uncached] })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(2, 5)]))
    const detail = await service.read(on(TASK))
    expect(detail.entry.progress).toEqual({ done: 2, total: 5 })
  })

  it('counts every tab of the task, not only the first', async () => {
    const { service, store } = build()
    const seeded = manifest(PROJECT, { tasks: [taskEntry(TASK, 'Ship it')] })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(1, 2), checklist(2, 4)]))
    const detail = await service.read(on(TASK))
    expect(detail.entry.progress).toEqual({ done: 3, total: 6 })
  })

  it('writes nothing when the cache already agrees with the document', async () => {
    const { service, store, calls } = build()
    const seeded = manifest(PROJECT, {
      tasks: [taskEntry(TASK, 'Ship it', { progress: { done: 1, total: 3 } })],
    })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(1, 3)]))
    calls.length = 0
    await service.read(on(TASK))
    expect(calls).not.toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })

  it('leaves the project updatedAt alone when it corrects the cache, because nobody edited it', async () => {
    const { service, store, read } = build()
    const seeded = manifest(PROJECT, {
      tasks: [taskEntry(TASK, 'Ship it', { progress: { done: 9, total: 9 } })],
    })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(1, 3)]))
    await service.read(on(TASK))
    expect((await read()).updatedAt).toBe(STAMP)
  })

  it('rejects a task the manifest does not list', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.read(on(ABSENT))).rejects.toThrow(NotFound)
  })

  it('rejects a task the manifest lists but whose document is gone', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await expect(service.read(on(TASK))).rejects.toThrow(NotFound)
  })
})

describe('TaskService.rename', () => {
  it('renames the task', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    const renamed = await service.rename(on(TASK), 'New')
    expect(renamed.name).toBe('New')
  })

  it('goes through store.saveManifest, because a rename touches no document', async () => {
    const { service, seed, calls } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    await service.rename(on(TASK), 'New')
    expect(calls).toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    const renamed = await service.rename(on(TASK), '  Ship   it  ')
    expect(renamed.name).toBe('Ship it')
  })

  it('leaves the folder, the position and the progress cache alone', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [taskEntry(TASK, 'Old', { folderId: 'f-a', progress: { done: 1, total: 2 } })],
    })
    const renamed = await service.rename(on(TASK), 'New')
    expect(renamed).toMatchObject({ folderId: 'f-a', position: 0, progress: { done: 1, total: 2 } })
  })

  it('renames twice in a row, so reading inside the lock has not wedged the queue', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    await service.rename(on(TASK), 'Mid')
    const renamed = await service.rename(on(TASK), 'End')
    expect(renamed.name).toBe('End')
  })

  it('rejects an unknown task', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    await expect(service.rename(on(ABSENT), 'New')).rejects.toThrow(NotFound)
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Old')] })
    await expect(service.rename(on(TASK), '  ')).rejects.toThrow(Invalid)
  })
})

describe('TaskService.remove', () => {
  it('goes through store.deleteTask rather than writing the manifest itself', async () => {
    const { service, seed, calls } = build()
    await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await service.remove(on(TASK))
    expect(calls).toContain('deleteTask')
    expect(calls).not.toContain('saveManifest')
  })

  it('drops the task from the manifest and its document from the store', async () => {
    const { service, seed, read, store } = build()
    const seeded = await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await store.saveTask('microtask', seeded, taskWith(TASK, [checklist(0, 1)]))
    await service.remove(on(TASK))
    expect((await read()).tasks).toEqual([])
    await expect(store.readTask('microtask', PROJECT, TASK)).resolves.toBeNull()
  })

  it('closes the gap it leaves, so positions in that group stay dense', async () => {
    const { service, seed, read } = build()
    await seed({
      tasks: [
        taskEntry(TASK, 'A', { position: 0 }),
        taskEntry(OTHER, 'B', { position: 1 }),
        taskEntry(THIRD, 'C', { position: 2 }),
      ],
    })
    await service.remove(on(OTHER))
    const root = groupOf((await read()).tasks, null)
    expect(root.map((task) => task.position)).toEqual([0, 1])
    expect(idsOf(root)).toEqual([TASK, THIRD])
  })

  it('leaves the tasks of other folders alone', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry(TASK, 'Root', { position: 0 }),
        taskEntry(OTHER, 'Filed', { folderId: 'f-a', position: 0 }),
      ],
    })
    await service.remove(on(TASK))
    expect(groupOf((await read()).tasks, 'f-a')).toMatchObject([{ id: OTHER, position: 0 }])
  })

  it('rejects an unknown task rather than reporting success', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await expect(service.remove(on(ABSENT))).rejects.toThrow(NotFound)
  })
})

describe('TaskService.move', () => {
  it('changes only the folder and the position', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [taskEntry(TASK, 'Ship it', { progress: { done: 1, total: 2 } })],
    })
    const moved = await service.move(on(TASK), 'f-a')
    expect(moved).toEqual({
      id: TASK,
      name: 'Ship it',
      folderId: 'f-a',
      position: 0,
      progress: { done: 1, total: 2 },
    })
  })

  it('appends the task at the end of the folder it joins', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry(OTHER, 'Already there', { folderId: 'f-a', position: 0 }),
        taskEntry(TASK, 'Arriving', { position: 0 }),
      ],
    })
    const moved = await service.move(on(TASK), 'f-a')
    expect(moved.position).toBe(1)
    expect(idsOf(groupOf((await read()).tasks, 'f-a'))).toEqual([OTHER, TASK])
  })

  it('closes the gap it leaves in the folder it came from', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry(TASK, 'Leaving', { folderId: 'f-a', position: 0 }),
        taskEntry(OTHER, 'Staying', { folderId: 'f-a', position: 1 }),
      ],
    })
    await service.move(on(TASK), null)
    expect(groupOf((await read()).tasks, 'f-a')).toMatchObject([{ id: OTHER, position: 0 }])
  })

  it('puts the task at the project root when it is moved to null', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [taskEntry(TASK, 'Ship it', { folderId: 'f-a' })],
    })
    const moved = await service.move(on(TASK), null)
    expect(moved.folderId).toBeNull()
    expect(idsOf(groupOf((await read()).tasks, null))).toEqual([TASK])
  })

  it('rejects a folder the project does not have', async () => {
    const { service, seed } = build()
    await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await expect(service.move(on(TASK), 'f-zzz')).rejects.toThrow(NotFound)
  })

  it('leaves the stored placement untouched when it refuses', async () => {
    const { service, seed, read } = build()
    await seed({ tasks: [taskEntry(TASK, 'Ship it')] })
    await expect(service.move(on(TASK), 'f-zzz')).rejects.toThrow(NotFound)
    expect((await read()).tasks[0]).toMatchObject({ folderId: null, position: 0 })
  })

  it('rejects an unknown task', async () => {
    const { service, seed } = build()
    await seed({ folders: [folder('f-a', 'A')] })
    await expect(service.move(on(ABSENT), 'f-a')).rejects.toThrow(NotFound)
  })

  it('goes through store.saveManifest, because a move touches no document', async () => {
    const { service, seed, calls } = build()
    await seed({ folders: [folder('f-a', 'A')], tasks: [taskEntry(TASK, 'Ship it')] })
    await service.move(on(TASK), 'f-a')
    expect(calls).toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })
})

describe('TaskService.reorder', () => {
  it('puts the tasks of one folder in the order given, numbered from zero', async () => {
    const { service, seed, read } = build()
    await seed({
      tasks: [
        taskEntry(TASK, 'A', { position: 0 }),
        taskEntry(OTHER, 'B', { position: 1 }),
        taskEntry(THIRD, 'C', { position: 2 }),
      ],
    })
    const ordered = await service.reorder(AT, null, [THIRD, TASK, OTHER])
    expect(idsOf(ordered)).toEqual([THIRD, TASK, OTHER])
    expect(ordered.map((task) => task.position)).toEqual([0, 1, 2])
    expect(idsOf(groupOf((await read()).tasks, null))).toEqual([THIRD, TASK, OTHER])
  })

  it('leaves the tasks of other folders alone', async () => {
    const { service, seed, read } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry(TASK, 'Root A', { position: 0 }),
        taskEntry(OTHER, 'Root B', { position: 1 }),
        taskEntry(THIRD, 'Filed', { folderId: 'f-a', position: 0 }),
      ],
    })
    await service.reorder(AT, null, [OTHER, TASK])
    expect(groupOf((await read()).tasks, 'f-a')).toMatchObject([{ id: THIRD, position: 0 }])
  })

  it('refuses an order that does not name every task in that folder exactly once', async () => {
    const { service, seed } = build()
    await seed({
      tasks: [taskEntry(TASK, 'A', { position: 0 }), taskEntry(OTHER, 'B', { position: 1 })],
    })
    await expect(service.reorder(AT, null, [TASK])).rejects.toThrow(Invalid)
  })

  it('refuses an order naming a task that lives in another folder', async () => {
    const { service, seed } = build()
    await seed({
      folders: [folder('f-a', 'A')],
      tasks: [
        taskEntry(TASK, 'Root', { position: 0 }),
        taskEntry(OTHER, 'Filed', { folderId: 'f-a', position: 0 }),
      ],
    })
    await expect(service.reorder(AT, null, [TASK, OTHER])).rejects.toThrow(Invalid)
  })

  it('rejects a folder the project does not have', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.reorder(AT, 'f-zzz', [])).rejects.toThrow(NotFound)
  })
})

describe('TaskService caps', () => {
  const fill = (count: number): readonly TaskEntry[] => {
    const ids = sequentialIds(5000)
    return Array.from({ length: count }, (_, i) =>
      taskEntry(ids.entityId(), `T${i}`, { position: i }),
    )
  }

  it('fills the store with distinct ids, so the cap is really reached', () => {
    expect(new Set(idsOf(fill(LIMITS.tasksPerProject))).size).toBe(LIMITS.tasksPerProject)
  })

  it('refuses to exceed the tasks-per-project cap', async () => {
    const { service, seed } = build()
    await seed({ tasks: fill(LIMITS.tasksPerProject) })
    await expect(service.create(AT, 'One too many')).rejects.toThrow(/Too many/)
  })

  it('holds the cap under concurrent creates, because the count is read inside the lock', async () => {
    const { service, seed, read } = build()
    await seed({ tasks: fill(LIMITS.tasksPerProject - 1) })
    const settled = await Promise.allSettled([
      service.create(AT, 'A'),
      service.create(AT, 'B'),
    ])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await read()).tasks).toHaveLength(LIMITS.tasksPerProject)
  })
})
