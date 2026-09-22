import type { Action } from './action.js'
import type { Principal } from './principal.js'
import type { Role } from './role.js'
import type { Scope } from './scope.js'
import type { Target } from './target.js'

const VIEW = ['project:read', 'task:read', 'plan:read'] as const

const WRITE = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
  'feature:create',
  'feature:rename',
  'feature:estimate',
  'item:create',
  'item:rename',
  'item:estimate',
  'item:describe',
  'item:link',
] as const

const MANAGE = [
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
] as const

const GRANTS: Readonly<Record<Role, readonly Action[]>> = {
  view: VIEW,
  write: WRITE,
  manage: MANAGE,
}

/**
 * Actions with no per-resource target, reserved to the admin (ADR 0009).
 *
 * `epic:bind` sits here rather than under `manage` because an epic's binding role is the ceiling
 * on everything a link holder reaches in Microtask through the bridge. A holder who could re-role
 * a binding could raise its own ceiling, and every bound would be decoration.
 */
export const ADMIN_ONLY_ACTIONS: readonly Action[] = [
  'workspace:list-projects',
  'workspace:create-project',
  'workspace:import',
  'workspace:search',
  'workspace:list-plans',
  'workspace:create-plan',
  'epic:bind',
]

const TASK_SCOPE_PROJECT_ACTIONS: readonly Action[] = ['project:read']

const PROJECT_TARGETS: readonly Target['kind'][] = ['project', 'folder', 'task', 'tab']
const PLAN_TARGETS: readonly Target['kind'][] = ['plan', 'epic', 'feature', 'item']

const SCOPE_TARGETS: Readonly<Record<Scope['kind'], readonly Target['kind'][]>> = {
  project: PROJECT_TARGETS,
  task: PROJECT_TARGETS,
  plan: PLAN_TARGETS,
}

function sameRoot(scope: Scope, target: Target): boolean {
  if (scope.kind === 'plan') return 'planId' in target && target.planId === scope.planId
  return 'projectId' in target && target.projectId === scope.projectId
}

function withinTaskScope(scope: Scope, action: Action, target: Target): boolean {
  if (scope.kind !== 'task') return false
  if (target.kind === 'project') return TASK_SCOPE_PROJECT_ACTIONS.includes(action)
  if (target.kind === 'task' || target.kind === 'tab') return target.taskId === scope.taskId
  return false
}

function inScope(scope: Scope, action: Action, target: Target): boolean {
  if (!SCOPE_TARGETS[scope.kind].includes(target.kind)) return false
  if (!sameRoot(scope, target)) return false
  return scope.kind === 'task' ? withinTaskScope(scope, action, target) : true
}

/** Decides whether a principal may perform an action on a target. Pure. */
export function can(principal: Principal, action: Action, target: Target): boolean {
  if (principal.kind === 'admin') return true
  if (ADMIN_ONLY_ACTIONS.includes(action)) return false
  if (!inScope(principal.scope, action, target)) return false
  return GRANTS[principal.role].includes(action)
}
