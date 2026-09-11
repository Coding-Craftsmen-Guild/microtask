import { describe, expect, it } from 'vitest'
import { ACTIONS, type Action } from './action.js'
import { ROLES, type Role } from './role.js'
import type { Principal } from './principal.js'
import type { Scope } from './scope.js'
import type { Target } from './target.js'
import { ADMIN_ONLY_ACTIONS, can } from './policy.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const OTHER = '01M240FB4GD6PF6V0PKZVF6FDX'

const admin: Principal = { kind: 'admin' }

const link = (role: Role, scope: Scope): Principal => ({
  kind: 'link',
  role,
  scope,
  token: 'tok_abcdefghijklmnop',
})

const projectLink = (role: Role) => link(role, { kind: 'project', projectId: P })
const taskLink = (role: Role) => link(role, { kind: 'task', projectId: P, taskId: T })

const WORKSPACE: Target = { kind: 'workspace' }
const PROJECT: Target = { kind: 'project', projectId: P }
const FOLDER: Target = { kind: 'folder', projectId: P }
const TASK: Target = { kind: 'task', projectId: P, taskId: T }
const TAB: Target = { kind: 'tab', projectId: P, taskId: T }

const GROUP_ACTIONS: readonly Action[] = ['task:create', 'task:reorder']

const targetFor = (action: Action): Target => {
  if (action.startsWith('workspace:')) return WORKSPACE
  if (GROUP_ACTIONS.includes(action) || action.startsWith('folder:')) return PROJECT
  if (action === 'tab:create') return TASK
  if (action.startsWith('tab:')) return TAB
  if (action.startsWith('task:')) return TASK
  return PROJECT
}

const reachableByTaskScope = (action: Action): boolean => {
  const { kind } = targetFor(action)
  return kind === 'task' || kind === 'tab' || action === 'project:read'
}

const VIEW: readonly Action[] = ['project:read', 'task:read']

const WRITE: readonly Action[] = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
]

const MANAGE: readonly Action[] = [
  ...WRITE,
  'project:rename',
  'project:delete',
  'folder:delete',
  'folder:reorder',
  'task:delete',
  'task:move',
  'task:reorder',
  'tab:delete',
  'tab:reorder',
  'share:read',
  'share:create',
  'share:revoke',
  'share:update',
  'export:run',
]

const ALLOWED: Record<Role, readonly Action[]> = { view: VIEW, write: WRITE, manage: MANAGE }

describe('can — admin', () => {
  it('permits every action', () => {
    for (const action of ACTIONS) {
      expect(can(admin, action, targetFor(action))).toBe(true)
    }
  })
})

describe('can — every action is named once', () => {
  it('names task:reorder beside its two siblings, so reordering is never asked as a move', () => {
    expect(ACTIONS.filter((action) => action.endsWith(':reorder'))).toEqual([
      'folder:reorder',
      'task:reorder',
      'tab:reorder',
    ])
  })
})

describe('can — the full role x action matrix, for both scopes', () => {
  for (const role of ROLES) {
    it(`grants a project-scoped ${role} link exactly its listed actions`, () => {
      for (const action of ACTIONS) {
        expect({ action, allowed: can(projectLink(role), action, targetFor(action)) })
          .toEqual({ action, allowed: ALLOWED[role].includes(action) })
      }
    })

    it(`grants a task-scoped ${role} link only the listed actions its scope reaches`, () => {
      for (const action of ACTIONS) {
        const allowed = ALLOWED[role].includes(action) && reachableByTaskScope(action)
        expect({ action, allowed: can(taskLink(role), action, targetFor(action)) })
          .toEqual({ action, allowed })
      }
    })
  }
})

describe('can — top level is admin only', () => {
  it('classifies every action as either admin-only or reachable by manage', () => {
    for (const action of ACTIONS) {
      const classified = ADMIN_ONLY_ACTIONS.includes(action) || MANAGE.includes(action)
      expect({ action, classified }).toEqual({ action, classified: true })
    }
  })

  it('refuses every workspace action to every link role', () => {
    for (const role of ROLES) {
      for (const action of ADMIN_ONLY_ACTIONS) {
        expect(can(projectLink(role), action, WORKSPACE)).toBe(false)
      }
    }
  })

  it('refuses a workspace target even for an otherwise-granted action', () => {
    expect(can(projectLink('manage'), 'project:read', WORKSPACE)).toBe(false)
  })
})

describe('can — scope containment', () => {
  it('refuses another project entirely', () => {
    const elsewhere: Target = { kind: 'project', projectId: OTHER }
    expect(can(projectLink('manage'), 'project:read', elsewhere)).toBe(false)
  })

  it('lets a task-scoped link read its own task and write its own tabs', () => {
    expect(can(taskLink('view'), 'task:read', TASK)).toBe(true)
    expect(can(taskLink('write'), 'tab:write', TAB)).toBe(true)
  })

  it('refuses a task-scoped link any sibling task', () => {
    const sibling: Target = { kind: 'task', projectId: P, taskId: OTHER }
    expect(can(taskLink('manage'), 'task:read', sibling)).toBe(false)
    const siblingTab: Target = { kind: 'tab', projectId: P, taskId: OTHER }
    expect(can(taskLink('manage'), 'tab:write', siblingTab)).toBe(false)
  })

  it('lets a task-scoped link read its project but change nothing about it', () => {
    expect(can(taskLink('view'), 'project:read', PROJECT)).toBe(true)
    expect(can(taskLink('manage'), 'project:rename', PROJECT)).toBe(false)
    expect(can(taskLink('manage'), 'project:delete', PROJECT)).toBe(false)
  })

  it('refuses a task-scoped link the folder tree', () => {
    expect(can(taskLink('manage'), 'folder:create', PROJECT)).toBe(false)
    expect(can(taskLink('manage'), 'folder:rename', FOLDER)).toBe(false)
  })

  it('refuses a task-scoped link the power to create sibling tasks', () => {
    expect(can(taskLink('write'), 'task:create', PROJECT)).toBe(false)
  })

  it('lets a task-scoped manage link mint a link over its own task', () => {
    const own: Target = { kind: 'task', projectId: P, taskId: T }
    expect(can(taskLink('manage'), 'share:create', own)).toBe(true)
  })

  it('refuses a task-scoped manage link the three project-level share actions', () => {
    for (const action of ['share:read', 'share:revoke', 'share:update'] as const) {
      expect(can(taskLink('manage'), action, PROJECT), action).toBe(false)
    }
  })

  it('grants a project-scoped manage link share:update, so the refusal above is scope not role', () => {
    expect(can(projectLink('manage'), 'share:update', PROJECT)).toBe(true)
    expect(can(projectLink('write'), 'share:update', PROJECT)).toBe(false)
    expect(can(projectLink('view'), 'share:update', PROJECT)).toBe(false)
  })

  it('names share:update beside the two actions it sits with, all three on the project', () => {
    expect(ACTIONS.filter((action) => action.startsWith('share:'))).toEqual([
      'share:read',
      'share:create',
      'share:revoke',
      'share:update',
    ])
  })
})
