import type { z } from 'zod'
import type { ProjectScope, Role, Scope } from './share-link.js'

/** The authority a share link carries, as a value rather than as a schema. */
export type RoleValue = z.infer<typeof Role>

/** What a share link may reach, as a value rather than as a schema. */
export type ScopeValue = z.infer<typeof Scope>

/** What a Microtask share link may reach, as a value rather than as a schema. */
export type ProjectScopeValue = z.infer<typeof ProjectScope>

/**
 * Which resource an action is decided against, named relative to the caller's own scope.
 *
 * The kernel's target kinds plus one: `own-scope`. `share:create` is authorized against the
 * **new link's scope** rather than against the project, and the narrowest scope a holder can
 * mint over is the one it already holds — so that is the question to ask on its behalf, and it
 * is the whole reason a task-scoped `manage` holder can share and then neither list nor revoke
 * (ADR 0038).
 */
export type CapabilityTarget =
  | 'workspace'
  | 'project'
  | 'folder'
  | 'task'
  | 'tab'
  | 'plan'
  | 'epic'
  | 'feature'
  | 'item'
  | 'own-scope'

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
   * `project:read` has one for a reason inside one product: reading a project is gated on the
   * project; reading its **folder list** is the same action gated on a `folder` target, which a
   * task scope refuses outright — that refusal is the breadcrumb ADR 0011 withholds. So a control
   * drawn from `capabilities()['project:read']` must be the project read and never the folder
   * tree; for the tree, ask {@link mayReach} with `'folder'`.
   *
   * `share:read`, `share:update` and `share:revoke` have one for a different reason: the share
   * actions are the share system's rather than either product's, so `GRANTS` serves both from one
   * row, and what separates the products is the scope check. Microtask gates them on the `project`
   * whose seats they administer and Macroplan on the `plan` whose seats they administer — the same
   * action, a different container. `target` can name only one, so a plan-scoped caller reads
   * `capabilities()['share:revoke']` as **false** and has to ask {@link mayReach} with `'plan'`.
   *
   * `share:read` is the one of the three that no `authorize(` scan can find, because Macroplan
   * decides it inside `visibleLinks` rather than at a route: a plan's seats arrive inside
   * `PlanView.shareLinks` rather than from a list endpoint. So nothing forced this row, and without
   * it the projection told a plan `manage` holder it could not read seats the server was already
   * handing over — the disagreement ADR 0038 exists to prevent, in the one shape its agreement test
   * cannot see.
   *
   * `share:create` needs no entry: it is decided against `own-scope` in both products.
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
  'share:read': { minimum: 'manage', target: 'project', alsoGatedOn: ['plan'] },
  'share:create': { minimum: 'manage', target: 'own-scope' },
  'share:revoke': { minimum: 'manage', target: 'project', alsoGatedOn: ['plan'] },
  'share:update': { minimum: 'manage', target: 'project', alsoGatedOn: ['plan'] },
  'export:run': { minimum: 'manage', target: 'project' },
  'workspace:list-projects': { minimum: 'admin', target: 'workspace' },
  'workspace:create-project': { minimum: 'admin', target: 'workspace' },
  'workspace:import': { minimum: 'admin', target: 'workspace' },
  'workspace:search': { minimum: 'admin', target: 'workspace' },
  'plan:read': { minimum: 'view', target: 'plan' },
  'plan:rename': { minimum: 'manage', target: 'plan' },
  'plan:retime': { minimum: 'manage', target: 'plan' },
  'plan:delete': { minimum: 'manage', target: 'plan' },
  'epic:create': { minimum: 'manage', target: 'epic' },
  'epic:rename': { minimum: 'manage', target: 'epic' },
  'epic:delete': { minimum: 'manage', target: 'epic' },
  'epic:reorder': { minimum: 'manage', target: 'epic' },
  'epic:bind': { minimum: 'admin', target: 'epic' },
  'feature:create': { minimum: 'write', target: 'feature' },
  'feature:rename': { minimum: 'write', target: 'feature' },
  'feature:estimate': { minimum: 'write', target: 'feature' },
  'feature:delete': { minimum: 'manage', target: 'feature' },
  'feature:place': { minimum: 'manage', target: 'feature' },
  'feature:depend': { minimum: 'manage', target: 'feature' },
  'item:create': { minimum: 'write', target: 'item' },
  'item:rename': { minimum: 'write', target: 'item' },
  'item:estimate': { minimum: 'write', target: 'item' },
  'item:describe': { minimum: 'write', target: 'item' },
  'item:delete': { minimum: 'manage', target: 'item' },
  'item:place': { minimum: 'manage', target: 'item' },
  'item:link': { minimum: 'write', target: 'item' },
  'workspace:list-plans': { minimum: 'admin', target: 'workspace' },
  'workspace:create-plan': { minimum: 'admin', target: 'workspace' },
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
 * `export:run` and `workspace:import` both have routes now — two export addresses, and **five**
 * import-session ones: open a session, upload a chunk, expand an archive, preview, confirm — and
 * the scan above confirms both targets against the `authorize()` call each handler makes. That
 * five is the count `authorize-targets.test.ts` asserts, gate by gate, rather than a number read
 * off this comment.
 *
 * Three rows are left that the scan cannot confirm, for two different reasons.
 * `workspace:search` has a route and will never be confirmable from it: its gate names a computed
 * action and a computed target, so there is no literal in the source to read. The other two are
 * `epic:bind` and `item:link`, the phase-4 bridge actions, which have no route at all —
 * `authorize-targets.test.ts` records those by name in `PENDING_ROUTES` and fails the moment one
 * of them is gated without being struck off, which is how the Macroplan rows that *did* acquire
 * routes left that set while `workspace:search` stays outside the scan for good.
 *
 * Declared at the widened type rather than left as the literal the rows infer, so a caller may
 * read `alsoGatedOn` off any row instead of only off the rows that happen to carry one.
 */
export const ACTION_DECISIONS: Readonly<Record<CapabilityAction, ActionDecision>> = ROWS

/** Every action {@link capabilities} answers for, in the order the rows are written. */
export const CAPABILITY_ACTIONS = Object.keys(ROWS) as readonly CapabilityAction[]

/** The boolean set a UI renders from: one answer per action, for one role in one scope. */
export type Capabilities = Readonly<Record<CapabilityAction, boolean>>

const RANK: Readonly<Record<CapabilityMinimum, number>> = { view: 0, write: 1, manage: 2, admin: 3 }

const PROJECT_ACTIONS_A_TASK_SCOPE_REACHES: readonly CapabilityAction[] = ['project:read']

const PROJECT_FAMILY: readonly CapabilityTarget[] = ['project', 'folder', 'task', 'tab']
const PLAN_FAMILY: readonly CapabilityTarget[] = ['plan', 'epic', 'feature', 'item']

const FAMILY_BY_SCOPE_KIND: Readonly<Record<ScopeValue['kind'], readonly CapabilityTarget[]>> = {
  project: PROJECT_FAMILY,
  task: PROJECT_FAMILY,
  plan: PLAN_FAMILY,
}

const inScope = (
  scope: ScopeValue,
  action: CapabilityAction,
  target: CapabilityTarget,
): boolean => {
  if (target === 'own-scope') return true
  if (!FAMILY_BY_SCOPE_KIND[scope.kind].includes(target)) return false
  if (scope.kind !== 'task') return true
  if (target === 'project') return PROJECT_ACTIONS_A_TASK_SCOPE_REACHES.includes(action)
  return target !== 'folder'
}

/**
 * Whether this role, in this scope, clears this action against this particular target.
 *
 * The whole projection lives here; {@link capabilities} is the record over it. A caller needs
 * this directly only for an action the API gates on more than one target — see
 * {@link ActionDecision.alsoGatedOn}, which today means the folder tree and the plan a Macroplan
 * seat is administered from.
 *
 * The target is taken to sit **inside the project `scope` names**, because a
 * {@link CapabilityTarget} is a bare kind with no id to compare. The kernel compares the id as
 * well, so reusing one scope's answers to draw controls for a different project would draw
 * controls the API refuses: `mayReach('manage', scopeOfA, 'folder:create', 'folder')` is true
 * while `can()` on a folder of project B is false. Ask with the scope you hold.
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
  const rows = CAPABILITY_ACTIONS.map(
    (action) => [action, mayReach(role, scope, action, ACTION_DECISIONS[action].target)] as const,
  )
  return Object.fromEntries(rows) as Capabilities
}
