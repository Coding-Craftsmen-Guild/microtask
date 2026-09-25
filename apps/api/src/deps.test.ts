import { describe, expect, it } from 'vitest'
import { ShareIndex, shareToken, ulid, type Clock, type IdGenerator } from '@repo/kernel'
import { FsPlanStore } from '@repo/macroplan-domain'
import { FsProjectStore, type ServiceContext } from '@repo/microtask-domain'
import { NodeFileSystem, QueueLock } from '@repo/store'
import { readConfig } from './config.js'
import type { ApiDeps } from './deps.js'

const config = readConfig({
  DATA_DIR: '/srv/data',
  ADMIN_PASSWORD: 'correct horse battery',
  SESSION_SECRET: 's'.repeat(32),
  BRIDGE_SECRET: 'b'.repeat(32),
  SERVICE_KEYS: 'microtask=k-microtask',
})

const buildDeps = (): ApiDeps => {
  const fileSystem = new NodeFileSystem()
  const clock: Clock = { now: () => new Date().toISOString() }
  const ids: IdGenerator = { entityId: ulid, token: shareToken }
  return {
    config,
    fileSystem,
    store: new FsProjectStore({ files: fileSystem, root: () => config.dataDir }),
    plans: new FsPlanStore({ files: fileSystem, root: () => config.dataDir }),
    lock: new QueueLock(),
    clock,
    ids,
    tokens: new ShareIndex(),
  }
}

describe('ApiDeps', () => {
  it('destructures straight into a ServiceContext, so no member needs renaming at the seam', () => {
    const { store, lock, clock, ids, tokens } = buildDeps()
    const context: ServiceContext = { store, lock, clock, ids, tokens }
    expect(Object.keys(context).sort()).toEqual(['clock', 'ids', 'lock', 'store', 'tokens'])
  })

  it('is assignable to ServiceContext whole, because it is a superset with the same names', () => {
    const context: ServiceContext = buildDeps()
    expect(context.tokens.find('nothing')).toBeNull()
  })

  it('carries the config alongside the ports, which ServiceContext deliberately does not', () => {
    expect(buildDeps().config.serviceKeys.get('k-microtask')).toBe('microtask')
  })

  it('names the token index tokens, not shareIndex, because ADR 0030 made it a port', () => {
    expect(buildDeps()).toHaveProperty('tokens')
    expect(buildDeps()).not.toHaveProperty('shareIndex')
  })

  it('keeps fileSystem, which FsProjectStore needs at construction', () => {
    expect(typeof buildDeps().fileSystem.readText).toBe('function')
  })

  it('is satisfiable by the real adapters, so the manifest edges resolve at runtime', async () => {
    const deps = buildDeps()
    expect(await deps.lock.run(async () => 'ran')).toBe('ran')
    expect(deps.ids.entityId()).toHaveLength(26)
    expect(deps.clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
