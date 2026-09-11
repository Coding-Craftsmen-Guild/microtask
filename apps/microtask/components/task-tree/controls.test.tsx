import { describe, expect, it } from 'vitest'
import { ADMIN_TREE, linkTreeControls } from './controls'

const P = '01HZZZZZZZZZZZZZZZZZZZZZZ1'
const T = '01HZZZZZZZZZZZZZZZZZZZZZZ2'
const TASK_SCOPE = { kind: 'task', projectId: P, taskId: T } as const
const PROJECT_SCOPE = { kind: 'project', projectId: P } as const

describe('ADMIN_TREE', () => {
  it('draws every tree control for an admin', () => {
    expect(Object.values(ADMIN_TREE).every((shown) => shown)).toBe(true)
  })
})

describe('linkTreeControls', () => {
  it('draws no folder tree and no create control for a task-scoped manage holder', () => {
    const controls = linkTreeControls('manage', TASK_SCOPE)
    expect(controls.folders).toBe(false)
    expect(controls.createFolder).toBe(false)
    expect(controls.createTask).toBe(false)
    expect(controls.reorderTasks).toBe(false)
    expect(controls.moveTask).toBe(false)
    expect(controls.renameFolder).toBe(false)
  })

  it('lets a project-scoped write holder create and rename, but not delete, move or reorder', () => {
    expect(linkTreeControls('write', PROJECT_SCOPE)).toEqual({
      folders: true,
      createFolder: true,
      renameFolder: true,
      deleteFolder: false,
      reorderFolders: false,
      createTask: true,
      renameTask: true,
      deleteTask: false,
      moveTask: false,
      reorderTasks: false,
    })
  })

  it('draws the whole tree read-only for a project-scoped viewer', () => {
    const { folders, ...changes } = linkTreeControls('view', PROJECT_SCOPE)
    expect(folders).toBe(true)
    expect(Object.values(changes).some((shown) => shown)).toBe(false)
  })

  it('draws every control for a project-scoped manage holder', () => {
    expect(Object.values(linkTreeControls('manage', PROJECT_SCOPE)).every((shown) => shown)).toBe(true)
  })
})
