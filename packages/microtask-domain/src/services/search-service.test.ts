import { describe, expect, it } from 'vitest'
import { can, type Principal, type Role } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { DocumentJson } from '../entities/document.js'
import type { TaskDocument } from '../entities/task.js'
import type { ProjectStore } from '../ports/project-store.js'
import { ShareIndex } from '../storage/share-index.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { folder, manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { clearance } from './search-mapper.js'
import type { SearchResult } from './search-service.js'
import { SearchService } from './search-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const EARLIER = '2026-09-10T09:00:00.000Z'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ELSEWHERE = '01M240ERCRWWCN16Q5AHP1FZAC'
const MINE = '01M240ERCRWWCN16Q5AHP1FZAB'
const SIBLING = '01M240ERCRWWCN16Q5AHP1FZAD'
const MY_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAG'
const OTHER_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAH'
const FAR_TASK = '01M240ERCRWWCN16Q5AHP1FZAJ'
const FAR_FOLDER = '01M240ERCRWWCN16Q5AHP1FZAK'
const MY_TAB = '01M240ERCRWWCN16Q5AHP1FZAM'
const SIBLING_TAB = '01M240ERCRWWCN16Q5AHP1FZAN'

const PROJECT_NAME = 'Quokkaline Launch'
const MY_FOLDER_NAME = 'Fenwickshire zephyrine holdings'
const OTHER_FOLDER_NAME = 'Thistlebarrow zephyrine group'
const MY_TASK_NAME = 'Renew the zephyrine certificate'
const SIBLING_TASK_NAME = 'Audit the zephyrine invoices'
const MY_TAB_NAME = 'Zephyrine dossier'
const SIBLING_TAB_NAME = 'Zephyrine ledger'
const FAR_PROJECT_NAME = 'Marmotberry zephyrine programme'
const FAR_FOLDER_NAME = 'Ravensworth zephyrine trust'
const FAR_TASK_NAME = 'Ship the zephyrine adapters'
const OTHER_PRODUCT = '01M240ERCRWWCN16Q5AHP1FZAP'
const OTHER_PRODUCT_NAME = 'Ambergris zephyrine roadmap'
const DOCUMENT_ONLY = 'muskflowerbrae'

const QUERY = 'zephyrine'

const admin: Principal = { kind: 'admin' }

const projectLink = (role: Role = 'view'): Principal => ({
  kind: 'link',
  role,
  token: 'tok_project',
  scope: { kind: 'project', projectId: PROJECT },
})

const taskLink = (role: Role = 'view'): Principal => ({
  kind: 'link',
  role,
  token: 'tok_task',
  scope: { kind: 'task', projectId: PROJECT, taskId: MINE },
})

const farProjectLink = (): Principal => ({
  kind: 'link',
  role: 'manage',
  token: 'tok_far',
  scope: { kind: 'project', projectId: ELSEWHERE },
})

/**
 * Wraps a store so a test can see which port methods the service actually called.
 *
 * Reading a task file is the thing ADR 0005's split bought freedom from, and no assertion on
 * the returned results can prove a file was never opened — an implementation that reads every
 * task and then discards the tabs returns exactly the same value. Calls the store makes on
 * itself stay invisible, because the real method is applied to the raw target.
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

const documentWith = (text: string): DocumentJson => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const taskWith = (id: string, tabId: string, tabName: string, text: string): TaskDocument => ({
  id,
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [
    {
      id: tabId,
      name: tabName,
      position: 0,
      document: documentWith(text),
      createdAt: STAMP,
      updatedAt: STAMP,
    },
  ],
})

const build = () => {
  const store = new MemoryProjectStore()
  const { spy, calls } = watched(store)
  const service = new SearchService({
    store: spy,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  const seed = async (): Promise<void> => {
    const near = manifest(PROJECT, {
      name: PROJECT_NAME,
      updatedAt: NOW,
      folders: [
        folder(MY_FOLDER, MY_FOLDER_NAME),
        folder(OTHER_FOLDER, OTHER_FOLDER_NAME, { position: 1 }),
      ],
      tasks: [
        taskEntry(MINE, MY_TASK_NAME, { folderId: MY_FOLDER }),
        taskEntry(SIBLING, SIBLING_TASK_NAME, { folderId: OTHER_FOLDER, position: 1 }),
      ],
    })
    const far = manifest(ELSEWHERE, {
      name: FAR_PROJECT_NAME,
      updatedAt: EARLIER,
      folders: [folder(FAR_FOLDER, FAR_FOLDER_NAME)],
      tasks: [taskEntry(FAR_TASK, FAR_TASK_NAME)],
    })
    await store.saveManifest('microtask', near)
    await store.saveManifest('microtask', far)
    await store.saveManifest(
      'macroplan',
      manifest(OTHER_PRODUCT, { name: OTHER_PRODUCT_NAME, updatedAt: NOW }),
    )
    await store.saveTask('microtask', near, taskWith(MINE, MY_TAB, MY_TAB_NAME, DOCUMENT_ONLY))
    await store.saveTask(
      'microtask',
      near,
      taskWith(SIBLING, SIBLING_TAB, SIBLING_TAB_NAME, DOCUMENT_ONLY),
    )
    calls.length = 0
  }
  return { store, service, seed, calls }
}

const namesOf = (results: readonly SearchResult[]): readonly string[] =>
  results.map((each) => each.name)

describe('SearchService.search across principals', () => {
  it('gives the admin every matching name in every project', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', admin, QUERY)
    expect(namesOf(results).slice().sort()).toEqual(
      [
        MY_FOLDER_NAME,
        OTHER_FOLDER_NAME,
        MY_TASK_NAME,
        SIBLING_TASK_NAME,
        FAR_PROJECT_NAME,
        FAR_FOLDER_NAME,
        FAR_TASK_NAME,
      ].sort(),
    )
  })

  it('gives a project-scoped link everything inside its own project', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', projectLink(), QUERY)
    expect(namesOf(results).slice().sort()).toEqual(
      [MY_FOLDER_NAME, OTHER_FOLDER_NAME, MY_TASK_NAME, SIBLING_TASK_NAME].sort(),
    )
  })

  it('gives a task-scoped link exactly its own task and nothing else', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), QUERY)
    expect(results).toEqual([{ kind: 'task', projectId: PROJECT, taskId: MINE, name: MY_TASK_NAME }])
  })

  it('shapes a link result set by scope rather than by role, so manage widens nothing', async () => {
    const { service, seed } = build()
    await seed()
    const viewer = await service.search('microtask', taskLink('view'), QUERY)
    const manager = await service.search('microtask', taskLink('manage'), QUERY)
    expect(namesOf(manager)).toEqual(namesOf(viewer))
  })

  it('returns results a caller can address, carrying the ids of what matched', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', projectLink(), 'Fenwickshire')
    expect(results).toEqual([
      { kind: 'folder', projectId: PROJECT, folderId: MY_FOLDER, name: MY_FOLDER_NAME },
    ])
  })
})

describe('SearchService.search leaks nothing outside a task scope', () => {
  it('never names the folder holding the task, nor any sibling folder', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), QUERY)
    const serialised = JSON.stringify(results)
    expect(serialised).not.toContain(MY_FOLDER_NAME)
    expect(serialised).not.toContain(OTHER_FOLDER_NAME)
  })

  it('never names a sibling task, or the tab of one', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), QUERY)
    const serialised = JSON.stringify(results)
    expect(serialised).not.toContain(SIBLING_TASK_NAME)
    expect(serialised).not.toContain(SIBLING_TAB_NAME)
  })

  it('never names anything in another project', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), QUERY)
    const serialised = JSON.stringify(results)
    expect(serialised).not.toContain(FAR_PROJECT_NAME)
    expect(serialised).not.toContain(FAR_FOLDER_NAME)
    expect(serialised).not.toContain(FAR_TASK_NAME)
  })

  it('returns nothing at all for a term that matches only its own folder', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', taskLink(), 'Fenwickshire')).resolves.toEqual([])
  })

  it('returns nothing at all for a term that matches only a sibling task', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', taskLink(), 'invoices')).resolves.toEqual([])
  })
})

describe('SearchService.search leaks nothing outside a project scope', () => {
  it('never names another project, its folders or its tasks', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', projectLink('manage'), QUERY)
    const serialised = JSON.stringify(results)
    expect(serialised).not.toContain(FAR_PROJECT_NAME)
    expect(serialised).not.toContain(FAR_FOLDER_NAME)
    expect(serialised).not.toContain(FAR_TASK_NAME)
  })

  it('shows the other side of the same seed, so the filter is scope and not seeding', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', farProjectLink(), QUERY)
    const serialised = JSON.stringify(results)
    expect(namesOf(results).slice().sort()).toEqual(
      [FAR_PROJECT_NAME, FAR_FOLDER_NAME, FAR_TASK_NAME].sort(),
    )
    expect(serialised).not.toContain(MY_TASK_NAME)
    expect(serialised).not.toContain(MY_FOLDER_NAME)
  })
})

describe('SearchService.search and the project name', () => {
  it('lets a task-scoped link see the name of the project its task lives in', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), 'Quokkaline')
    expect(results).toEqual([{ kind: 'project', projectId: PROJECT, name: PROJECT_NAME }])
  })

  it('still refuses it the name of a project it is not scoped to', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', taskLink(), 'Marmotberry')).resolves.toEqual([])
  })
})

describe('SearchService.search matching', () => {
  it('matches without regard to case, in the query or in the name', async () => {
    const { service, seed } = build()
    await seed()
    const shouted = await service.search('microtask', projectLink(), 'ZEPHYRINE')
    const whispered = await service.search('microtask', projectLink(), 'zEpHyRiNe')
    expect(namesOf(shouted)).toEqual(namesOf(whispered))
    expect(shouted).toHaveLength(4)
  })

  it('matches a name by an upper-case term the name spells in lower case', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), 'ZEPHYRINE CERT')
    expect(namesOf(results)).toEqual([MY_TASK_NAME])
  })

  it('matches a substring rather than a whole word', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), 'ephyri')
    expect(namesOf(results)).toEqual([MY_TASK_NAME])
  })

  it('returns nothing for an empty query rather than everything', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', admin, '')).resolves.toEqual([])
  })

  it('returns nothing for a query that is only whitespace', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', admin, '   \t ')).resolves.toEqual([])
  })

  it('ignores whitespace around a query rather than failing to match', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', taskLink(), '  zephyrine certificate  ')
    expect(namesOf(results)).toEqual([MY_TASK_NAME])
  })

  it('returns nothing for a term no name holds', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', admin, 'wolfram')).resolves.toEqual([])
  })

  it('returns nothing when the product holds no projects', async () => {
    const { service } = build()
    await expect(service.search('microtask', admin, QUERY)).resolves.toEqual([])
  })
})

describe('SearchService.search reads names only', () => {
  it('does not match text inside a document, however plainly it is there', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', admin, DOCUMENT_ONLY)).resolves.toEqual([])
  })

  it('does not match a tab name, which lives in the task file and not the manifest', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.search('microtask', admin, 'dossier')).resolves.toEqual([])
  })

  it('returns only project, folder and task kinds, never a tab', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', admin, QUERY)
    expect([...new Set(results.map((each) => each.kind))].sort()).toEqual([
      'folder',
      'project',
      'task',
    ])
  })
})

describe('SearchService.search reads one manifest per project', () => {
  it('never opens a task file, whoever is asking', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.search('microtask', admin, QUERY)
    await service.search('microtask', projectLink(), QUERY)
    await service.search('microtask', taskLink(), QUERY)
    expect(calls).not.toContain('readTask')
  })

  it('lists the manifests once and reads nothing else', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.search('microtask', admin, QUERY)
    expect(calls).toEqual(['listManifests'])
  })

  it('opens no file at all when the query is empty', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.search('microtask', admin, '')
    expect(calls).toEqual([])
  })

  it('writes nothing, because searching is a read', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.search('microtask', admin, QUERY)
    expect(calls).not.toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })
})

describe('SearchService.search stays inside one product', () => {
  it('never names a project belonging to the other product', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', admin, QUERY)
    expect(JSON.stringify(results)).not.toContain(OTHER_PRODUCT_NAME)
  })

  it('finds that project only when asked about that product', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('macroplan', admin, QUERY)
    expect(namesOf(results)).toEqual([OTHER_PRODUCT_NAME])
  })
})

describe('SearchService.search ordering', () => {
  it('keeps the order the store listed the projects in, newest update first', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', admin, QUERY)
    expect(results.map((each) => each.projectId)).toEqual([
      PROJECT,
      PROJECT,
      PROJECT,
      PROJECT,
      ELSEWHERE,
      ELSEWHERE,
      ELSEWHERE,
    ])
  })

  it('puts a project before its folders, and its folders before its tasks', async () => {
    const { service, seed } = build()
    await seed()
    const results = await service.search('microtask', admin, QUERY)
    expect(results.map((each) => each.kind)).toEqual([
      'folder',
      'folder',
      'task',
      'task',
      'project',
      'folder',
      'task',
    ])
  })
})

describe('search clearance asks the policy the right question', () => {
  it('puts a project name to the policy as project:read on a project target', () => {
    expect(clearance({ kind: 'project', projectId: PROJECT, name: PROJECT_NAME })).toEqual({
      action: 'project:read',
      target: { kind: 'project', projectId: PROJECT },
    })
  })

  it('puts a folder name to the policy as project:read on a folder target', () => {
    const result = {
      kind: 'folder',
      projectId: PROJECT,
      folderId: MY_FOLDER,
      name: MY_FOLDER_NAME,
    } as const
    expect(clearance(result)).toEqual({
      action: 'project:read',
      target: { kind: 'folder', projectId: PROJECT },
    })
  })

  it('puts a task name to the policy as task:read on that task', () => {
    const result = { kind: 'task', projectId: PROJECT, taskId: MINE, name: MY_TASK_NAME } as const
    expect(clearance(result)).toEqual({
      action: 'task:read',
      target: { kind: 'task', projectId: PROJECT, taskId: MINE },
    })
  })

  it('never asks about a folder as a project, which a task scope would answer yes to', () => {
    const asFolder = clearance({
      kind: 'folder',
      projectId: PROJECT,
      folderId: MY_FOLDER,
      name: MY_FOLDER_NAME,
    })
    expect(can(taskLink(), asFolder.action, asFolder.target)).toBe(false)
  })
})

describe('SearchService.search takes no lock', () => {
  it('answers while a writer holds the lock, because a read never queues behind one', async () => {
    const { store, seed } = build()
    await seed()
    const lock = new QueueLock()
    const service = new SearchService({
      store,
      tokens: new ShareIndex(),
      lock,
      clock: fixedClock(NOW),
      ids: sequentialIds(),
    })
    let release = (): void => {}
    const held = lock.run(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    const results = await service.search('microtask', admin, QUERY)
    expect(results).toHaveLength(7)
    release()
    await held
  })
})
