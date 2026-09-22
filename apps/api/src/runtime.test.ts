import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isShareToken, isUlid } from '@repo/kernel'
import { planManifest } from '@repo/macroplan-domain/testing'
import { manifest } from '@repo/microtask-domain/testing'
import { readConfig } from './config.js'
import { buildRuntimeDeps, warmTokenIndex } from './runtime.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAR'
const N1 = '01M240ERCRWWCN16Q5AHP1FZN1'
const TOKEN_A = 'shr_seat_one_token_value_a'
const TOKEN_B = 'shr_seat_two_token_value_b'
const TOKEN_P = 'shr_seat_plan_token_value'

const link = (token: string, projectId: string) => ({
  token,
  name: 'Client',
  role: 'view' as const,
  scope: { kind: 'project' as const, projectId },
  createdBy: null,
  createdAt: '2026-09-10T00:00:00.000Z',
})

const planLink = (token: string) => ({
  token,
  name: 'Client',
  role: 'view' as const,
  createdBy: null,
  createdAt: '2026-09-10T00:00:00.000Z',
})

let root: string

const configFor = (dataDir: string) =>
  readConfig({
    DATA_DIR: dataDir,
    ADMIN_PASSWORD: 'correct horse battery staple',
    SESSION_SECRET: 's'.repeat(32),
    SERVICE_KEYS: 'microtask=k-microtask',
  })

function writeManifest(projectId: string, shareLinks: readonly ReturnType<typeof link>[]): void {
  const dir = join(root, 'microtask', 'projects', projectId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'project.json'), JSON.stringify(manifest(projectId, { shareLinks })))
}

function writePlan(
  product: string,
  planId: string,
  shareLinks: readonly ReturnType<typeof planLink>[],
): void {
  const dir = join(root, product, 'plans', planId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(planManifest(planId, { shareLinks })))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'api-runtime-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('buildRuntimeDeps chooses one concrete adapter per port', () => {
  it('reads projects from the configured data root rather than from the working directory', async () => {
    writeManifest(P1, [])
    const deps = buildRuntimeDeps(configFor(root))
    const found = await deps.store.readManifest('microtask', P1)
    expect(found?.id).toBe(P1)
  })

  it('sees nothing when the data root holds nothing, rather than falling back to a default', async () => {
    const deps = buildRuntimeDeps(configFor(join(root, 'empty')))
    expect(await deps.store.listManifests('microtask')).toEqual([])
  })

  it('generates real identifiers, so two calls never collide', () => {
    const deps = buildRuntimeDeps(configFor(root))
    expect(isUlid(deps.ids.entityId())).toBe(true)
    expect(isShareToken(deps.ids.token())).toBe(true)
    expect(deps.ids.entityId()).not.toBe(deps.ids.entityId())
  })

  it('reads a real clock, so two writes a moment apart carry different stamps', () => {
    const deps = buildRuntimeDeps(configFor(root))
    expect(deps.clock.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/u)
    expect(new Date(deps.clock.now()).getTime()).toBeGreaterThan(0)
  })
})

describe('warmTokenIndex is what makes a share link survive a restart', () => {
  it('resolves no token at all before it runs, which is the 401 a cold start would answer', () => {
    const deps = buildRuntimeDeps(configFor(root))
    expect(deps.tokens.find(TOKEN_A)).toBeNull()
  })

  it('indexes every share link already on disk, across every project', async () => {
    writeManifest(P1, [link(TOKEN_A, P1)])
    writeManifest(P2, [link(TOKEN_B, P2)])
    const deps = buildRuntimeDeps(configFor(root))
    expect(await warmTokenIndex(deps)).toBe(2)
    expect(deps.tokens.find(TOKEN_A)).toEqual({ product: 'microtask', containerId: P1 })
    expect(deps.tokens.find(TOKEN_B)).toEqual({ product: 'microtask', containerId: P2 })
  })

  it('indexes a plan’s share links too, or every Macroplan link answers 401 after a restart', async () => {
    writePlan('macroplan', N1, [planLink(TOKEN_P)])
    const deps = buildRuntimeDeps(configFor(root))
    expect(await warmTokenIndex(deps)).toBe(1)
    expect(deps.tokens.find(TOKEN_P)).toEqual({ product: 'macroplan', containerId: N1 })
  })

  it('reads each product through its own store, so a stray plan cannot evict a project’s tokens', async () => {
    writeManifest(P1, [link(TOKEN_A, P1)])
    writePlan('microtask', P1, [planLink(TOKEN_P)])
    const deps = buildRuntimeDeps(configFor(root))
    expect(await warmTokenIndex(deps)).toBe(1)
    expect(deps.tokens.find(TOKEN_A)).toEqual({ product: 'microtask', containerId: P1 })
    expect(deps.tokens.find(TOKEN_P)).toBeNull()
  })

  it('counts nothing and throws nothing when a product has no data directory yet', async () => {
    const deps = buildRuntimeDeps(configFor(join(root, 'absent')))
    expect(await warmTokenIndex(deps)).toBe(0)
  })

  it('still resolves nothing for a token no manifest holds', async () => {
    writeManifest(P1, [link(TOKEN_A, P1)])
    const deps = buildRuntimeDeps(configFor(root))
    await warmTokenIndex(deps)
    expect(deps.tokens.find(TOKEN_B)).toBeNull()
  })
})
