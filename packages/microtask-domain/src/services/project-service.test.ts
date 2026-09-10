import { describe, expect, it } from 'vitest'
import { Invalid, NotFound } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import { ShareIndex } from '../storage/share-index.js'
import type { ShareLink } from '../entities/share-link.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { manifest } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { LIMITS } from '../limits.js'
import { ProjectService } from './project-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const EARLIER = '2026-01-01T00:00:00.000Z'
const TOKEN = 'tok_launchlaunchlau'
const ABSENT = '01M240ERCRWWCN16Q5AHP1FZAQ'

const build = () => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const service = new ProjectService({
    store,
    tokens,
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  return { store, service, tokens }
}

const shareLink = (token: string, projectId: string): ShareLink => ({
  token,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'project', projectId },
  createdBy: null,
  createdAt: EARLIER,
})

const fill = async (store: MemoryProjectStore, count: number): Promise<void> => {
  const ids = sequentialIds(1000)
  for (let i = 0; i < count; i += 1) await store.saveManifest('microtask', manifest(ids.entityId()))
}

describe('ProjectService.create', () => {
  it('creates a project with no folders, tasks or share links', async () => {
    const project = await build().service.create('microtask', 'Launch')
    expect(project).toMatchObject({ name: 'Launch', folders: [], tasks: [], shareLinks: [] })
    expect(project.createdAt).toBe(NOW)
    expect(project.updatedAt).toBe(NOW)
  })

  it('cleans the name it was given', async () => {
    const project = await build().service.create('microtask', '  Go   live  ')
    expect(project.name).toBe('Go live')
  })

  it('rejects an empty name', async () => {
    await expect(build().service.create('microtask', '   ')).rejects.toThrow(Invalid)
  })

  it('is readable straight back', async () => {
    const { service } = build()
    const created = await service.create('microtask', 'Launch')
    await expect(service.read('microtask', created.id)).resolves.toEqual(created)
  })

  it('keeps products apart', async () => {
    const { service } = build()
    const created = await service.create('microtask', 'Launch')
    await expect(service.read('macroplan', created.id)).rejects.toThrow(NotFound)
  })
})

describe('ProjectService.list', () => {
  it('lists newest update first', async () => {
    const { service, store } = build()
    const a = await service.create('microtask', 'A')
    const b = await service.create('microtask', 'B')
    await store.saveManifest('microtask', { ...a, updatedAt: EARLIER })
    const listed = await service.list('microtask')
    expect(listed.map((p) => p.id)).toEqual([b.id, a.id])
  })

  it('returns an empty list rather than throwing when there is nothing', async () => {
    await expect(build().service.list('microtask')).resolves.toEqual([])
  })
})

describe('ProjectService.rename', () => {
  it('renames and stamps updatedAt', async () => {
    const { service, store } = build()
    const created = await service.create('microtask', 'Old')
    await store.saveManifest('microtask', { ...created, updatedAt: EARLIER })
    const renamed = await service.rename('microtask', created.id, 'New')
    expect(renamed.name).toBe('New')
    expect(renamed.updatedAt).toBe(NOW)
    expect(renamed.createdAt).toBe(created.createdAt)
  })

  it('renames twice in a row, so reading inside the lock has not wedged the queue', async () => {
    const { service } = build()
    const created = await service.create('microtask', 'Old')
    await service.rename('microtask', created.id, 'Mid')
    const renamed = await service.rename('microtask', created.id, 'End')
    expect(renamed.name).toBe('End')
  })

  it('rejects an unknown project', async () => {
    await expect(build().service.rename('microtask', ABSENT, 'New')).rejects.toThrow(NotFound)
  })

  it('rejects an empty name', async () => {
    const { service } = build()
    const created = await service.create('microtask', 'Old')
    await expect(service.rename('microtask', created.id, '  ')).rejects.toThrow(Invalid)
  })
})

describe('ProjectService.remove', () => {
  it('removes the project', async () => {
    const { service } = build()
    const created = await service.create('microtask', 'Launch')
    await service.remove('microtask', created.id)
    await expect(service.read('microtask', created.id)).rejects.toThrow(NotFound)
  })

  it('rejects an unknown project rather than reporting success', async () => {
    await expect(build().service.remove('microtask', ABSENT)).rejects.toThrow(NotFound)
  })

  it('drops the share tokens of a removed project, so they stop resolving', async () => {
    const { service, store, tokens } = build()
    const created = await service.create('microtask', 'Launch')
    const shared = { ...created, shareLinks: [shareLink(TOKEN, created.id)] }
    await store.saveManifest('microtask', shared)
    tokens.add('microtask', shared)
    expect(tokens.find(TOKEN)).toEqual({ product: 'microtask', projectId: created.id })
    await service.remove('microtask', created.id)
    expect(tokens.find(TOKEN)).toBeNull()
  })
})

describe('ProjectService caps', () => {
  it('refuses to exceed the projects-per-product cap', async () => {
    const { service, store } = build()
    await fill(store, LIMITS.projectsPerProduct)
    await expect(service.create('microtask', 'One too many')).rejects.toThrow(/Too many/)
  })

  it('holds the cap under concurrent creates, because the count is read inside the lock', async () => {
    const { service, store } = build()
    await fill(store, LIMITS.projectsPerProduct - 1)
    const settled = await Promise.allSettled([
      service.create('microtask', 'A'),
      service.create('microtask', 'B'),
    ])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    await expect(service.list('microtask')).resolves.toHaveLength(LIMITS.projectsPerProduct)
  })
})
