import type { z } from 'zod'
import type { Role, Scope } from './share-link.js'

/** The authority a share link carries, as a value rather than as a schema. */
export type RoleValue = z.infer<typeof Role>

/** What a share link may reach, as a value rather than as a schema. */
export type ScopeValue = z.infer<typeof Scope>

/**
 * Which resource an action is decided against, named relative to the caller's own scope.
 *
 * The kernel's target kinds plus one: `own-scope`. `share:create` is authorized against the
 * **new link's scope** rather than against the project, and the narrowest scope a holder can
 * mint over is the one it already holds — so that is the question to ask on its behalf, and it
 * is the whole reason a task-scoped `manage` holder can share and then neither list nor revoke
 * (ADR 0038).
 */
export type CapabilityTarget = 'workspace' | 'project' | 'folder' | 'task' | 'tab' | 'own-scope'

/**
 * The weakest role an action needs, or `admin` for one no link role reaches.
 *
 * An ordering rather than three sets, because the kernel's grants nest — `view` ⊂ `write` ⊂
 * `manage` — so a minimum is one fact per action instead of the same action written into two
 * lists. The agreement test is what proves the two encodings answer alike.
 */
export type CapabilityMinimum = RoleValue | 'admin'

/** What decides one action: the weakest role that holds it, and what it is decided against. */
export interface ActionDecision {
  /** The weakest role granted this action, or `admin` where no link role is. */
  readonly minimum: CapabilityMinimum

  /** The target {@link capabilities} answers this action against. */
  readonly target: CapabilityTarget

  /**
   * Further targets the API gates the same action on, which a caller must ask about by name.
   *
   * Only `project:read` has one. Reading a project is gated on the project; reading its **folder
   * list** is the same action gated on a `folder` target, which a task scope refuses outright —
   * that refusal is the breadcrumb ADR 0011 withholds. So a control drawn from
   * `capabilities()['project:read']` must be the project read and never the folder tree; for the
   * tree, ask {@link mayReach} with `'folder'`.
   */
  readonly alsoGatedOn?: readonly CapabilityTarget[]
}

const ROWS = {
  'project:read': { minimum: 'view', target: 'project', alsoGatedOn: ['folder'] },
  'project:rename': { minimum: 'manage', target: 'project' },
  'project:delete': { minimum: 'manage', target: 'project' },
  'folder:create': { minimum: 'write', target: 'folder' },
  'folder:rename': { minimum: 'write', target: 'folder' },
  'folder:delete': { minimum: 'manage', target: 'folder' },
  'folder:reorder': { minimum: 'manage', target: 'folder' },
  'task:create': { minimum: 'write', target: 'project' },
  'task:read': { minimum: 'view', target: 'task' },
  'task:rename': { minimum: 'write', target: 'task' },
  'task:delete': { minimum: 'manage', target: 'task' },
  'task:move': { minimum: 'manage', target: 'task' },
  'task:reorder': { minimum: 'manage', target: 'project' },
  'tab:create': { minimum: 'write', target: 'tab' },
  'tab:rename': { minimum: 'write', target: 'tab' },
  'tab:delete': { minimum: 'manage', target: 'tab' },
  'tab:reorder': { minimum: 'manage', target: 'tab' },
  'tab:write': { minimum: 'write', target: 'tab' },
  'share:read': { minimum: 'manage', target: 'project' },
  'share:create': { minimum: 'manage', target: 'own-scope' },
  'share:revoke': { minimum: 'manage', target: 'project' },
  'share:update': { minimum: 'manage', target: 'project' },
  'export:run': { minimum: 'manage', target: 'project' },
  'workspace:list-projects': { minimum: 'admin', target: 'workspace' },
  'workspace:create-project': { minimum: 'admin', target: 'workspace' },
  'workspace:import': { minimum: 'admin', target: 'workspace' },
  'workspace:search': { minimum: 'admin', target: 'workspace' },
} as const

/** One of the actions {@link capabilities} answers for. */
export type CapabilityAction = keyof typeof ROWS

/**
 * Every action, with the weakest role it needs and the target it is decided against.
 *
 * One row per action and both facts on it, so a new action cannot arrive with a role and no
 * target or the other way round. The target column is not a reading of the policy: each entry is
 * the target the API's single `authorize()` call for that action builds, checked row by row
 * against the handlers themselves by `apps/api/src/routes/authorize-targets.test.ts`.
 *
 * `workspace:search` is the one row whose API target varies by principal — ADR 0009 gates it on
 * the caller's own scope root. The action itself is admin authority, "search across everything",
 * so it is recorded as such; what a link holder may ask instead is `project:read` or
 * `task:read`, which have rows of their own.
 *
 * `export:run` and `workspace:import` have no route yet, so their rows are the policy's answer
 * and nothing has confirmed the target against a gate.
 *
 * Declared at the widened type rather than left as the literal the rows infer, so a caller may
 * read `alsoGatedOn` off any row instead of off the one row that happens to carry it.
 */
export const ACTION_DECISIONS: Readonly<Record<CapabilityAction, ActionDecision>> = ROWS

/** Every action {@link capabilities} answers for, in the order the rows are written. */
export const CAPABILITY_ACTIONS = Object.keys(ROWS) as readonly CapabilityAction[]

/** The boolean set a UI renders from: one answer per action, for one role in one scope. */
export type Capabilities = Readonly<Record<CapabilityAction, boolean>>

const RANK: Readonly<Record<CapabilityMinimum, number>> = { view: 0, write: 1, manage: 2, admin: 3 }

const PROJECT_ACTIONS_A_TASK_SCOPE_REACHES: readonly CapabilityAction[] = ['project:read']

const inScope = (
  scope: ScopeValue,
  action: CapabilityAction,
  target: CapabilityTarget,
): boolean => {
  if (target === 'workspace') return false
  if (scope.kind === 'project') return true
  if (target === 'project') return PROJECT_ACTIONS_A_TASK_SCOPE_REACHES.includes(action)
  return target !== 'folder'
}

/**
 * Whether this role, in this scope, clears this action against this particular target.
 *
 * The whole projection lives here; {@link capabilities} is the record over it. A caller needs
 * this directly only for an action the API gates on more than one target — see
 * {@link ActionDecision.alsoGatedOn}, which today means the folder tree.
 */
export function mayReach(
  role: RoleValue,
  scope: ScopeValue,
  action: CapabilityAction,
  target: CapabilityTarget,
): boolean {
  return RANK[role] >= RANK[ACTION_DECISIONS[action].minimum] && inScope(scope, action, target)
}

/**
 * What a share-link holder of this role, in this scope, should see controls for.
 *
 * A **rendering** question and never a gate: it answers "should this be on screen", the API
 * answers "may this request proceed", and a 403 remains possible where a link is downgraded
 * between render and click (ADR 0008). It exists because ADR 0027 forbids an app importing
 * `@repo/kernel`, so the process deciding whether to draw a share manager cannot ask `can()` —
 * and it is admitted only because an exhaustive contract test holds it to `can()`'s answers for
 * every role, scope, action and target (ADR 0038, amending ADR 0009).
 *
 * Each answer is for that action's own `target`. Where an action is gated on a second target the
 * record cannot express both, so ask {@link mayReach}.
 *
 * There is no admin case. An admin is not a role in this model; it clears everything, and a page
 * rendering for one has no scope to ask about.
 */
export function capabilities(role: RoleValue, scope: ScopeValue): Capabilities {
  const answer = (action: CapabilityAction): boolean =>
    mayReach(role, scope, action, ACTION_DECISIONS[action].target)
  return {
    'project:read': answer('project:read'),
    'project:rename': answer('project:rename'),
    'project:delete': answer('project:delete'),
    'folder:create': answer('folder:create'),
    'folder:rename': answer('folder:rename'),
    'folder:delete': answer('folder:delete'),
    'folder:reorder': answer('folder:reorder'),
    'task:create': answer('task:create'),
    'task:read': answer('task:read'),
    'task:rename': answer('task:rename'),
    'task:delete': answer('task:delete'),
    'task:move': answer('task:move'),
    'task:reorder': answer('task:reorder'),
    'tab:create': answer('tab:create'),
    'tab:rename': answer('tab:rename'),
    'tab:delete': answer('tab:delete'),
    'tab:reorder': answer('tab:reorder'),
    'tab:write': answer('tab:write'),
    'share:read': answer('share:read'),
    'share:create': answer('share:create'),
    'share:revoke': answer('share:revoke'),
    'share:update': answer('share:update'),
    'export:run': answer('export:run'),
    'workspace:list-projects': answer('workspace:list-projects'),
    'workspace:create-project': answer('workspace:create-project'),
    'workspace:import': answer('workspace:import'),
    'workspace:search': answer('workspace:search'),
  }
}
