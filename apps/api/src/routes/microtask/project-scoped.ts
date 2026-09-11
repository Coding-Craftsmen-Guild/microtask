import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Folder, ProjectManifest, ShareLink, TaskEntry } from '@repo/contracts'
import { LIMITS, ProjectService, projectView } from '@repo/microtask-domain'
import { authorize } from '../../auth/authorize.js'
import type { ApiEnv } from '../../auth/env.js'
import type { ApiDeps } from '../../deps.js'
import { problemResponses } from '../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../http/security.js'
import { projectParams } from '../params.js'

/**
 * One project as this caller may be told about it.
 *
 * The manifest shape with `shareLinks` made **optional**, because an admin-only block a caller is
 * refused is absent rather than empty (ADR 0013). Extended from the contract rather than restated,
 * so a field added to a project cannot appear in the document without appearing here.
 *
 * The three collections are respelled only to be `readonly`, which is what `projectView` hands
 * back, and to take their `maxItems` from the domain's own caps instead of a number repeated in
 * `packages/contracts`. `readonly` is a TypeScript-only distinction and generates identically —
 * what it buys is a handler that returns the view directly with no copy and no cast.
 */
export const projectViewSchema = ProjectManifest.extend({
  folders: z.array(Folder).max(LIMITS.foldersPerProject).readonly(),
  tasks: z.array(TaskEntry).max(LIMITS.tasksPerProject).readonly(),
  shareLinks: z.array(ShareLink).max(LIMITS.shareLinksPerProject).readonly().optional(),
}).openapi('ProjectView')

const readProject = createRoute({
  method: 'get',
  path: '/',
  tags: ['projects'],
  summary: 'Read one project',
  description: 'Folders, task entries, and — for a caller the policy clears — its share links.',
  security: GUARDED_SECURITY,
  request: { params: projectParams },
  responses: {
    200: {
      description: 'The project, shaped for whoever asked',
      content: { 'application/json': { schema: projectViewSchema } },
    },
    ...problemResponses(),
  },
})

/**
 * The subtree addressed by one project id.
 *
 * Mounted at `/projects/:projectId` with a colon, because `route()` takes hono's path syntax
 * while `createRoute()` takes OpenAPI's braces. The brace form here 404s every route below while
 * the document still renders perfectly, which is a failure nothing but a live request detects.
 *
 * It is returned fully populated. A route added to a child after its parent has served is not an
 * error and not a warning — it is silently unreachable — so every route this subtree will ever
 * have is registered before `createMicrotask` mounts it, and this instance is mounted into
 * exactly one parent.
 */
export function createProjectScoped(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const projects = new ProjectService(deps)
  app.openapi(
    readProject,
    async (c) => {
      const { projectId } = c.req.valid('param')
      const principal = authorize(c, 'project:read', { kind: 'project', projectId })
      const manifest = await projects.read({ product: 'microtask', projectId })
      return c.json(projectView(manifest, principal), 200)
    },
  )
  return app
}
