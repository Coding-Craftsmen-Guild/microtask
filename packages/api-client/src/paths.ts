import type { TabRef, TaskRef } from './types.js'

/** The collection every project path is built from. */
export const PROJECTS_PATH = '/v1/microtask/projects'

/** Where a search is asked. */
export const SEARCH_PATH = '/v1/microtask/search'

/** Where a link holder asks about the credential it presented. */
export const CURRENT_SHARE_PATH = '/v1/microtask/shares/current'

/** Where a password is exchanged for an admin token. */
export const LOGIN_PATH = '/v1/auth/login'

/**
 * One project's path.
 *
 * Every id goes through `encodeURIComponent`. Ids are ULIDs and tokens are alphanumeric, so
 * nothing normally needs encoding — which is the reason to do it here rather than trusting that:
 * the one input that would need it is the one that arrived from somewhere unexpected, and a
 * caller building a path by hand is how a `..` segment reaches a router.
 */
export const projectPath = (projectId: string): string =>
  `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`

/** One task's path, built from the project that owns it. */
export const taskPath = (ref: TaskRef): string =>
  `${projectPath(ref.projectId)}/tasks/${encodeURIComponent(ref.taskId)}`

/** One tab's path, built from the task that owns it. */
export const tabPath = (ref: TabRef): string =>
  `${taskPath(ref)}/tabs/${encodeURIComponent(ref.tabId)}`

/**
 * Where a whole product's bundle is asked for.
 *
 * It sits beside the projects collection rather than under it because it names no project: the
 * per-project address is {@link projectExportPath} below (ADR 0009).
 */
export const WORKSPACE_EXPORT_PATH = '/v1/microtask/export'

/** Where import sessions are opened, and the root every upload into one is addressed under. */
export const IMPORT_SESSIONS_PATH = '/v1/microtask/import/sessions'

/** One project's export path, built from the project that owns it. */
export const projectExportPath = (projectId: string): string => `${projectPath(projectId)}/export`

/** One import session's path, which every upload, preview and confirm is built from. */
export const importSessionPath = (sessionId: string): string =>
  `${IMPORT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`

/**
 * The collection every plan path is built from.
 *
 * The `/v1/macroplan` prefix is the whole reason the Macroplan clients are siblings rather than the
 * existing ones widened: every product root above hard-codes `/v1/microtask`, and ADR 0014 puts the
 * product dimension in the path itself, so one client cannot address both products. `LOGIN_PATH` is
 * the exception that proves the rule — ADR 0014 keeps `/v1/auth` product-agnostic, which is why one
 * `login` serves both surfaces and is not duplicated here.
 */
export const MACROPLAN_PLANS_PATH = '/v1/macroplan/plans'

/** Where a plan seat asks about the credential it presented. */
export const MACROPLAN_CURRENT_SHARE_PATH = '/v1/macroplan/shares/current'

/** One plan, by id, with the id encoded for the reason {@link projectPath} gives. */
export const planPath = (planId: string): string =>
  `${MACROPLAN_PLANS_PATH}/${encodeURIComponent(planId)}`

/** One item of one plan, built from the plan that owns it. */
export const planItemPath = (planId: string, itemId: string): string =>
  `${planPath(planId)}/items/${encodeURIComponent(itemId)}`
