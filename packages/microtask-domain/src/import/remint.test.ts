import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Conflict, isShareToken, isUlid } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TaskDocument } from '../entities/task.js'
import { emptyDocument } from '../entities/document.js'
import { assertContained } from '../services/share-link-mapper.js'
import { ShareLinkService } from '../services/share-link-service.js'
import { taskFile } from '../storage/paths.js'
import { ShareIndex } from '../storage/share-index.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import {
  folder,
  manifest,
  marked,
  shareLink,
  STAMP,
  taskDocument,
  taskEntry,
  token,
} from '../testing/fixtures.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { checkImport, type CheckedProject, type ImportTarget } from './checks.js'
import { convertLegacyProject, type ConvertedProject } from './legacy.js'
import { remintProject } from './remint.js'

const ROOT = path.resolve('/data')

const NOW = '2026-09-12T12:00:00.000Z'

const P1 = marked('01P', 1)
const T1 = marked('01T', 1)
const T2 = marked('01T', 2)
const T3 = marked('01T', 3)
const B1 = marked('01B', 1)
const B2 = marked('01B', 2)
const B3 = marked('01B', 3)
const F1 = marked('01F', 1)

const PARENT = token(101)
const CHILD = token(102)
const GRANDCHILD = token(103)
const STRANGER = token(104)
const ABSENT = token(999)

const linkAt = (value: string, overrides: Partial<ShareLink> = {}): ShareLink =>
  shareLink(value, P1, overrides)

const source = (): ConvertedProject => ({
  manifest: manifest(P1, {
    folders: [folder(F1, 'Clients')],
    tasks: [
      taskEntry(T1, 'Alpha', { folderId: F1 }),
      taskEntry(T2, 'Beta', { position: 1 }),
      taskEntry(T3, 'Gamma', { position: 2 }),
    ],
    shareLinks: [
      linkAt(PARENT, { name: 'Manager', role: 'manage' }),
      linkAt(CHILD, {
        name: 'Client',
        createdBy: PARENT,
        scope: { kind: 'task', projectId: P1, taskId: T2 },
      }),
      linkAt(GRANDCHILD, { name: 'Subcontractor', createdBy: CHILD }),
      linkAt(STRANGER, { name: 'Stranger', createdBy: ABSENT }),
    ],
  }),
  documents: [taskDocument(T3, B3), taskDocument(T1, B1), taskDocument(T2, B2)],
})

const tokensOf = (project: ConvertedProject): readonly string[] =>
  project.manifest.shareLinks.map((one) => one.token)

const taskIdsOf = (project: ConvertedProject): readonly string[] =>
  project.manifest.tasks.map((entry) => entry.id)

const linkNamed = (project: ConvertedProject, name: string): ShareLink =>
  project.manifest.shareLinks.find((one) => one.name === name) as ShareLink

const idNamed = (project: ConvertedProject, name: string): string =>
  (project.manifest.tasks.find((entry) => entry.name === name) as { readonly id: string }).id

const fileFor = (project: ConvertedProject, taskId: string): string =>
  taskFile(ROOT, 'microtask', project.manifest.id, taskId)

const fileHolding = (project: ConvertedProject, tabId: string): string =>
  fileFor(
    project,
    (project.documents.find((one) => one.tabs.some((tab) => tab.id === tabId)) as TaskDocument).id,
  )

const owning = (of: ProjectManifest): ShareIndex => {
  const index = new ShareIndex()
  index.add('microtask', of)
  return index
}

const targeting = (of: ProjectManifest): ImportTarget => ({
  product: 'microtask',
  tokens: owning(of),
  projectIds: [of.id],
})

const checked = (project: ConvertedProject, at: ImportTarget): CheckedProject => {
  const drop = { shape: 'converted' as const, path: 'export.json', converted: project }
  return checkImport([drop], at)[0] as CheckedProject
}

const withTokensOf = (project: ConvertedProject, from: ConvertedProject): ConvertedProject => ({
  ...project,
  manifest: {
    ...project.manifest,
    shareLinks: project.manifest.shareLinks.map((link, index) => ({
      ...link,
      token: (from.manifest.shareLinks[index] as ShareLink).token,
      createdBy: null,
    })),
  },
})

const revoking = async (
  project: ConvertedProject,
  cut: string,
): Promise<{ readonly gone: readonly ShareLink[]; readonly after: ProjectManifest }> => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  await store.saveManifest('microtask', project.manifest)
  tokens.add('microtask', project.manifest)
  const service = new ShareLinkService({
    store,
    tokens,
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(500),
  })
  const at = { product: 'microtask' as const, projectId: project.manifest.id }
  const gone = await service.revoke(at, cut)
  const after = await store.readManifest('microtask', project.manifest.id)
  return { gone, after: after as ProjectManifest }
}

describe('the project id, and every reference that has to move with it', () => {
  it('mints a fresh ULID project id rather than keeping the one the bundle carried', () => {
    const out = remintProject(source(), sequentialIds())
    expect(out.manifest.id).not.toBe(P1)
    expect(isUlid(out.manifest.id)).toBe(true)
  })

  it('moves every share link scope onto the new project id, project-scoped and task-scoped', () => {
    const out = remintProject(source(), sequentialIds())
    expect(out.manifest.shareLinks).toHaveLength(4)
    for (const link of out.manifest.shareLinks) {
      expect(link.scope.projectId).toBe(out.manifest.id)
      expect(link.scope.projectId).not.toBe(P1)
    }
    expect(out.manifest.shareLinks.map((one) => one.scope.kind)).toEqual([
      'project',
      'task',
      'project',
      'project',
    ])
  })

  it('leaves everything about the project the copy is entitled to keep', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    expect(out.manifest.name).toBe(before.manifest.name)
    expect(out.manifest.createdAt).toBe(STAMP)
    expect(out.manifest.updatedAt).toBe(STAMP)
    expect(out.manifest.folders).toEqual(before.manifest.folders)
    expect(out.manifest.tasks.map((entry) => entry.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(out.manifest.tasks.map((entry) => entry.position)).toEqual([0, 1, 2])
  })
})

describe('the share tokens, which import as new may not preserve', () => {
  it('mints a new token for every link, none of them a token the bundle carried', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    const carried = new Set(tokensOf(before))
    expect(tokensOf(out)).toHaveLength(4)
    expect(tokensOf(out).filter((one) => carried.has(one))).toEqual([])
    expect(new Set(tokensOf(out)).size).toBe(4)
  })

  it('mints tokens that are still share tokens, so the revocation surface still reaches them', () => {
    const out = remintProject(source(), sequentialIds())
    expect(tokensOf(out).filter((one) => !isShareToken(one))).toEqual([])
  })

  it('keeps every link and everything about it the copy is entitled to keep', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    expect(out.manifest.shareLinks.map((one) => one.name)).toEqual([
      'Manager',
      'Client',
      'Subcontractor',
      'Stranger',
    ])
    expect(out.manifest.shareLinks.map((one) => one.role)).toEqual([
      'manage',
      'view',
      'view',
      'view',
    ])
    expect(out.manifest.shareLinks.map((one) => one.createdAt)).toEqual([
      STAMP,
      STAMP,
      STAMP,
      STAMP,
    ])
  })
})

describe('exhaustiveness, which ADR 0019 requires and a spread cannot give', () => {
  it('leaves no id or token the bundle carried anywhere in the reminted project', () => {
    const json = JSON.stringify(remintProject(source(), sequentialIds()))
    for (const gone of [P1, T1, T2, T3, PARENT, CHILD, GRANDCHILD, STRANGER]) {
      expect(json).not.toContain(gone)
    }
  })

  it('carries a document the manifest names no entry for through on its old id, for the checks', () => {
    const before = source()
    const stray = taskDocument(marked('01T', 9), marked('01B', 9))
    const out = remintProject({ ...before, documents: [...before.documents, stray] }, sequentialIds())
    expect(out.documents.map((one) => one.id)).toContain(marked('01T', 9))
    const result = checked(out, targeting(before.manifest))
    expect(result.outcome).toBe('blocked')
    expect(result.reasons).toContain(
      `The drop carries documents the manifest names no task for: "${marked('01T', 9)}"`,
    )
  })
})

describe('the task ids, and the filenames that have to follow them', () => {
  it('mints a new task id for every manifest entry, none of them an id the bundle carried', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    const carried = new Set(taskIdsOf(before))
    expect(taskIdsOf(out)).toHaveLength(3)
    expect(taskIdsOf(out).filter((one) => carried.has(one))).toEqual([])
    expect(new Set(taskIdsOf(out)).size).toBe(3)
  })

  it('writes each document to the file its own manifest entry names, not to a positional one', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    expect(fileHolding(out, B1)).toBe(fileFor(out, idNamed(out, 'Alpha')))
    expect(fileHolding(out, B2)).toBe(fileFor(out, idNamed(out, 'Beta')))
    expect(fileHolding(out, B3)).toBe(fileFor(out, idNamed(out, 'Gamma')))
    expect(fileHolding(out, B1)).not.toBe(fileHolding(before, B1))
  })

  it('renames every task file, so no file is left on an id the new manifest does not name', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    const named = new Set(taskIdsOf(out))
    const carried = new Set(taskIdsOf(before))
    expect(out.documents.map((one) => one.id).filter((id) => !named.has(id))).toEqual([])
    expect(out.documents.map((one) => one.id).filter((id) => carried.has(id))).toEqual([])
    expect(named.size).toBe(out.documents.length)
  })

  it('leaves the folder ids and the inner tab ids alone, nothing outside a project naming either', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    expect(out.manifest.folders.map((one) => one.id)).toEqual([F1])
    expect(out.manifest.tasks.map((entry) => entry.folderId)).toEqual([F1, null, null])
    expect(out.documents.flatMap((one) => one.tabs.map((tab) => tab.id)).sort()).toEqual([
      B1,
      B2,
      B3,
    ])
  })
})

describe('a task-scoped share link, which names a task id of its own', () => {
  it('rewrites scope.taskId to the new id of the task it named, not to the first task', () => {
    const out = remintProject(source(), sequentialIds())
    expect(linkNamed(out, 'Client').scope).toEqual({
      kind: 'task',
      projectId: out.manifest.id,
      taskId: idNamed(out, 'Beta'),
    })
    expect(linkNamed(out, 'Client').scope).not.toEqual({
      kind: 'task',
      projectId: P1,
      taskId: T2,
    })
    expect(idNamed(out, 'Beta')).not.toBe(idNamed(out, 'Alpha'))
  })

  it('still resolves inside its project, where the scope it arrived with no longer would', () => {
    const out = remintProject(source(), sequentialIds())
    expect(() => {
      assertContained(out.manifest, linkNamed(out, 'Client').scope)
    }).not.toThrow()
    expect(() => {
      assertContained(out.manifest, linkNamed(source(), 'Client').scope)
    }).toThrow()
  })

  it('keeps a scope naming a task the project has not, so the preview refuses it rather than this', () => {
    const before = source()
    const stray = { kind: 'task' as const, projectId: P1, taskId: marked('01T', 9) }
    const strayed = {
      ...before,
      manifest: {
        ...before.manifest,
        shareLinks: [linkAt(PARENT, { name: 'Manager', scope: stray })],
      },
    }
    const out = remintProject(strayed, sequentialIds())
    expect(linkNamed(out, 'Manager').scope).toEqual({
      kind: 'task',
      projectId: out.manifest.id,
      taskId: marked('01T', 9),
    })
    expect(out.manifest.id).not.toBe(P1)
    expect(checked(out, targeting(manifest(P1))).outcome).toBe('blocked')
  })
})

describe('the createdBy lineage, which revocation walks inside the new project', () => {
  it('names the new parent token, so the child is not left pointing at a token nothing holds', () => {
    const out = remintProject(source(), sequentialIds())
    expect(linkNamed(out, 'Client').createdBy).toBe(linkNamed(out, 'Manager').token)
    expect(linkNamed(out, 'Subcontractor').createdBy).toBe(linkNamed(out, 'Client').token)
    expect(linkNamed(out, 'Client').createdBy).not.toBe(PARENT)
  })

  it('lets revoking the new project parent still cut the links delegated through it', async () => {
    const out = remintProject(source(), sequentialIds())
    const { gone, after } = await revoking(out, linkNamed(out, 'Manager').token)
    expect(gone.map((one) => one.name).sort()).toEqual(['Client', 'Manager', 'Subcontractor'])
    expect(after.shareLinks.map((one) => one.name)).toEqual(['Stranger'])
  })

  it('nulls a createdBy naming a token the bundle did not carry, rather than leaving it dangling', () => {
    const out = remintProject(source(), sequentialIds())
    expect(linkNamed(out, 'Stranger').createdBy).toBeNull()
    expect(linkNamed(out, 'Manager').createdBy).toBeNull()
  })
})

describe('determinism, which is what makes every assertion above exact', () => {
  it('mints the exact sequence a seeded generator yields, in project then task then token order', () => {
    const out = remintProject(source(), sequentialIds())
    expect(out.manifest.id).toBe('5GGGGGJ0000000000000000000')
    expect(taskIdsOf(out)).toEqual([
      '5GGGGGK0000000000000000000',
      '5GGGGGM0000000000000000000',
      '5GGGGGN0000000000000000000',
    ])
    expect(tokensOf(out)).toEqual([
      'tok_0000000000000006',
      'tok_0000000000000007',
      'tok_0000000000000008',
      'tok_0000000000000009',
    ])
  })

  it('reproduces itself from one seed and diverges from another, the generator being the only source', () => {
    expect(remintProject(source(), sequentialIds(7))).toEqual(remintProject(source(), sequentialIds(7)))
    expect(remintProject(source(), sequentialIds(7)).manifest.id).not.toBe(
      remintProject(source(), sequentialIds(8)).manifest.id,
    )
  })
})

describe('a reminted project re-checked against the store the original is still in', () => {
  it('imports cleanly beside the original, which is the whole point of reminting', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    const result = checked(out, targeting(before.manifest))
    expect(result.reasons).toEqual([])
    expect(result.outcome).toBe('importable')
    expect(result.projectId).not.toBe(P1)
    expect(result.existsInTarget).toBe(false)
  })

  it('is refused when its tokens are put back, which is the collision ADR 0019 describes', () => {
    const before = source()
    const out = withTokensOf(remintProject(before, sequentialIds()), before)
    const result = checked(out, targeting(before.manifest))
    expect(result.outcome).toBe('blocked')
    expect(result.reasons).toContain(
      `Share link 0 carries a token project "${P1}" already holds`,
    )
  })

  it('sits in one token index beside the original, where a preserved token stops the boot', () => {
    const before = source()
    const out = remintProject(before, sequentialIds())
    const index = new ShareIndex()
    index.add('microtask', before.manifest)
    expect(() => {
      index.add('microtask', out.manifest)
    }).not.toThrow()
    const clashing = new ShareIndex()
    clashing.add('microtask', before.manifest)
    expect(() => {
      clashing.add('microtask', withTokensOf(out, before).manifest)
    }).toThrow(Conflict)
  })
})

describe('a legacy project imported as a copy, whose task id was its project id (§7.6)', () => {
  const legacy = (): ConvertedProject =>
    convertLegacyProject(
      {
        id: P1,
        name: 'The old workspace',
        tabs: [
          { id: B1, name: 'Kitchen', position: 0, document: emptyDocument(), createdAt: STAMP, updatedAt: STAMP },
          { id: B2, name: 'Garden', position: 1, document: emptyDocument(), createdAt: STAMP, updatedAt: STAMP },
        ],
        shareLinks: [],
      },
      fixedClock(NOW),
    )

  it('starts out holding one task filed under the project’s own id', () => {
    const before = legacy()
    expect(before.manifest.tasks.map((entry) => entry.id)).toEqual([P1])
    expect(before.manifest.tasks[0]?.id).toBe(before.manifest.id)
  })

  it('mints a task id that is no longer the project id, which is why the old address stops resolving', () => {
    const out = remintProject(legacy(), sequentialIds())
    expect(out.manifest.id).not.toBe(P1)
    expect(out.manifest.tasks[0]?.id).not.toBe(out.manifest.id)
    expect(out.documents[0]?.id).toBe(out.manifest.tasks[0]?.id)
  })

  it('keeps the legacy tab strip whole inside the copy, no tab id being named from outside it', () => {
    const out = remintProject(legacy(), sequentialIds())
    expect(out.documents[0]?.tabs.map((tab) => [tab.id, tab.name])).toEqual([
      [B1, 'Kitchen'],
      [B2, 'Garden'],
    ])
  })
})
