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

