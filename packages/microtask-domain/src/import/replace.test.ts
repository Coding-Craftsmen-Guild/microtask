import { describe, expect, it } from 'vitest'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { sequentialIds } from '../testing/doubles.js'
import { folder, manifest, STAMP, taskDocument, taskEntry } from '../testing/fixtures.js'
import type { ConvertedProject } from './legacy.js'
import { remintProject } from './remint.js'
import { replaceProject } from './replace.js'

const marked = (mark: string, index: number): string =>
  `${mark}${String(index).padStart(26 - mark.length, '0')}`

const P1 = marked('01P', 1)
const CA = marked('01T', 1)
const CB = marked('01T', 2)
const CC = marked('01T', 3)
const CD = marked('01T', 4)
const B1 = marked('01B', 1)
const B2 = marked('01B', 2)
const B4 = marked('01B', 4)
const F1 = marked('01F', 1)
const F2 = marked('01F', 2)

const OLDER = '2026-01-01T00:00:00.000Z'
const BUNDLED = '2026-05-05T05:05:05.000Z'

const token = (index: number): string => `tok_${String(index).padStart(16, '0')}`

const SHARED = token(101)
const UNMENTIONED = token(102)
const FRESH = token(103)

const linkAt = (value: string, overrides: Partial<ShareLink> = {}): ShareLink => ({
  token: value,
  name: 'Sam at ACME',
  role: 'view',
  scope: { kind: 'project', projectId: P1 },
  createdBy: null,
  createdAt: STAMP,
  ...overrides,
})

const KEPT = linkAt(UNMENTIONED, { name: 'Long-standing client', role: 'write' })

const current = (): ProjectManifest =>
  manifest(P1, {
    name: 'Launch as it stands',
    folders: [folder(F1, 'Clients as they stand')],
    tasks: [
      taskEntry(CA, 'Alpha as it stands'),
      taskEntry(CB, 'Beta as it stands', { position: 1 }),
      taskEntry(CC, 'Gamma, which the bundle drops', { position: 2 }),
    ],
    shareLinks: [linkAt(SHARED, { name: 'Manager as it stands', role: 'view' }), KEPT],
    createdAt: OLDER,
    updatedAt: OLDER,
  })

const incoming = (): ConvertedProject => ({
  manifest: manifest(P1, {
    name: 'Launch as the bundle has it',
    folders: [
      folder(F1, 'Clients as the bundle has them'),
      folder(F2, 'Prospects, which the bundle adds'),
    ],
    tasks: [
      taskEntry(CA, 'Alpha'),
      taskEntry(CB, 'Beta', { position: 1 }),
      taskEntry(CD, 'Delta, which the bundle adds', { position: 2 }),
    ],
    shareLinks: [
      linkAt(SHARED, { name: 'Manager as the bundle has it', role: 'manage' }),
      linkAt(FRESH, { name: 'New client' }),
    ],
    createdAt: BUNDLED,
    updatedAt: BUNDLED,
  }),
  documents: [taskDocument(CA, B1), taskDocument(CB, B2), taskDocument(CD, B4)],
})

const tokensOf = (of: ProjectManifest): readonly string[] => of.shareLinks.map((one) => one.token)

const taskIdsOf = (of: ProjectManifest): readonly string[] => of.tasks.map((entry) => entry.id)

describe('replace preserves the tokens import as new remints', () => {
  it('carries every token the bundle holds through unchanged, so live client links keep working', () => {
    const out = replaceProject(incoming(), current())
    expect(tokensOf(out.project.manifest)).toContain(SHARED)
    expect(tokensOf(out.project.manifest)).toContain(FRESH)
    expect(tokensOf(out.project.manifest)).not.toEqual(
      tokensOf(remintProject(incoming(), sequentialIds()).manifest),
    )
  })

  it('leaves every token the project already held resolvable, including a delegated lineage', () => {
    const parent = linkAt(SHARED, { name: 'Manager as it stands' })
    const child = linkAt(UNMENTIONED, { name: 'Delegated', createdBy: SHARED })
    const before = { ...current(), shareLinks: [parent, child] }
    const out = replaceProject(incoming(), before)
    const held = new Set(tokensOf(out.project.manifest))
    expect(tokensOf(before).filter((one) => !held.has(one))).toEqual([])
    const lineage = out.project.manifest.shareLinks.map((one) => one.createdBy)
    expect(lineage.filter((one) => one !== null && !held.has(one))).toEqual([])
  })
})

describe('replace preserves the project identity', () => {
  it('keeps the project id and the ids of every task the bundle carries, not fresh ones', () => {
    const out = replaceProject(incoming(), current())
    expect(out.project.manifest.id).toBe(P1)
    expect(taskIdsOf(out.project.manifest)).toEqual([CA, CB, CD])
    expect(out.project.documents.map((one) => one.id)).toEqual([CA, CB, CD])
  })

  it('writes the timestamps the bundle carries rather than the ones already on disk', () => {
    const out = replaceProject(incoming(), current())
    expect(out.project.manifest.createdAt).toBe(BUNDLED)
    expect(out.project.manifest.updatedAt).toBe(BUNDLED)
  })

  it('takes the bundle version of a link both hold, the bundle being what is being imported', () => {
    const out = replaceProject(incoming(), current())
    const shared = out.project.manifest.shareLinks.find((one) => one.token === SHARED) as ShareLink
    expect(shared.role).toBe('manage')
    expect(shared.name).toBe('Manager as the bundle has it')
  })

  it('takes the bundle project name and folders, which a stale re-import would otherwise keep', () => {
    const out = replaceProject(incoming(), current())
    expect(out.project.manifest.name).toBe('Launch as the bundle has it')
    expect(out.project.manifest.name).not.toBe(current().name)
    expect(out.project.manifest.folders).toEqual(incoming().manifest.folders)
    expect(out.project.manifest.folders).not.toEqual(current().folders)
  })
})

describe('replace removes the tasks the bundle does not carry, being a replace and not a merge', () => {
  it('names exactly the task ids on disk the bundle does not, so their files can be deleted', () => {
    const out = replaceProject(incoming(), current())
    expect(out.removedTaskIds).toEqual([CC])
  })

  it('drops the removed entry from the manifest and keeps the one the bundle adds', () => {
    const out = replaceProject(incoming(), current())
    expect(taskIdsOf(out.project.manifest)).not.toContain(CC)
    expect(taskIdsOf(out.project.manifest)).toContain(CD)
    expect(out.project.manifest.tasks.map((entry) => entry.name)).toEqual([
      'Alpha',
      'Beta',
      'Delta, which the bundle adds',
    ])
  })

  it('removes nothing when the bundle carries every task already there', () => {
    const before = { ...current(), tasks: [taskEntry(CA, 'Alpha'), taskEntry(CB, 'Beta')] }
    expect(replaceProject(incoming(), before).removedTaskIds).toEqual([])
  })
})

describe('replace keeps the share links the bundle does not mention', () => {
  it('keeps an existing link exactly as it stands, rather than dropping access nobody revoked', () => {
    const out = replaceProject(incoming(), current())
    const kept = out.project.manifest.shareLinks.find(
      (one) => one.token === UNMENTIONED,
    ) as ShareLink
    expect(kept).toEqual(KEPT)
  })

  it('puts the bundle links first and the kept ones after, so an empty store round-trips', () => {
    const out = replaceProject(incoming(), current())
    expect(tokensOf(out.project.manifest)).toEqual([SHARED, FRESH, UNMENTIONED])
    const fresh = replaceProject(incoming(), { ...current(), shareLinks: [] })
    expect(tokensOf(fresh.project.manifest)).toEqual([SHARED, FRESH])
  })
})
