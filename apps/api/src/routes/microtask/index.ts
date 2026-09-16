import { OpenAPIHono } from '@hono/zod-openapi'
import { ProjectService, SearchService } from '@repo/microtask-domain'
import { AdminVerifier } from '../../auth/admin-verifier.js'
import type { ApiEnv } from '../../auth/env.js'
import { PrincipalResolver } from '../../auth/principal-resolver.js'
import { requirePrincipal } from '../../auth/require-principal.js'
import type { ApiDeps } from '../../deps.js'
import { exportWorkspace } from './export/handlers.js'
import { workspaceExportRoute } from './export/routes.js'
import { createImport } from './import/app.js'
import { createProjectScoped } from './project-scoped.js'
import { createProject, listProjects } from './projects/handlers.js'
import { createProjectRoute, listProjectsRoute } from './projects/routes.js'
import { search } from './search/handlers.js'
import { searchRoute } from './search/routes.js'
import { readCurrentShare } from './shares/handlers.js'
import { currentShareRoute } from './shares/routes.js'

const resolverFor = (deps: ApiDeps): PrincipalResolver =>
  new PrincipalResolver({
    admin: new AdminVerifier({ config: deps.config, clock: deps.clock }),
    tokens: deps.tokens,
    store: deps.store,
  })

/**
 * Everything this product serves, behind the credential guard.
 *
 * The guard is the first statement after construction and nothing is mounted before it. A
 * `.use()` registered after the `.route()` or `.openapi()` it should protect never runs, and the
 * request still answers 200 — no warning, no failing route, only an open endpoint. Registering it
 * as `'*'` rather than per route is also what makes an unmatched path under this subtree answer
 * 401 before 404, so a token cannot map the API by probing.
 *
 * It authenticates and does not authorize: every handler below still builds a target from its
 * validated params and calls `authorize`. A `view` link scoped to one project reaches every path
 * here; what stops it reading another project is that call and nothing else.
 *
 * The five routes registered here rather than in the project-scoped child are the ones with no
 * project in their address: two collections, the bootstrap call that describes the caller's own
 * credential, a search that spans every project, and an export of all of them. `/import` is
 * mounted beside them for a stronger version of the same reason — an import *creates* projects,
 * so there is no project id it could hang under. The project-scoped child is mounted at
 * `/projects/:projectId`, a path none of the six has a value for.
 */
export function createMicrotask(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.use('*', requirePrincipal(resolverFor(deps), deps.config.serviceKeys))
  const projects = new ProjectService(deps)
  app.openapi(listProjectsRoute, listProjects(projects))
  app.openapi(createProjectRoute, createProject(projects))
  app.openapi(currentShareRoute, readCurrentShare(projects))
  app.openapi(searchRoute, search(new SearchService(deps)))
  app.openapi(workspaceExportRoute, exportWorkspace(deps))
  app.route('/import', createImport(deps))
  app.route('/projects/:projectId', createProjectScoped(deps))
  return app
}
