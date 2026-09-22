import { describe, expect, it } from 'vitest'
import { ACTIONS, type Action } from './action.js'
import { ROLES, type Role } from './role.js'
import type { Principal } from './principal.js'
import type { Scope } from './scope.js'
import { TARGET_KINDS, type Target } from './target.js'
import { ADMIN_ONLY_ACTIONS, PLAN_TARGETS, PROJECT_TARGETS, can } from './policy.js'

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const OTHER = '01M240FB4GD6PF6V0PKZVF6FDX'
const PL = '01M240HZ6T4K9QW8N2RXY5BCDE'

const admin: Principal = { kind: 'admin' }

const link = (role: Role, scope: Scope): Principal => ({
  kind: 'link',
  role,
  scope,
  token: 'tok_abcdefghijklmnop',
})

const projectLink = (role: Role) => link(role, { kind: 'project', projectId: P })
const taskLink = (role: Role) => link(role, { kind: 'task', projectId: P, taskId: T })
const planLink = (role: Role) => link(role, { kind: 'plan', planId: PL })

const WORKSPACE: Target = { kind: 'workspace' }
const PROJECT: Target = { kind: 'project', projectId: P }
const FOLDER: Target = { kind: 'folder', projectId: P }
const TASK: Target = { kind: 'task', projectId: P, taskId: T }
const TAB: Target = { kind: 'tab', projectId: P, taskId: T }

const PLAN: Target = { kind: 'plan', planId: PL }
const EPIC: Target = { kind: 'epic', planId: PL }
const FEATURE: Target = { kind: 'feature', planId: PL }
const ITEM: Target = { kind: 'item', planId: PL }

const GROUP_ACTIONS: readonly Action[] = ['task:create', 'task:reorder']

const TARGET_BY_PREFIX: readonly (readonly [string, Target])[] = [
  ['workspace:', WORKSPACE],
  ['plan:', PLAN],
  ['epic:', EPIC],
  ['feature:', FEATURE],
  ['item:', ITEM],
  ['folder:', PROJECT],
]

const targetFor = (action: Action): Target => {
  const byPrefixMatch = TARGET_BY_PREFIX.find(([prefix]) => action.startsWith(prefix))
  if (byPrefixMatch) return byPrefixMatch[1]
  if (GROUP_ACTIONS.includes(action)) return PROJECT
  if (action === 'tab:create') return TASK
  if (action.startsWith('tab:')) return TAB
  if (action.startsWith('task:')) return TASK
  return PROJECT
}

const reachableByTaskScope = (action: Action): boolean => {
  const { kind } = targetFor(action)
  return kind === 'task' || kind === 'tab' || action === 'project:read'
}

const reachableByProjectScope = (action: Action): boolean =>
  PROJECT_TARGETS.includes(targetFor(action).kind)

const planTargetFor = (action: Action): Target =>
  action.startsWith('share:') ? PLAN : targetFor(action)

const reachableByPlanScope = (action: Action): boolean =>
  PLAN_TARGETS.includes(planTargetFor(action).kind)

const byPrefix = (...prefixes: readonly string[]): readonly Action[] =>
  ACTIONS.filter((action) => prefixes.some((prefix) => action.startsWith(prefix)))

const PLAN_FAMILY_ACTIONS = byPrefix('plan:', 'epic:', 'feature:', 'item:')
const MICROTASK_FAMILY_ACTIONS = byPrefix('project:', 'folder:', 'task:', 'tab:')

const PLAN_VIEW_ADDITIONS: readonly Action[] = ['plan:read']

const PLAN_WRITE_ADDITIONS: readonly Action[] = [
  'feature:create',
  'feature:rename',
  'feature:estimate',
  'item:create',
  'item:rename',
  'item:estimate',
  'item:describe',
  'item:link',
]

const PLAN_MANAGE_ADDITIONS: readonly Action[] = [
  'plan:rename',
  'plan:retime',
  'plan:delete',
  'epic:create',
  'epic:rename',
  'epic:delete',
  'epic:reorder',
  'feature:delete',
  'feature:place',
  'feature:depend',
  'item:delete',
  'item:place',
]

const PLAN_ADMIN_ONLY_ADDITIONS: readonly Action[] = [
  'workspace:list-plans',
  'workspace:create-plan',
  'epic:bind',
]

const SHARE_ACTIONS: readonly Action[] = [
  'share:read',
  'share:create',
  'share:revoke',
  'share:update',
]

const VIEW: readonly Action[] = ['project:read', 'task:read', ...PLAN_VIEW_ADDITIONS]

const WRITE: readonly Action[] = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
  ...PLAN_WRITE_ADDITIONS,
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
  ...PLAN_MANAGE_ADDITIONS,
]

const ALLOWED: Record<Role, readonly Action[]> = { view: VIEW, write: WRITE, manage: MANAGE }

describe('the scope-family table — its own invariants, exercising no path through can()', () => {
  it('fails the build for a target kind added to neither scope family', () => {
    const placed = [...PROJECT_TARGETS, ...PLAN_TARGETS, 'workspace' as const]
    expect([...placed].sort()).toEqual([...TARGET_KINDS].sort())
  })
})

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
      'epic:reorder',
    ])
  })
})

describe('can — the full role x action matrix, for both scopes', () => {
  for (const role of ROLES) {
    it(`grants a project-scoped ${role} link exactly its listed actions`, () => {
      for (const action of ACTIONS) {
        const allowed = ALLOWED[role].includes(action) && reachableByProjectScope(action)
        expect({ action, allowed: can(projectLink(role), action, targetFor(action)) })
          .toEqual({ action, allowed })
      }
    })

    it(`grants a task-scoped ${role} link only the listed actions its scope reaches`, () => {
      for (const action of ACTIONS) {
        const allowed = ALLOWED[role].includes(action) && reachableByTaskScope(action)
        expect({ action, allowed: can(taskLink(role), action, targetFor(action)) })
          .toEqual({ action, allowed })
      }
    })

    it(`grants a plan-scoped ${role} link only the listed actions its scope reaches`, () => {
      for (const action of ACTIONS) {
        const allowed = ALLOWED[role].includes(action) && reachableByPlanScope(action)
        expect({ action, allowed: can(planLink(role), action, planTargetFor(action)) })
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

describe('can — a plan is not a project that happens to carry the same id', () => {
  it('finds actions under each family prefix, so neither filter below matches nothing', () => {
    expect(PLAN_FAMILY_ACTIONS.length).toBeGreaterThan(0)
    expect(MICROTASK_FAMILY_ACTIONS.length).toBeGreaterThan(0)
  })

  const COLLIDING_PLAN_TARGETS: readonly Target[] = [
    { kind: 'plan', planId: P },
    { kind: 'epic', planId: P },
    { kind: 'feature', planId: P },
    { kind: 'item', planId: P },
  ]

  const MICROTASK_TARGETS_AT_PL: readonly Target[] = [
    { kind: 'project', projectId: PL },
    { kind: 'folder', projectId: PL },
    { kind: 'task', projectId: PL, taskId: T },
    { kind: 'tab', projectId: PL, taskId: T },
  ]

  it('refuses a project-scoped manage link every plan action on a plan whose id it holds', () => {
    const holder = link('manage', { kind: 'project', projectId: P })
    for (const action of PLAN_FAMILY_ACTIONS) {
      for (const target of COLLIDING_PLAN_TARGETS) {
        const seen = { action, target: target.kind, allowed: can(holder, action, target) }
        expect(seen).toEqual({ action, target: target.kind, allowed: false })
      }
    }
  })

  it('refuses a task-scoped manage link the same, its scope carrying a project id too', () => {
    const holder = link('manage', { kind: 'task', projectId: P, taskId: T })
    for (const action of PLAN_FAMILY_ACTIONS) {
      for (const target of COLLIDING_PLAN_TARGETS) {
        const seen = { action, target: target.kind, allowed: can(holder, action, target) }
        expect(seen).toEqual({ action, target: target.kind, allowed: false })
      }
    }
  })

  it('refuses a plan-scoped manage link every microtask action on a project whose id it holds', () => {
    const holder = link('manage', { kind: 'plan', planId: PL })
    for (const action of MICROTASK_FAMILY_ACTIONS) {
      for (const target of MICROTASK_TARGETS_AT_PL) {
        const seen = { action, target: target.kind, allowed: can(holder, action, target) }
        expect(seen).toEqual({ action, target: target.kind, allowed: false })
      }
    }
  })

  it('refuses a plan-scoped manage link a workspace target, as every other scope is refused', () => {
    expect(can(planLink('manage'), 'plan:read', WORKSPACE)).toBe(false)
  })

  it('refuses a plan-scoped manage link another plan entirely', () => {
    expect(can(planLink('manage'), 'plan:rename', { kind: 'plan', planId: OTHER })).toBe(false)
    expect(can(planLink('manage'), 'epic:create', { kind: 'epic', planId: OTHER })).toBe(false)
  })
})

describe('can — a plan-scoped write link cannot become a manage link', () => {
  it('clears it for each of the eight write additions, named one by one', () => {
    expect(PLAN_WRITE_ADDITIONS).toHaveLength(8)
    for (const action of PLAN_WRITE_ADDITIONS) {
      expect(can(planLink('write'), action, planTargetFor(action)), action).toBe(true)
    }
  })

  it('refuses it each of the twelve manage additions, named one by one', () => {
    expect(PLAN_MANAGE_ADDITIONS).toHaveLength(12)
    for (const action of PLAN_MANAGE_ADDITIONS) {
      expect(can(planLink('write'), action, planTargetFor(action)), action).toBe(false)
    }
  })

  it('refuses it all four share actions', () => {
    for (const action of SHARE_ACTIONS) {
      expect(can(planLink('write'), action, PLAN), action).toBe(false)
    }
  })

  it('clears a plan-scoped manage link for those same twelve, so the refusal is role not scope', () => {
    for (const action of PLAN_MANAGE_ADDITIONS) {
      expect(can(planLink('manage'), action, planTargetFor(action)), action).toBe(true)
    }
  })

  it('clears a plan-scoped manage link for all four share actions', () => {
    for (const action of SHARE_ACTIONS) {
      expect(can(planLink('manage'), action, PLAN), action).toBe(true)
    }
  })
})

describe('can — a plan-scoped view link reads the plan and nothing more', () => {
  it('clears plan:read', () => {
    expect(can(planLink('view'), 'plan:read', PLAN)).toBe(true)
  })

  it('refuses every other action there is', () => {
    for (const action of ACTIONS) {
      if (action === 'plan:read') continue
      const seen = { action, allowed: can(planLink('view'), action, planTargetFor(action)) }
      expect(seen).toEqual({ action, allowed: false })
    }
  })

  it('refuses it the three plan-scoped targets below the plan, for a write it lacks', () => {
    for (const target of [EPIC, FEATURE, ITEM]) {
      expect(can(planLink('view'), 'feature:create', target), target.kind).toBe(false)
    }
  })
})

describe('can — the epic binding is the ceiling, so no link role may move it', () => {
  const EVERY_SCOPE: readonly Scope[] = [
    { kind: 'project', projectId: P },
    { kind: 'task', projectId: P, taskId: T },
    { kind: 'plan', planId: PL },
    { kind: 'plan', planId: P },
  ]

  const EVERY_TARGET: readonly Target[] = [
    WORKSPACE,
    PROJECT,
    FOLDER,
    TASK,
    TAB,
    PLAN,
    EPIC,
    FEATURE,
    ITEM,
    { kind: 'epic', planId: P },
  ]

  it('names epic:bind admin-only', () => {
    expect(ADMIN_ONLY_ACTIONS).toContain('epic:bind')
  })

  it('refuses epic:bind to every link role, at every scope, against every target', () => {
    for (const role of ROLES) {
      for (const scope of EVERY_SCOPE) {
        for (const target of EVERY_TARGET) {
          const seen = { role, scope: scope.kind, target: target.kind }
          expect({ ...seen, allowed: can(link(role, scope), 'epic:bind', target) })
            .toEqual({ ...seen, allowed: false })
        }
      }
    }
  })

  it('clears an admin for it, so the refusal above is the link principal and not the action', () => {
    expect(can(admin, 'epic:bind', EPIC)).toBe(true)
  })
})

describe('can — the two workspace plan actions are the admin alone', () => {
  const WORKSPACE_PLAN_ACTIONS: readonly Action[] = ['workspace:list-plans', 'workspace:create-plan']

  const EVERY_SCOPE: readonly Scope[] = [
    { kind: 'project', projectId: P },
    { kind: 'task', projectId: P, taskId: T },
    { kind: 'plan', planId: PL },
  ]

  it('names all three admin-only additions, alongside the four that came before', () => {
    for (const action of PLAN_ADMIN_ONLY_ADDITIONS) {
      expect(ADMIN_ONLY_ACTIONS, action).toContain(action)
    }
    expect(PLAN_ADMIN_ONLY_ADDITIONS).toHaveLength(3)
  })

  it('refuses both to every link role at every scope, whatever target is named', () => {
    const cases = ROLES.flatMap((role) =>
      EVERY_SCOPE.flatMap((scope) =>
        WORKSPACE_PLAN_ACTIONS.flatMap((action) =>
          [WORKSPACE, PLAN, PROJECT].map((target) => ({ role, scope, action, target })),
        ),
      ),
    )
    for (const { role, scope, action, target } of cases) {
      const seen = { role, scope: scope.kind, action, target: target.kind }
      expect({ ...seen, allowed: can(link(role, scope), action, target) })
        .toEqual({ ...seen, allowed: false })
    }
  })

  it('clears an admin for every action this task adds, all twenty-four of them', () => {
    const added = [...PLAN_FAMILY_ACTIONS, ...WORKSPACE_PLAN_ACTIONS]
    expect(added).toHaveLength(24)
    for (const action of added) {
      expect(can(admin, action, targetFor(action)), action).toBe(true)
    }
  })

  it('accounts for each added action exactly once across the four grant lists', () => {
    const listed = [
      ...PLAN_VIEW_ADDITIONS,
      ...PLAN_WRITE_ADDITIONS,
      ...PLAN_MANAGE_ADDITIONS,
      ...PLAN_ADMIN_ONLY_ADDITIONS,
    ]
    expect([...listed].sort()).toEqual([...PLAN_FAMILY_ACTIONS, ...WORKSPACE_PLAN_ACTIONS].sort())
  })
})
