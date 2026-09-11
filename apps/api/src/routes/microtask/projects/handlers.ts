import type { RouteHandler } from '@hono/zod-openapi'
import type { ProjectService } from '@repo/microtask-domain'
import { projectListItem, projectView } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createProjectRoute,
  deleteProjectRoute,
  listProjectsRoute,
  readProjectRoute,
  renameProjectRoute,
} from './routes.js'

/**
 * Lists every project, each shaped for whoever asked.
 *
 * The gate asks about the workspace rather than about any one project, which is the whole of
 * ADR 0009: a collection route has no per-resource target, and `workspace:list-projects` is
 * admin-only, so a link holder is refused here rather than handed a filtered list.
 *
 * Shaped by `projectListItem` and not `projectView`: a list of 500 projects carrying up to 50
 * live tokens each is a credential dump on the one screen with no use for a single one of them,
 * and anything a Server Component passes a client component lands in the page source
 * (ADR 0033). The count it carries instead is gated on the same `share:read` decision the block
 * was, so a caller refused the links is refused the number too.
 */
export const listProjects =
  (projects: ProjectService): RouteHandler<typeof listProjectsRoute, ApiEnv> =>
  async (c) => {
    const principal = authorize(c, 'workspace:list-projects', { kind: 'workspace' })
    const manifests = await projects.list(PRODUCT)
    return c.json({ projects: manifests.map((one) => projectListItem(one, principal)) }, 200)
  }

/**
 * Creates an empty project and answers 201.
 *
 * The status is the numeric `201` and never the string `'201'`: a string status is silently
 * ignored and the response goes out as 200, with no runtime guard anywhere to catch it.
 */
export const createProject =
  (projects: ProjectService): RouteHandler<typeof createProjectRoute, ApiEnv> =>
  async (c) => {
    const { name } = c.req.valid('json')
    const principal = authorize(c, 'workspace:create-project', { kind: 'workspace' })
    const created = await projects.create(PRODUCT, name)
    return c.json(projectView(created, principal), 201)
  }

/** Reads one project, dropping every part of it this caller is refused. */
export const readProject =
  (projects: ProjectService): RouteHandler<typeof readProjectRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const principal = authorize(c, 'project:read', { kind: 'project', projectId })
    const found = await projects.read({ product: PRODUCT, projectId })
    return c.json(projectView(found, principal), 200)
  }

/** Renames one project, leaving its folders, tasks and links alone. */
export const renameProject =
  (projects: ProjectService): RouteHandler<typeof renameProjectRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    const principal = authorize(c, 'project:rename', { kind: 'project', projectId })
    const renamed = await projects.rename({ product: PRODUCT, projectId }, name)
    return c.json(projectView(renamed, principal), 200)
  }

/**
 * Removes one project and answers 204 with no body.
 *
 * `authorize` is called for its refusal, not for the principal it returns: there is nothing left
 * to shape per principal once the project is gone.
 */
export const deleteProject =
  (projects: ProjectService): RouteHandler<typeof deleteProjectRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    authorize(c, 'project:delete', { kind: 'project', projectId })
    await projects.remove({ product: PRODUCT, projectId })
    return c.body(null, 204)
  }
