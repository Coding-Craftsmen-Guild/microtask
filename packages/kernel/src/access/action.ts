const MICROTASK_AND_WORKSPACE_ACTIONS = [
  'project:read',
  'project:rename',
  'project:delete',
  'folder:create',
  'folder:rename',
  'folder:delete',
  'folder:reorder',
  'task:create',
  'task:read',
  'task:rename',
  'task:delete',
  'task:move',
  'task:reorder',
  'tab:create',
  'tab:rename',
  'tab:delete',
  'tab:reorder',
  'tab:write',
  'share:read',
  'share:create',
  'share:revoke',
  'share:update',
  'export:run',
  'workspace:list-projects',
  'workspace:create-project',
  'workspace:import',
  'workspace:search',
  'workspace:list-plans',
  'workspace:create-plan',
] as const

const PLAN_FAMILY_ACTIONS = [
  'plan:read',
  'plan:rename',
  'plan:retime',
  'plan:delete',
  'epic:create',
  'epic:rename',
  'epic:delete',
  'epic:reorder',
  'epic:bind',
  'feature:create',
  'feature:rename',
  'feature:estimate',
  'feature:delete',
  'feature:place',
  'feature:pin',
  'feature:depend',
  'item:create',
  'item:rename',
  'item:estimate',
  'item:describe',
  'item:delete',
  'item:place',
  'item:link',
] as const

/**
 * Every action the policy can decide. Adding one requires a policy decision.
 *
 * Built from two private lists grouped by **action family**, not by product. `workspace:list-plans`
 * and `workspace:create-plan` are Macroplan's, and they sit with the workspace family beside their
 * three `workspace:` siblings, because what they have in common with those — a workspace target and
 * admin-only authority — is what the policy turns on.
 *
 * So the two groups are not a product split, and neither length is a product's action count. There
 * are **25** Macroplan actions: the 23 in the plan-family list plus those two. Counting
 * `PLAN_FAMILY_ACTIONS` alone answers 23 and is the mistake this note exists to stop.
 */
export const ACTIONS = [...MICROTASK_AND_WORKSPACE_ACTIONS, ...PLAN_FAMILY_ACTIONS] as const

/** Something a principal may attempt. */
export type Action = (typeof ACTIONS)[number]
