import { describe, expect, it } from 'vitest'
import { Conflict, Invalid, NotFound } from '@repo/kernel'
import type { Clock } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import { emptyDocument, type DocumentJson } from '../entities/document.js'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { ShareIndex } from '../storage/share-index.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { LIMITS } from '../limits.js'
import { TabService, type TaskRef } from './tab-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240ERCRWWCN16Q5AHP1FZAB'
const ABSENT_TASK = '01M240ERCRWWCN16Q5AHP1FZAD'
const ABSENT_PROJECT = '01M240ERCRWWCN16Q5AHP1FZAF'
const ORPHAN = '01M240ERCRWWCN16Q5AHP1FZAE'
const TAB = 'tab-a'
const OTHER = 'tab-b'
const THIRD = 'tab-c'

const AT: TaskRef = { product: 'microtask', projectId: PROJECT, taskId: TASK }

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

/**
 * A clock that moves on every reading, so a test can tell "the precondition matched" apart
 * from "the stamp happened not to change". `fixedClock` cannot: every write it stamps carries
 * the same value.
 */
const tickingClock = (): Clock => {
  let at = Date.parse('2026-09-10T12:00:00.000Z')
  return {
    now: () => {
      at += 1
      return new Date(at).toISOString()
    },
  }
}

const tab = (id: string, name: string, overrides: Partial<Tab> = {}): Tab => ({
  id,
  name,
  position: 0,
  document: emptyDocument(),
  createdAt: STAMP,
  updatedAt: STAMP,
  ...overrides,
})

const checklist = (done: number, total: number): DocumentJson => ({
  type: 'doc',
  content: Array.from({ length: total }, (_, i) => ({
    type: 'taskItem',
    attrs: { checked: i < done },
  })),
})

const build = (clock: Clock = fixedClock(NOW)) => {
  const store = new MemoryProjectStore()
  const { spy, calls } = watched(store)
  const service = new TabService({
    store: spy,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock,
    ids: sequentialIds(),
  })
  const seed = async (tabs: readonly Tab[], progress = { done: 0, total: 0 }): Promise<void> => {
    const seeded = manifest(PROJECT, { tasks: [taskEntry(TASK, 'Ship it', { progress })] })
    const document: TaskDocument = { id: TASK, createdAt: STAMP, updatedAt: STAMP, tabs }
    await store.saveTask('microtask', seeded, document)
    calls.length = 0
  }
  const readTask = async (): Promise<TaskDocument> => {
    const found = await store.readTask('microtask', PROJECT, TASK)
    if (found === null) throw new Error('seed missing')
    return found
  }
  const readManifest = async (): Promise<ProjectManifest> => {
    const found = await store.readManifest('microtask', PROJECT)
    if (found === null) throw new Error('seed missing')
    return found
  }
  return { store, service, seed, readTask, readManifest, calls }
}

const ordered = (tabs: readonly Tab[]): readonly Tab[] =>
  [...tabs].sort((a, b) => a.position - b.position)

const idsOf = (tabs: readonly Tab[]): readonly string[] => ordered(tabs).map((each) => each.id)

describe('TabService.create', () => {
  it('appends the tab at the end, holding an empty document', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'General')])
    const created = await service.create(AT, 'Notes')
    expect(created).toMatchObject({ name: 'Notes', position: 1, createdAt: NOW, updatedAt: NOW })
    expect(created.document).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(idsOf((await readTask()).tabs)).toEqual([TAB, created.id])
    expect((await readTask()).updatedAt).toBe(NOW)
  })

  it('renumbers a sparse, out-of-order tab list rather than appending onto it', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(OTHER, 'B', { position: 5 }), tab(TAB, 'A', { position: 0 })])
    const created = await service.create(AT, 'C')
    const tabs = ordered((await readTask()).tabs)
    expect(idsOf(tabs)).toEqual([TAB, OTHER, created.id])
    expect(tabs.map((each) => each.position)).toEqual([0, 1, 2])
  })

  it('refuses to open the task file of a task the manifest does not list', async () => {
    const { service, seed, store, calls } = build()
    await seed([tab(TAB, 'General')])
    const orphan: TaskDocument = {
      id: ORPHAN,
      createdAt: STAMP,
      updatedAt: STAMP,
      tabs: [tab(TAB, 'General')],
    }
    store.putRawTask('microtask', PROJECT, ORPHAN, JSON.stringify(orphan))
    calls.length = 0
    const at: TaskRef = { ...AT, taskId: ORPHAN }
    await expect(service.rename(at, TAB, 'Renamed')).rejects.toThrow(NotFound)
    expect(calls).toEqual(['readManifest'])
  })

  it('keeps positions dense across several creates', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'General')])
    await service.create(AT, 'Second')
    await service.create(AT, 'Third')
    expect(ordered((await readTask()).tabs).map((each) => each.position)).toEqual([0, 1, 2])
  })

  it('goes through store.saveTask, because a tab lives in the task file', async () => {
    const { service, seed, calls } = build()
    await seed([tab(TAB, 'General')])
    await service.create(AT, 'Notes')
    expect(calls).toContain('saveTask')
    expect(calls).not.toContain('saveManifest')
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    expect((await service.create(AT, '  Design   notes  ')).name).toBe('Design notes')
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.create(AT, '   ')).rejects.toThrow(Invalid)
  })

  it('stamps the project, because adding a tab is an edit', async () => {
    const { service, seed, readManifest } = build()
    await seed([tab(TAB, 'General')])
    await service.create(AT, 'Notes')
    expect((await readManifest()).updatedAt).toBe(NOW)
  })

  it('rejects an unknown project', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    const at: TaskRef = { ...AT, projectId: ABSENT_PROJECT }
    await expect(service.create(at, 'Notes')).rejects.toThrow(NotFound)
  })

  it('rejects a task the manifest lists but whose document is gone', async () => {
    const { service, store } = build()
    const seeded = manifest(PROJECT, { tasks: [taskEntry(TASK, 'Ship it')] })
    await store.saveManifest('microtask', seeded)
    await expect(service.create(AT, 'Notes')).rejects.toThrow(NotFound)
  })

  it('rejects a task the manifest does not list', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    const at: TaskRef = { ...AT, taskId: ABSENT_TASK }
    await expect(service.create(at, 'Notes')).rejects.toThrow(NotFound)
  })
})

describe('TabService caps', () => {
  const fill = (count: number): readonly Tab[] =>
    Array.from({ length: count }, (_, i) => tab(`tab-${i}`, `T${i}`, { position: i }))

  it('refuses to exceed the tabs-per-task cap', async () => {
    const { service, seed } = build()
    await seed(fill(LIMITS.tabsPerTask))
    await expect(service.create(AT, 'One too many')).rejects.toThrow(/Too many/)
  })

  it('holds the cap under concurrent creates, because the count is read inside the lock', async () => {
    const { service, seed, readTask } = build()
    await seed(fill(LIMITS.tabsPerTask - 1))
    const settled = await Promise.allSettled([service.create(AT, 'A'), service.create(AT, 'B')])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await readTask()).tabs).toHaveLength(LIMITS.tabsPerTask)
  })
})

describe('TabService.rename', () => {
  it('renames the tab, cleaning the name', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    expect((await service.rename(AT, TAB, '  Design   notes ')).name).toBe('Design notes')
  })

  it('leaves the document and the position alone', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General', { document: checklist(1, 2), position: 0 }), tab(OTHER, 'B', { position: 1 })])
    const renamed = await service.rename(AT, TAB, 'Renamed')
    expect(renamed.position).toBe(0)
    expect(renamed.document).toEqual(checklist(1, 2))
  })

  it('renumbers a sparse, out-of-order tab list rather than leaving it as it found it', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(OTHER, 'B', { position: 5 }), tab(TAB, 'A', { position: 0 })])
    await service.rename(AT, TAB, 'Renamed')
    const tabs = ordered((await readTask()).tabs)
    expect(idsOf(tabs)).toEqual([TAB, OTHER])
    expect(tabs.map((each) => each.position)).toEqual([0, 1])
  })

  it('rejects an unknown tab', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.rename(AT, 'tab-zzz', 'Renamed')).rejects.toThrow(NotFound)
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.rename(AT, TAB, '  ')).rejects.toThrow(Invalid)
  })
})

describe('TabService.remove', () => {
  it('removes the tab, keeping the remaining positions dense', async () => {
    const { service, seed, readTask } = build()
    await seed([
      tab(THIRD, 'C', { position: 2 }),
      tab(TAB, 'A', { position: 0 }),
      tab(OTHER, 'B', { position: 1 }),
    ])
    await service.remove(AT, OTHER)
    const tabs = ordered((await readTask()).tabs)
    expect(idsOf(tabs)).toEqual([TAB, THIRD])
    expect(tabs.map((each) => each.position)).toEqual([0, 1])
  })

  it('refuses to remove the last tab, because a task always keeps one', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.remove(AT, TAB)).rejects.toThrow(Invalid)
  })

  it('leaves the last tab stored when it refuses', async () => {
    const { service, seed, readTask, calls } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.remove(AT, TAB)).rejects.toThrow(Invalid)
    expect(idsOf((await readTask()).tabs)).toEqual([TAB])
    expect(calls).not.toContain('saveTask')
  })

  it('recounts the task progress, because the removed tab took its items with it', async () => {
    const { service, seed, readManifest } = build()
    await seed(
      [
        tab(TAB, 'A', { position: 0, document: checklist(1, 2) }),
        tab(OTHER, 'B', { position: 1, document: checklist(2, 3) }),
      ],
      { done: 3, total: 5 },
    )
    await service.remove(AT, OTHER)
    expect((await readManifest()).tasks[0]?.progress).toEqual({ done: 1, total: 2 })
  })

  it('rejects an unknown tab rather than reporting success', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'A', { position: 0 }), tab(OTHER, 'B', { position: 1 })])
    await expect(service.remove(AT, 'tab-zzz')).rejects.toThrow(NotFound)
  })
})

describe('TabService.reorder', () => {
  it('puts the tabs in the order given, numbered from zero', async () => {
    const { service, seed, readTask } = build()
    await seed([
      tab(TAB, 'A', { position: 0 }),
      tab(OTHER, 'B', { position: 1 }),
      tab(THIRD, 'C', { position: 2 }),
    ])
    const result = await service.reorder(AT, [THIRD, TAB, OTHER])
    expect(idsOf(result)).toEqual([THIRD, TAB, OTHER])
    expect(result.map((each) => each.position)).toEqual([0, 1, 2])
    expect(idsOf((await readTask()).tabs)).toEqual([THIRD, TAB, OTHER])
  })

  it('refuses a partial order rather than dropping the tabs it omits', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'A', { position: 0 }), tab(OTHER, 'B', { position: 1 })])
    await expect(service.reorder(AT, [TAB])).rejects.toThrow(Invalid)
    expect((await readTask()).tabs).toHaveLength(2)
  })

  it('refuses an order naming a tab twice', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'A', { position: 0 }), tab(OTHER, 'B', { position: 1 })])
    await expect(service.reorder(AT, [TAB, TAB])).rejects.toThrow(Invalid)
  })

  it('refuses an order naming a tab the task does not have', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'A', { position: 0 }), tab(OTHER, 'B', { position: 1 })])
    await expect(service.reorder(AT, [TAB, 'tab-zzz'])).rejects.toThrow(Invalid)
  })
})

describe('TabService.writeDocument', () => {
  it('stores the document and returns the new updatedAt', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'General')])
    const at = await service.writeDocument(AT, TAB, checklist(1, 3), STAMP)
    expect(at).toBe(NOW)
    const stored = (await readTask()).tabs[0]
    expect(stored?.document).toEqual(checklist(1, 3))
    expect(stored?.updatedAt).toBe(NOW)
  })

  it('checks the document before it reads anything, so an unsafe document is Invalid not NotFound', async () => {
    const { service, seed, calls } = build()
    await seed([tab(TAB, 'General')])
    const unsafe = { type: 'doc', content: [{ type: 'text', href: 'javascript:alert(1)' }] }
    const at: TaskRef = { ...AT, projectId: ABSENT_PROJECT }
    await expect(service.writeDocument(at, 'tab-zzz', unsafe, 'stale')).rejects.toThrow(Invalid)
    expect(calls).toEqual([])
  })

  it('updates the manifest progress cache in the same operation', async () => {
    const { service, seed, readManifest } = build()
    await seed([tab(TAB, 'General')])
    await service.writeDocument(AT, TAB, checklist(2, 5), STAMP)
    expect((await readManifest()).tasks[0]?.progress).toEqual({ done: 2, total: 5 })
  })

  it('counts every tab of the task, not only the one written', async () => {
    const { service, seed, readManifest } = build()
    await seed([
      tab(TAB, 'A', { position: 0 }),
      tab(OTHER, 'B', { position: 1, document: checklist(1, 4) }),
    ])
    await service.writeDocument(AT, TAB, checklist(2, 5), STAMP)
    expect((await readManifest()).tasks[0]?.progress).toEqual({ done: 3, total: 9 })
  })

  it('stamps the project, because a document write is an edit', async () => {
    const { service, seed, readManifest } = build()
    await seed([tab(TAB, 'General')])
    await service.writeDocument(AT, TAB, checklist(0, 1), STAMP)
    expect((await readManifest()).updatedAt).toBe(NOW)
  })

  it('throws Conflict when the precondition does not match the stored updatedAt', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.writeDocument(AT, TAB, checklist(1, 1), 'stale')).rejects.toThrow(Conflict)
  })

  it('leaves the stored document untouched when it refuses', async () => {
    const { service, seed, readTask, calls } = build()
    await seed([tab(TAB, 'General', { document: checklist(1, 2) })])
    await expect(service.writeDocument(AT, TAB, checklist(0, 9), 'stale')).rejects.toThrow(Conflict)
    expect((await readTask()).tabs[0]?.document).toEqual(checklist(1, 2))
    expect(calls).not.toContain('saveTask')
  })

  it('accepts the next write when it carries the updatedAt the last one returned', async () => {
    const { service, seed } = build(tickingClock())
    await seed([tab(TAB, 'General')])
    const first = await service.writeDocument(AT, TAB, checklist(1, 2), STAMP)
    const second = await service.writeDocument(AT, TAB, checklist(2, 2), first)
    expect(second).not.toBe(first)
  })

  it('rejects an unknown tab', async () => {
    const { service, seed } = build()
    await seed([tab(TAB, 'General')])
    await expect(service.writeDocument(AT, 'tab-zzz', checklist(0, 1), STAMP)).rejects.toThrow(
      NotFound,
    )
  })

  it('lets exactly one of twenty concurrent writes on the same base win, rejecting 19 as Conflict', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'General')])
    const writes = Array.from({ length: 20 }, (_, i) =>
      service.writeDocument(AT, TAB, checklist(i, 20), STAMP),
    )
    const settled = await Promise.allSettled(writes)
    const outcome = {
      fulfilled: settled.filter((result) => result.status === 'fulfilled').length,
      conflicts: settled.filter(
        (result) => result.status === 'rejected' && result.reason instanceof Conflict,
      ).length,
    }
    expect(outcome).toEqual({ fulfilled: 1, conflicts: 19 })
    expect((await readTask()).tabs[0]?.document).toEqual(checklist(0, 20))
  })

  it('rejects 19 of 20 on a clock that moves too, so the win is the precondition and not a stale seed stamp', async () => {
    const { service, seed } = build(tickingClock())
    await seed([tab(TAB, 'General')])
    const writes = Array.from({ length: 20 }, (_, i) =>
      service.writeDocument(AT, TAB, checklist(i, 20), STAMP),
    )
    const settled = await Promise.allSettled(writes)
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })

  it('cannot separate two writes landing in one clock tick, which is what a timestamp precondition buys', async () => {
    const { service, seed, readTask } = build()
    await seed([tab(TAB, 'General')])
    const base = await service.writeDocument(AT, TAB, checklist(1, 2), STAMP)
    await service.writeDocument(AT, TAB, checklist(2, 2), base)
    await service.writeDocument(AT, TAB, checklist(0, 2), base)
    expect((await readTask()).tabs[0]?.document).toEqual(checklist(0, 2))
  })
})
