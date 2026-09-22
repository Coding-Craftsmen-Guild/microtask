import { describe, expect, it } from 'vitest'
import * as contracts from './index.js'
import { LIMITS, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_DEPTH, MAX_ESTIMATE_DAYS, MAX_SPRINT_LENGTH_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from './limits.js'

const ID = '01M240ERCRWWCN16Q5AHP1FZAQ'
const STAMP = '2026-09-10T00:00:00.000Z'

const folder = { id: ID, name: 'Inbox', position: 0, createdAt: STAMP, updatedAt: STAMP }

const task = {
  id: ID,
  name: 'Ship it',
  position: 0,
  folderId: null,
  progress: { done: 0, total: 0 },
  updatedAt: STAMP,
  tabCount: 0,
  tabNames: [],
}

const shareLink = {
  token: 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7',
  name: 'Client',
  role: 'view',
  scope: { kind: 'project', projectId: ID },
  createdBy: null,
  createdAt: STAMP,
}

const tab = { id: ID, name: 'General', position: 0, document: { type: 'doc' }, createdAt: STAMP, updatedAt: STAMP }

const fill = <T,>(count: number, one: T): readonly T[] => Array.from({ length: count }, () => one)

const manifestWith = (over: Record<string, unknown>): unknown => ({
  id: ID,
  name: 'Launch',
  folders: [],
  tasks: [],
  shareLinks: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

describe('the caps a form enforces before a request is worth sending (ADR 0036)', () => {
  it('names every collection this product bounds', () => {
    expect(LIMITS).toEqual({
      nameLength: 80,
      tabsPerTask: 40,
      tasksPerProject: 500,
      foldersPerProject: 100,
      shareLinksPerProject: 50,
      projectsPerProduct: 500,
      plansPerProduct: 200,
      epicsPerPlan: 40,
      featuresPerPlan: 200,
      itemsPerPlan: 2_000,
      edgesPerPlan: 400,
      shareLinksPerPlan: 50,
    })
  })

  it('bounds a document in bytes and in depth, which is what a 413 and a rejected paste mean', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(2_000_000)
    expect(MAX_DOCUMENT_DEPTH).toBe(100)
  })

  it('bounds estimates, sprints, and item descriptions', () => {
    expect(MAX_ESTIMATE_DAYS).toBe(1_000)
    expect(MAX_SPRINT_LENGTH_DAYS).toBe(60)
    expect(MAX_ITEM_DESCRIPTION_BYTES).toBe(8_192)
  })

  it('is reachable from the barrel, because an app may import nothing else', () => {
    expect(contracts.LIMITS).toBe(LIMITS)
    expect(contracts.MAX_DOCUMENT_BYTES).toBe(MAX_DOCUMENT_BYTES)
    expect(contracts.MAX_DOCUMENT_DEPTH).toBe(MAX_DOCUMENT_DEPTH)
    expect(contracts.MAX_ESTIMATE_DAYS).toBe(MAX_ESTIMATE_DAYS)
    expect(contracts.MAX_SPRINT_LENGTH_DAYS).toBe(MAX_SPRINT_LENGTH_DAYS)
    expect(contracts.MAX_ITEM_DESCRIPTION_BYTES).toBe(MAX_ITEM_DESCRIPTION_BYTES)
  })
})

describe('the schemas take their bounds from LIMITS rather than restating them', () => {
  it('bounds a name at LIMITS.nameLength', () => {
    expect(contracts.EntityName.safeParse('x'.repeat(LIMITS.nameLength)).success).toBe(true)
    expect(contracts.EntityName.safeParse('x'.repeat(LIMITS.nameLength + 1)).success).toBe(false)
  })

  it('bounds a task document at LIMITS.tabsPerTask', () => {
    const of = (count: number): unknown => ({ id: ID, tabs: fill(count, tab), createdAt: STAMP, updatedAt: STAMP })
    expect(contracts.TaskDocument.safeParse(of(LIMITS.tabsPerTask)).success).toBe(true)
    expect(contracts.TaskDocument.safeParse(of(LIMITS.tabsPerTask + 1)).success).toBe(false)
  })

  it.each([
    ['folders', 'foldersPerProject', folder],
    ['tasks', 'tasksPerProject', task],
    ['shareLinks', 'shareLinksPerProject', shareLink],
  ] as const)('bounds %s at LIMITS.%s', (key, limit, one) => {
    const cap = LIMITS[limit]
    expect(contracts.ProjectManifest.safeParse(manifestWith({ [key]: fill(cap, one) })).success).toBe(true)
    expect(contracts.ProjectManifest.safeParse(manifestWith({ [key]: fill(cap + 1, one) })).success).toBe(false)
  })
})
