/** The projects index, which is also where a deleted project's page has nothing left to show. */
export const PROJECTS_INDEX_PATH = '/'

/**
 * One project's admin page.
 *
 * The id is encoded rather than trusted to be a ULID: it arrives from a URL or from a browser,
 * and the one input that would need encoding is the one that came from somewhere unexpected.
 */
export const projectPagePath = (projectId: string): string => `/p/${encodeURIComponent(projectId)}`

/** One task's admin page, inside the project that owns it. */
export const taskPagePath = (projectId: string, taskId: string): string =>
  `${projectPagePath(projectId)}/t/${encodeURIComponent(taskId)}`
