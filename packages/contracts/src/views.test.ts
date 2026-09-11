import { describe, expect, it } from 'vitest'
import { LIMITS } from './limits.js'
import { ProjectList, ProjectListItem, ProjectView } from './views.js'
import { TaskEntry } from './task.js'

const ID = '01M240ERCRWWCN16Q5AHP1FZAQ'
const STAMP = '2026-09-10T00:00:00.000Z'
const TOKEN = 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7'

const TAB_NAME_CAP = 8

const entry = (over: Record<string, unknown> = {}): unknown => ({
  id: ID,
  name: 'Go-live',
  position: 0,
  folderId: null,
  progress: { done: 1, total: 3 },
  updatedAt: STAMP,
  tabCount: 1,
  tabNames: ['General'],
  ...over,
})

const shareLink = {
  token: TOKEN,
  name: 'Acme',
  role: 'view',
  scope: { kind: 'project', projectId: ID },
  createdBy: null,
  createdAt: STAMP,
}

const project = (over: Record<string, unknown> = {}): unknown => ({
  id: ID,
  name: 'Launch',
  folders: [],
  tasks: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

describe('TaskEntry carries what a list row renders (ADR 0034)', () => {
  it('accepts the three new cache fields', () => {
    expect(TaskEntry.safeParse(entry()).error?.issues ?? []).toEqual([])
  })

  it.each(['updatedAt', 'tabCount', 'tabNames'])('requires %s rather than leaving it optional', (key) => {
    const { [key]: dropped, ...without } = entry() as Record<string, unknown>
    expect(dropped).toBeDefined()
    expect(TaskEntry.safeParse(without).success).toBe(false)
  })

  it('caps tabNames at eight, matching the chips the app being replaced drew', () => {
    const names = (count: number): unknown =>
      entry({ tabCount: count, tabNames: Array.from({ length: count }, (_, i) => `Tab ${String(i)}`) })
    expect(TaskEntry.safeParse(names(TAB_NAME_CAP)).success).toBe(true)
    expect(TaskEntry.safeParse(names(TAB_NAME_CAP + 1)).success).toBe(false)
  })

  it('lets tabCount exceed the names it carries, which is what "+N more" is computed from', () => {
    const twelve = entry({
      tabCount: 12,
      tabNames: Array.from({ length: TAB_NAME_CAP }, (_, i) => `Tab ${String(i)}`),
    })
    const parsed = TaskEntry.safeParse(twelve)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.data?.tabCount).toBe(12)
    expect(parsed.data?.tabNames).toHaveLength(TAB_NAME_CAP)
  })

  it('bounds tabCount by the tabs a task may hold, so the two numbers cannot disagree', () => {
    expect(TaskEntry.safeParse(entry({ tabCount: LIMITS.tabsPerTask })).success).toBe(true)
    expect(TaskEntry.safeParse(entry({ tabCount: LIMITS.tabsPerTask + 1 })).success).toBe(false)
    expect(TaskEntry.safeParse(entry({ tabCount: -1 })).success).toBe(false)
  })
})

describe('a project in a list carries a count and never a link (ADR 0033)', () => {
  it('has no shareLinks key at all, so no token can travel in a list', () => {
    expect(Object.keys(ProjectListItem.shape)).not.toContain('shareLinks')
  })

  it('strips a shareLinks array a caller tried to hand it', () => {
    const parsed = ProjectListItem.parse(project({ shareLinks: [shareLink] }))
    expect(JSON.stringify(parsed)).not.toContain(TOKEN)
    expect(parsed).not.toHaveProperty('shareLinks')
  })

  it('accepts the count, and accepts its absence, because the key is gated like the links were', () => {
    expect(ProjectListItem.safeParse(project({ shareLinkCount: 4 })).error?.issues ?? []).toEqual([])
    expect(ProjectListItem.safeParse(project()).success).toBe(true)
  })

  it('bounds the count by the links a project may hold', () => {
    const cap = LIMITS.shareLinksPerProject
    expect(ProjectListItem.safeParse(project({ shareLinkCount: cap })).success).toBe(true)
    expect(ProjectListItem.safeParse(project({ shareLinkCount: cap + 1 })).success).toBe(false)
    expect(ProjectListItem.safeParse(project({ shareLinkCount: -1 })).success).toBe(false)
  })

  it('is what a list is made of, so the list cannot carry the read shape by accident', () => {
    const parsed = ProjectList.parse({ projects: [project({ shareLinks: [shareLink] })] })
    expect(JSON.stringify(parsed)).not.toContain(TOKEN)
  })

  it('still requires the folders and tasks a row renders from', () => {
    const { tasks: dropped, ...withoutTasks } = project() as Record<string, unknown>
    expect(dropped).toEqual([])
    expect(ProjectListItem.safeParse(withoutTasks).success).toBe(false)
  })
})

describe('the read shape keeps the links, which is the only place a token appears', () => {
  it('carries shareLinks when the caller clears share:read', () => {
    const parsed = ProjectView.parse(project({ shareLinks: [shareLink] }))
    expect(JSON.stringify(parsed)).toContain(TOKEN)
  })

  it('omits the key entirely for a caller that does not, which is the admin-block discriminator', () => {
    const parsed = ProjectView.parse(project())
    expect(parsed.shareLinks).toBeUndefined()
    expect(parsed).not.toHaveProperty('shareLinks')
  })

  it('has no shareLinkCount, so the two shapes cannot be mistaken for one another', () => {
    expect(Object.keys(ProjectView.shape)).not.toContain('shareLinkCount')
  })
})
