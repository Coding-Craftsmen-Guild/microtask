import { describe, expect, it } from 'vitest'
import { Conflict, Invalid, NotFound } from '@repo/kernel'
import type { IdGenerator } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { ShareLink } from '../entities/share-link.js'
import { ShareIndex } from '../storage/share-index.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { manifest, taskEntry, STAMP } from '../testing/fixtures.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { LIMITS } from '../limits.js'
import type { ProjectRef } from './refs.js'
import { ShareLinkService } from './share-link-service.js'

const NOW = '2026-09-10T12:00:00.000Z'
const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const ELSEWHERE = '01M240ERCRWWCN16Q5AHP1FZAC'
const ABSENT = '01M240ERCRWWCN16Q5AHP1FZAF'
const TASK = '01M240ERCRWWCN16Q5AHP1FZAB'
const OTHER_TASK = '01M240ERCRWWCN16Q5AHP1FZAD'
const ABSENT_TASK = '01M240ERCRWWCN16Q5AHP1FZAE'

const AT: ProjectRef = { product: 'microtask', projectId: PROJECT }
const MISSING: ProjectRef = { product: 'microtask', projectId: ABSENT }

/**
 * Wraps a store so a test can see which port methods the service actually called.
 *
 * The end state cannot tell "refused before writing" from "wrote and then rolled back" — both
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

/** Ids whose token is chosen by the test, so a collision can be arranged deliberately. */
const idsMinting = (token: string): IdGenerator => {
  const base = sequentialIds()
  return { entityId: () => base.entityId(), token: () => token }
}

const build = (ids: IdGenerator = sequentialIds()) => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const { spy, calls } = watched(store)
  const service = new ShareLinkService({
    store: spy,
    tokens,
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids,
  })
  const seed = async (overrides: Partial<ProjectManifest> = {}): Promise<ProjectManifest> => {
    const seeded = manifest(PROJECT, {
      tasks: [taskEntry(TASK, 'Ship it'), taskEntry(OTHER_TASK, 'Later', { position: 1 })],
      ...overrides,
    })
    await store.saveManifest('microtask', seeded)
    tokens.add('microtask', seeded)
    calls.length = 0
    return seeded
  }
  const read = async (): Promise<ProjectManifest> => {
    const found = await store.readManifest('microtask', PROJECT)
    if (found === null) throw new Error('seed missing')
    return found
  }
  return { store, service, tokens, seed, read, calls }
}

const link = (token: string, overrides: Partial<ShareLink> = {}): ShareLink => ({
  token,
  name: 'Jane at ACME',
  role: 'manage',
  scope: { kind: 'project', projectId: PROJECT },
  createdBy: null,
  createdAt: STAMP,
  ...overrides,
})

const asAdmin = { name: 'Jane at ACME', role: 'view', createdBy: null } as const

const tokensOf = (links: readonly ShareLink[]): readonly string[] =>
  links.map((each) => each.token)

describe('ShareLinkService.create', () => {
  it('scopes a new link to the task it names, because task is the default scope', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(created.scope).toEqual({ kind: 'task', projectId: PROJECT, taskId: TASK })
  })

  it('widens a link to the whole project only when the request says so by name', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, {
      ...asAdmin,
      scope: { kind: 'project', projectId: PROJECT },
    })
    expect(created.scope).toEqual({ kind: 'project', projectId: PROJECT })
  })

  it('refuses a request that names neither a task nor a scope, rather than guessing one', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, asAdmin)).rejects.toThrow(Invalid)
  })

  it('exposes no method that changes a link scope, so widening is revoke and reissue', () => {
    expect(Object.getOwnPropertyNames(ShareLinkService.prototype).sort()).toEqual([
      'constructor',
      'create',
      'list',
      'revoke',
    ])
  })

  it('records createdBy as null when the admin mints the link', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(created.createdBy).toBeNull()
  })

  it('records the minting link token as createdBy', async () => {
    const { service, seed } = build()
    await seed({ shareLinks: [link('tok_parent')] })
    const created = await service.create(AT, {
      ...asAdmin,
      createdBy: 'tok_parent',
      taskId: TASK,
    })
    expect(created.createdBy).toBe('tok_parent')
  })

  it('carries the role it was asked for, rather than one of its own choosing', async () => {
    const { service, seed } = build()
    await seed()
    const viewer = await service.create(AT, { ...asAdmin, role: 'view', taskId: TASK })
    const manager = await service.create(AT, { ...asAdmin, role: 'manage', taskId: TASK })
    expect([viewer.role, manager.role]).toEqual(['view', 'manage'])
  })

  it('takes the token from the id generator rather than minting one itself', async () => {
    const { service, seed } = build(idsMinting('tok_chosen_by_the_test'))
    await seed()
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(created.token).toBe('tok_chosen_by_the_test')
  })

  it('records the link in the token index, so find resolves it', async () => {
    const { service, seed, tokens } = build()
    await seed()
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(tokens.find(created.token)).toEqual({ product: 'microtask', projectId: PROJECT })
  })

  it('appends the link to the project, leaving the ones already there alone', async () => {
    const { service, seed, read } = build()
    await seed({ shareLinks: [link('tok_first')] })
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(tokensOf((await read()).shareLinks)).toEqual(['tok_first', created.token])
  })

  it('stamps the link and the project from the clock', async () => {
    const { service, seed, read } = build()
    await seed()
    const created = await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(created.createdAt).toBe(NOW)
    expect((await read()).updatedAt).toBe(NOW)
  })

  it('cleans the name it was given', async () => {
    const { service, seed } = build()
    await seed()
    const created = await service.create(AT, {
      ...asAdmin,
      name: '  Jane   at ACME  ',
      taskId: TASK,
    })
    expect(created.name).toBe('Jane at ACME')
  })

  it('rejects an empty name', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, { ...asAdmin, name: '   ', taskId: TASK })).rejects.toThrow(
      Invalid,
    )
  })

  it('goes through store.saveManifest, because a share link lives in the manifest', async () => {
    const { service, seed, calls } = build()
    await seed()
    await service.create(AT, { ...asAdmin, taskId: TASK })
    expect(calls).toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })

  it('rejects an unknown project', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(MISSING, { ...asAdmin, taskId: TASK })).rejects.toThrow(NotFound)
  })
})

describe('ShareLinkService.create scope containment', () => {
  it('rejects a link scoped to a task in another project, at creation and not only at use', async () => {
    const { service, seed } = build()
    await seed()
    const scope = { kind: 'task', projectId: ELSEWHERE, taskId: TASK } as const
    await expect(service.create(AT, { ...asAdmin, scope })).rejects.toThrow(Invalid)
  })

  it('rejects a link scoped to another project as a whole', async () => {
    const { service, seed } = build()
    await seed()
    const scope = { kind: 'project', projectId: ELSEWHERE } as const
    await expect(service.create(AT, { ...asAdmin, scope })).rejects.toThrow(Invalid)
  })

  it('writes nothing when it refuses a scope outside the project', async () => {
    const { service, seed, read, calls } = build()
    await seed()
    const scope = { kind: 'project', projectId: ELSEWHERE } as const
    await expect(service.create(AT, { ...asAdmin, scope })).rejects.toThrow(Invalid)
    expect((await read()).shareLinks).toEqual([])
    expect(calls).not.toContain('saveManifest')
  })

  it('rejects a task the project does not hold', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, { ...asAdmin, taskId: ABSENT_TASK })).rejects.toThrow(NotFound)
  })
})

describe('ShareLinkService.create token collisions', () => {
  const owned = (tokens: ShareIndex, token: string): void => {
    tokens.add(
      'microtask',
      manifest(ELSEWHERE, {
        shareLinks: [{ ...link(token), scope: { kind: 'project', projectId: ELSEWHERE } }],
      }),
    )
  }

  it('throws Conflict when the token already belongs to another project', async () => {
    const { service, seed, tokens } = build(idsMinting('tok_taken'))
    await seed()
    owned(tokens, 'tok_taken')
    await expect(service.create(AT, { ...asAdmin, taskId: TASK })).rejects.toThrow(Conflict)
  })

  it('leaves the manifest untouched, because the index is written first', async () => {
    const { service, seed, read, tokens, calls } = build(idsMinting('tok_taken'))
    await seed()
    owned(tokens, 'tok_taken')
    await expect(service.create(AT, { ...asAdmin, taskId: TASK })).rejects.toThrow(Conflict)
    expect((await read()).shareLinks).toEqual([])
    expect(calls).not.toContain('saveManifest')
  })

  it('leaves the index pointing at the project that already owned the token', async () => {
    const { service, seed, tokens } = build(idsMinting('tok_taken'))
    await seed({ shareLinks: [link('tok_mine')] })
    owned(tokens, 'tok_taken')
    await expect(service.create(AT, { ...asAdmin, taskId: TASK })).rejects.toThrow(Conflict)
    expect(tokens.find('tok_taken')).toEqual({ product: 'microtask', projectId: ELSEWHERE })
    expect(tokens.find('tok_mine')).toEqual({ product: 'microtask', projectId: PROJECT })
  })
})

describe('ShareLinkService caps', () => {
  const fill = (count: number): readonly ShareLink[] =>
    Array.from({ length: count }, (_, i) => link(`tok_${i}`))

  it('refuses to exceed the share-links-per-project cap', async () => {
    const { service, seed } = build()
    await seed({ shareLinks: fill(LIMITS.shareLinksPerProject) })
    await expect(service.create(AT, { ...asAdmin, taskId: TASK })).rejects.toThrow(/Too many/)
  })

  it('holds the cap under concurrent creates, because the count is read inside the lock', async () => {
    const { service, seed, read } = build()
    await seed({ shareLinks: fill(LIMITS.shareLinksPerProject - 1) })
    const settled = await Promise.allSettled([
      service.create(AT, { ...asAdmin, taskId: TASK }),
      service.create(AT, { ...asAdmin, taskId: TASK }),
    ])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await read()).shareLinks).toHaveLength(LIMITS.shareLinksPerProject)
  })
})

describe('ShareLinkService.list', () => {
  it('lists the project links in the order they were minted', async () => {
    const { service, seed } = build()
    await seed({ shareLinks: [link('tok_a'), link('tok_b')] })
    expect(tokensOf(await service.list(AT))).toEqual(['tok_a', 'tok_b'])
  })

  it('lists nothing for a project that has no links', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.list(AT)).resolves.toEqual([])
  })

  it('rejects an unknown project', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.list(MISSING)).rejects.toThrow(NotFound)
  })
})

describe('ShareLinkService.revoke', () => {
  it('removes the link and stops its token resolving', async () => {
    const { service, seed, read, tokens } = build()
    await seed({ shareLinks: [link('tok_a')] })
    await service.revoke(AT, 'tok_a')
    expect((await read()).shareLinks).toEqual([])
    expect(tokens.find('tok_a')).toBeNull()
  })

  it('revokes a three-level chain when the link at its head is revoked', async () => {
    const { service, seed, read, tokens } = build()
    await seed({
      shareLinks: [
        link('tok_a'),
        link('tok_b', { createdBy: 'tok_a' }),
        link('tok_c', { createdBy: 'tok_b' }),
      ],
    })
    await service.revoke(AT, 'tok_a')
    expect((await read()).shareLinks).toEqual([])
    expect(tokens.find('tok_c')).toBeNull()
  })

  it('leaves the parent of a revoked leaf alone', async () => {
    const { service, seed, read, tokens } = build()
    await seed({
      shareLinks: [
        link('tok_a'),
        link('tok_b', { createdBy: 'tok_a' }),
        link('tok_c', { createdBy: 'tok_b' }),
      ],
    })
    await service.revoke(AT, 'tok_c')
    expect(tokensOf((await read()).shareLinks)).toEqual(['tok_a', 'tok_b'])
    expect(tokens.find('tok_b')).toEqual({ product: 'microtask', projectId: PROJECT })
  })

  it('leaves the links minted through a sibling alone', async () => {
    const { service, seed, read } = build()
    await seed({
      shareLinks: [
        link('tok_a'),
        link('tok_b', { createdBy: 'tok_a' }),
        link('tok_sibling'),
        link('tok_niece', { createdBy: 'tok_sibling' }),
      ],
    })
    await service.revoke(AT, 'tok_a')
    expect(tokensOf((await read()).shareLinks)).toEqual(['tok_sibling', 'tok_niece'])
  })

  it('returns every link it revoked, so a caller can say how many went with it', async () => {
    const { service, seed } = build()
    await seed({
      shareLinks: [
        link('tok_a'),
        link('tok_b', { createdBy: 'tok_a' }),
        link('tok_c', { createdBy: 'tok_b' }),
        link('tok_untouched'),
      ],
    })
    expect(tokensOf(await service.revoke(AT, 'tok_a'))).toEqual(['tok_a', 'tok_b', 'tok_c'])
  })

  it('terminates on a createdBy cycle rather than walking it forever', async () => {
    const { service, seed, read } = build()
    await seed({
      shareLinks: [
        link('tok_a', { createdBy: 'tok_c' }),
        link('tok_b', { createdBy: 'tok_a' }),
        link('tok_c', { createdBy: 'tok_b' }),
        link('tok_untouched'),
      ],
    })
    expect(tokensOf(await service.revoke(AT, 'tok_a'))).toEqual(['tok_a', 'tok_b', 'tok_c'])
    expect(tokensOf((await read()).shareLinks)).toEqual(['tok_untouched'])
  })

  it('terminates on a link that names itself as its own parent', async () => {
    const { service, seed, read } = build()
    await seed({ shareLinks: [link('tok_a', { createdBy: 'tok_a' }), link('tok_b')] })
    await service.revoke(AT, 'tok_a')
    expect(tokensOf((await read()).shareLinks)).toEqual(['tok_b'])
  })

  it('stamps the project, because revoking is an edit', async () => {
    const { service, seed, read } = build()
    await seed({ shareLinks: [link('tok_a')], updatedAt: STAMP })
    await service.revoke(AT, 'tok_a')
    expect((await read()).updatedAt).toBe(NOW)
  })

  it('goes through store.saveManifest, because a share link lives in the manifest', async () => {
    const { service, seed, calls } = build()
    await seed({ shareLinks: [link('tok_a')] })
    await service.revoke(AT, 'tok_a')
    expect(calls).toContain('saveManifest')
    expect(calls).not.toContain('saveTask')
  })

  it('rejects an unknown token rather than reporting success', async () => {
    const { service, seed, read } = build()
    await seed({ shareLinks: [link('tok_a')] })
    await expect(service.revoke(AT, 'tok_zzz')).rejects.toThrow(NotFound)
    expect((await read()).shareLinks).toHaveLength(1)
  })

  it('rejects an unknown project', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.revoke(MISSING, 'tok_a')).rejects.toThrow(NotFound)
  })
})
