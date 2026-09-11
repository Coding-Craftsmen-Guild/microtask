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
})
