import { OpenAPIHono } from '@hono/zod-openapi'
import { ProjectService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../auth/env.js'
import type { ApiDeps } from '../../deps.js'
import { exportProject } from './export/handlers.js'
import { projectExportRoute } from './export/routes.js'
import { createFolders } from './folders/app.js'
import { deleteProject, readProject, renameProject } from './projects/handlers.js'
import { deleteProjectRoute, readProjectRoute, renameProjectRoute } from './projects/routes.js'
import { createShareLinks } from './share-links/app.js'
import { createTasks } from './tasks/app.js'

/**
 * The subtree addressed by one project id.
 *
 * Mounted at `/projects/:projectId` with a colon, because `route()` takes hono's path syntax
 * while `createRoute()` takes OpenAPI's braces. The brace form here 404s every route below while
 * the document still renders perfectly, which is a failure nothing but a live request detects.
 *
 * It is returned fully populated, and so are the two children it mounts. A route added to a child
 * after its parent has served is not an error and not a warning — it is silently unreachable — so
 * every route this subtree will ever have is registered before `createMicrotask` mounts it, and
 * each child instance is mounted into exactly one parent.
 *
 * The project's own routes come before the two mounts only for readability; what matters is that
 * nothing here is registered after this function returns.
 */
export function createProjectScoped(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const projects = new ProjectService(deps)
  app.openapi(readProjectRoute, readProject(projects))
  app.openapi(renameProjectRoute, renameProject(projects))
  app.openapi(deleteProjectRoute, deleteProject(projects))
  app.openapi(projectExportRoute, exportProject(deps))
  app.route('/folders', createFolders(deps))
  app.route('/tasks', createTasks(deps))
  app.route('/share-links', createShareLinks(deps))
  return app
}
