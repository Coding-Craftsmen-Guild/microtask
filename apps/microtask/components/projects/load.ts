import type { Decoded, Project } from '@repo/api-client'
import type { ProjectListItem } from '@repo/contracts'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { adminCall, type ActionResult } from '../../actions/result'
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

const MISSING = new Set([404, 422])

/**
 * One project, for its page and that page's title, read once per request.
 *
 * `cache` is what lets `generateMetadata` and the page share one read rather than make two. A
 * project that does not exist — or an id that is not an id, which the API answers 422 — is
 * `notFound()`, so both render the same not-found page rather than an error.
 *
 * What comes back is the full view **including share links with their tokens**. It is for the
 * server to count; `projectPageModel` is where it stops, and nothing it returns is a token.
 */
export const loadProject = cache(async (projectId: string): Promise<ActionResult<Project>> => {
  const result = await adminCall(projectPagePath(projectId), (api) => api.projects.read(projectId))
  if (!result.ok && MISSING.has(result.status)) notFound()
  return result
})
