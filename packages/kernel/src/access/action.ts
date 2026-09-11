/** Every action the policy can decide. Adding one requires a policy decision. */
export const ACTIONS = [
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
] as const

/** Something a principal may attempt. */
export type Action = (typeof ACTIONS)[number]
