import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as contracts from './index.js'

const schemas = Object.entries<unknown>(contracts).filter(
  (entry): entry is [string, z.ZodType] => entry[1] instanceof z.ZodType,
)

describe('contracts', () => {
  it('exports at least one schema', () => {
    expect(schemas.length).toBeGreaterThan(0)
  })

  it('gives every exported schema a component id', () => {
    const missing = schemas.filter(([, schema]) => !schema.meta()?.id).map(([name]) => name)
    expect(missing).toEqual([])
  })

  it('never reuses a component id', () => {
    const ids = schemas.map(([, schema]) => schema.meta()?.id).filter(Boolean)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)
    expect(duplicates).toEqual([])
  })

  it('accepts a valid project manifest', () => {
    const parsed = contracts.ProjectManifest.safeParse({
      id: '01M240ERCRWWCN16Q5AHP1FZAQ',
      name: 'Launch',
      folders: [],
      tasks: [],
      shareLinks: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a name longer than 80 characters', () => {
    expect(contracts.EntityName.safeParse('x'.repeat(81)).success).toBe(false)
    expect(contracts.EntityName.safeParse('x'.repeat(80)).success).toBe(true)
  })

  it('rejects a document that is not a doc node', () => {
    expect(contracts.DocumentJson.safeParse({ type: 'paragraph' }).success).toBe(false)
    expect(contracts.DocumentJson.safeParse({ type: 'doc', content: [] }).success).toBe(true)
  })

  it('rejects an id that is not a ULID', () => {
    expect(contracts.EntityId.safeParse('../../etc/passwd').success).toBe(false)
  })
})

describe('the shapes a route answers with', () => {
  const project = {
    id: '01M240ERCRWWCN16Q5AHP1FZAQ',
    name: 'Launch',
    folders: [],
    tasks: [],
    createdAt: '2026-09-10T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  }

  it('accepts a project view with the share-link block absent', () => {
    expect(contracts.ProjectView.safeParse(project).success).toBe(true)
  })

  it('accepts a project view carrying the block, which is what an admin receives', () => {
    expect(contracts.ProjectView.safeParse({ ...project, shareLinks: [] }).success).toBe(true)
  })

  it('refuses a project view whose folders are missing, so absent never reads as empty', () => {
    const { folders, ...withoutFolders } = project
    expect(folders).toEqual([])
    expect(contracts.ProjectView.safeParse(withoutFolders).success).toBe(false)
  })

  it('accepts a task view with no folder, which is what a task-scoped seat is told', () => {
    const parsed = contracts.TaskView.safeParse({
      projectId: '01M240ERCRWWCN16Q5AHP1FZAQ',
      id: '01M240ERCRWWCN16Q5AHP1FZT1',
      name: 'Write the spec',
      position: 0,
      folder: null,
      progress: { done: 0, total: 0 },
      tabs: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    })
    expect(parsed.success).toBe(true)
  })

  it('requires the folder key rather than treating it as optional', () => {
    expect(contracts.TaskView.safeParse({ projectId: '01M240ERCRWWCN16Q5AHP1FZAQ' }).success).toBe(false)
  })
})

describe('the shapes a route accepts', () => {
  const ID = '01M240ERCRWWCN16Q5AHP1FZF1'

  it('refuses a name payload with no name', () => {
    expect(contracts.NamePayload.safeParse({}).success).toBe(false)
    expect(contracts.NamePayload.safeParse({ name: 'Inbox' }).success).toBe(true)
  })

  it('lets a task be created with no folder, with an explicit null, or inside one', () => {
    expect(contracts.CreateTaskPayload.safeParse({ name: 'Ship' }).success).toBe(true)
    expect(contracts.CreateTaskPayload.safeParse({ name: 'Ship', folderId: null }).success).toBe(true)
    expect(contracts.CreateTaskPayload.safeParse({ name: 'Ship', folderId: ID }).success).toBe(true)
  })

  it('makes a move say where to, because omitting it and asking for the root differ', () => {
    expect(contracts.MoveTaskPayload.safeParse({}).success).toBe(false)
    expect(contracts.MoveTaskPayload.safeParse({ folderId: null }).success).toBe(true)
  })

  it('makes a task reorder name the group it renumbers, since positions are dense per folder', () => {
    expect(contracts.ReorderTasksPayload.safeParse({ taskIds: [ID] }).success).toBe(false)
    expect(contracts.ReorderTasksPayload.safeParse({ folderId: null, taskIds: [ID] }).success).toBe(true)
  })

  it('takes a folder reorder as a bare list of ids', () => {
    expect(contracts.ReorderFoldersPayload.safeParse({ folderIds: [ID] }).success).toBe(true)
    expect(contracts.ReorderFoldersPayload.safeParse({ folderIds: ['nope'] }).success).toBe(false)
  })

  it('takes a tab reorder as a bare list of ids, the task being named by the path', () => {
    expect(contracts.ReorderTabsPayload.safeParse({ tabIds: [ID] }).success).toBe(true)
    expect(contracts.ReorderTabsPayload.safeParse({ tabIds: ['nope'] }).success).toBe(false)
    expect(contracts.ReorderTabsPayload.safeParse({}).success).toBe(false)
  })

  it('lets a share link be asked for by task, by explicit scope, or neither', () => {
    const seat = { name: 'Acme', role: 'view' }
    expect(contracts.CreateShareLinkPayload.safeParse({ ...seat, taskId: ID }).success).toBe(true)
    const scope = { kind: 'project', projectId: ID }
    expect(contracts.CreateShareLinkPayload.safeParse({ ...seat, scope }).success).toBe(true)
    expect(contracts.CreateShareLinkPayload.safeParse(seat).success).toBe(true)
  })

  it('refuses a role the policy does not name', () => {
    const parsed = contracts.CreateShareLinkPayload.safeParse({ name: 'Acme', role: 'owner', taskId: ID })
    expect(parsed.success).toBe(false)
  })

  it('strips a createdBy a client tried to choose for itself', () => {
    const parsed = contracts.CreateShareLinkPayload.parse({
      name: 'Acme',
      role: 'view',
      taskId: ID,
      createdBy: 'shr_someone_elses_token',
    })
    expect(parsed).not.toHaveProperty('createdBy')
  })

  it('requires a password to log in, and bounds what may reach the hash', () => {
    expect(contracts.LoginPayload.safeParse({}).success).toBe(false)
    expect(contracts.LoginPayload.safeParse({ password: '' }).success).toBe(false)
    expect(contracts.LoginPayload.safeParse({ password: 'hunter2' }).success).toBe(true)
    expect(contracts.LoginPayload.safeParse({ password: 'x'.repeat(1025) }).success).toBe(false)
  })
})

describe('the shapes search and sharing answer with', () => {
  const ID = '01M240ERCRWWCN16Q5AHP1FZF1'

  it('tells a search result apart by its kind, and gives each one an address', () => {
    expect(contracts.SearchResult.safeParse({ kind: 'project', projectId: ID, name: 'Launch' }).success).toBe(true)
    const folder = { kind: 'folder', projectId: ID, folderId: ID, name: 'Inbox' }
    expect(contracts.SearchResult.safeParse(folder).success).toBe(true)
    const task = { kind: 'task', projectId: ID, taskId: ID, name: 'Ship it' }
    expect(contracts.SearchResult.safeParse(task).success).toBe(true)
  })

  it('refuses a search result that names no kind, so no variant is read as another', () => {
    expect(contracts.SearchResult.safeParse({ projectId: ID, name: 'Launch' }).success).toBe(false)
  })

  it('gives a task result no folder to read a breadcrumb out of', () => {
    const parsed = contracts.SearchResult.parse({
      kind: 'task',
      projectId: ID,
      taskId: ID,
      name: 'Ship it',
      folderId: ID,
    })
    expect(parsed).not.toHaveProperty('folderId')
  })

  it('carries no token in the answer a share link gets about itself', () => {
    const parsed = contracts.ShareView.parse({
      role: 'view',
      scope: { kind: 'project', projectId: ID },
      project: { id: ID, name: 'Launch' },
      folders: [],
      tasks: [],
      token: 'shr_a_live_credential',
    })
    expect(JSON.stringify(parsed)).not.toContain('shr_a_live_credential')
  })

  it('answers a tab reorder with the tabs themselves, bounded like the task holding them', () => {
    const tab = {
      id: '01M240ERCRWWCN16Q5AHP1FZB1',
      name: 'General',
      position: 0,
      document: { type: 'doc' },
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    }
    expect(contracts.TabList.safeParse({ tabs: [tab] }).success).toBe(true)
    expect(contracts.TabList.safeParse({}).success).toBe(false)
    expect(contracts.TabList.safeParse({ tabs: Array.from({ length: 41 }, () => tab) }).success).toBe(false)
  })

  it('answers a conditional write with the stamp the next one must carry', () => {
    expect(contracts.TabDocumentSaved.safeParse({ updatedAt: '2026-09-10T00:00:00.000Z' }).success).toBe(true)
    expect(contracts.TabDocumentSaved.safeParse({}).success).toBe(false)
  })
})

describe('the body that renames a share link or changes its role (ADR 0035)', () => {
  const ID = '01M240ERCRWWCN16Q5AHP1FZF1'

  it('takes a name, a role, both, or neither', () => {
    expect(contracts.UpdateShareLinkPayload.safeParse({ name: 'Jane' }).success).toBe(true)
    expect(contracts.UpdateShareLinkPayload.safeParse({ role: 'view' }).success).toBe(true)
    expect(contracts.UpdateShareLinkPayload.safeParse({ name: 'Jane', role: 'view' }).success).toBe(true)
    expect(contracts.UpdateShareLinkPayload.safeParse({}).success).toBe(true)
  })

  it('accepts an empty name, which production data already contains', () => {
    expect(contracts.UpdateShareLinkPayload.safeParse({ name: '' }).success).toBe(true)
  })

  it('still refuses an empty name when a link is being minted, the two rules differing', () => {
    expect(contracts.CreateShareLinkPayload.safeParse({ name: '', role: 'view', taskId: ID }).success).toBe(false)
  })

  it('refuses a role the policy does not name', () => {
    expect(contracts.UpdateShareLinkPayload.safeParse({ role: 'owner' }).success).toBe(false)
  })

  it('bounds the name the way every other name is bounded', () => {
    expect(contracts.UpdateShareLinkPayload.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
  })

  it('strips a scope a client tried to widen itself with, which ADR 0011 freezes', () => {
    const parsed = contracts.UpdateShareLinkPayload.parse({
      role: 'manage',
      scope: { kind: 'project', projectId: ID },
      taskId: ID,
    })
    expect(parsed).not.toHaveProperty('scope')
    expect(parsed).not.toHaveProperty('taskId')
  })

  it('strips a token, so a PATCH cannot rewrite the credential it addresses', () => {
    const parsed = contracts.UpdateShareLinkPayload.parse({ name: 'Jane', token: 'shr_new_token' })
    expect(parsed).not.toHaveProperty('token')
  })
})
