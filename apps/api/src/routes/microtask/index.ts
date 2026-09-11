import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { AdminVerifier } from '../../auth/admin-verifier.js'
import { authorize } from '../../auth/authorize.js'
import type { ApiEnv } from '../../auth/env.js'
import { PrincipalResolver } from '../../auth/principal-resolver.js'
import { requirePrincipal } from '../../auth/require-principal.js'
import type { ApiDeps } from '../../deps.js'
import { problemResponses } from '../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../http/security.js'
import { ProjectService, projectView } from '@repo/microtask-domain'
import { createProjectScoped, projectViewSchema } from './project-scoped.js'

const PRODUCT = 'microtask'

const resolverFor = (deps: ApiDeps): PrincipalResolver =>
  new PrincipalResolver({
    admin: new AdminVerifier({ config: deps.config, clock: deps.clock }),
    tokens: deps.tokens,
    store: deps.store,
  })

const listProjects = createRoute({
  method: 'get',
  path: '/projects',
  tags: ['projects'],
  summary: 'List every project in this product',
  security: GUARDED_SECURITY,
  responses: {
    200: {
      description: 'Every project, most recently updated first',
      content: {
        'application/json': { schema: z.object({ projects: z.array(projectViewSchema) }) },
      },
    },
    ...problemResponses(),
  },
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
 */
export function createMicrotask(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.use('*', requirePrincipal(resolverFor(deps), deps.config.serviceKeys))
  const projects = new ProjectService(deps)
  app.openapi(
    listProjects,
    async (c) => {
      const principal = authorize(c, 'workspace:list-projects', { kind: 'workspace' })
      const manifests = await projects.list(PRODUCT)
      return c.json({ projects: manifests.map((one) => projectView(one, principal)) }, 200)
    },
  )
  app.route('/projects/:projectId', createProjectScoped(deps))
  return app
}
