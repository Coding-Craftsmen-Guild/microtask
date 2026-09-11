import type { Decoded, Project } from '@repo/api-client'
import type { ProjectListItem } from '@repo/contracts'
import { cache } from 'react'
import { adminCall, adminRead, type ActionResult } from '../../actions/result'
import { PROJECTS_INDEX_PATH, projectPagePath } from './paths'

/**
 * Every project, for the index — as list items, which carry a share-link **count** and never a
 * token (ADR 0033). An expired session redirects to sign in; any other failure comes back to be
 * shown in place of the list.
 */
export async function loadProjects(): Promise<ActionResult<readonly Decoded<typeof ProjectListItem>[]>> {
  return adminCall(PROJECTS_INDEX_PATH, async (api) => {
    const { projects } = await api.projects.list()
    return projects
  })
}

/**
 * One project, for its page and that page's title, read once per request.
 *
 * `cache` is what lets `generateMetadata` and the page share one read rather than make two, and
 * `adminRead` is what makes a project that does not exist — or an id that is not an id — render
 * the same not-found page from both rather than an error.
 *
 * What comes back is the full view **including share links with their tokens**. It is for the
 * server to count; `projectPageModel` is where it stops, and nothing it returns is a token.
 */
export const loadProject = cache(
  async (projectId: string): Promise<ActionResult<Project>> =>
    adminRead(projectPagePath(projectId), (api) => api.projects.read(projectId)),
)
