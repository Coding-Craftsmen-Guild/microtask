import type { Action } from './action.js'
import type { Principal } from './principal.js'
import type { Role } from './role.js'
import type { Scope } from './scope.js'
import type { Target } from './target.js'

const VIEW = ['project:read', 'task:read'] as const

const WRITE = [
  ...VIEW,
  'folder:create',
  'folder:rename',
  'task:create',
  'task:rename',
  'tab:create',
  'tab:rename',
  'tab:write',
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
  'export:run',
] as const

const GRANTS: Readonly<Record<Role, readonly Action[]>> = {
  view: VIEW,
  write: WRITE,
  manage: MANAGE,
}

/** Actions with no per-resource target, reserved to the admin (ADR 0009). */
export const ADMIN_ONLY_ACTIONS: readonly Action[] = [
  'workspace:list-projects',
  'workspace:create-project',
  'workspace:import',
  'workspace:search',
]

const TASK_SCOPE_PROJECT_ACTIONS: readonly Action[] = ['project:read']

function withinProjectScope(scope: Scope, target: Target): boolean {
  return target.kind !== 'workspace' && target.projectId === scope.projectId
}

function withinTaskScope(scope: Scope, action: Action, target: Target): boolean {
  if (scope.kind !== 'task') return false
  if (target.kind === 'project') return TASK_SCOPE_PROJECT_ACTIONS.includes(action)
  if (target.kind === 'task' || target.kind === 'tab') return target.taskId === scope.taskId
  return false
}

function inScope(scope: Scope, action: Action, target: Target): boolean {
  if (!withinProjectScope(scope, target)) return false
  return scope.kind === 'project' ? true : withinTaskScope(scope, action, target)
}

/** Decides whether a principal may perform an action on a target. Pure. */
export function can(principal: Principal, action: Action, target: Target): boolean {
  if (principal.kind === 'admin') return true
  if (ADMIN_ONLY_ACTIONS.includes(action)) return false
  if (!inScope(principal.scope, action, target)) return false
  return GRANTS[principal.role].includes(action)
}
