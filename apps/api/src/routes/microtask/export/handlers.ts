import type { RouteHandler } from '@hono/zod-openapi'
import { Forbidden, type Principal } from '@repo/kernel'
import type { ServiceContext, TokenDisposition } from '@repo/microtask-domain'
import { bundleProject, bundleWorkspace } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { ExportBundleBody, projectExportRoute, workspaceExportRoute } from './routes.js'

const ADMIN_ONLY = 'Only an admin may export live share tokens'

const cleared = (principal: Principal, tokens: TokenDisposition): TokenDisposition => {
  if (tokens === 'preserve' && principal.kind !== 'admin') throw new Forbidden(ADMIN_ONLY)
  return tokens
}

/**
 * Exports every project in the product, as one bundle.
 *
 * The gate is `workspace:list-projects` on the workspace, so this address answers the admin and
 * nobody else — there is no scope in which "every project" is a question a seat may ask.
 *
 * `tokens=preserve` is refused a non-admin by {@link Forbidden} rather than by a second
 * `authorize()` call, because the API's one-gate-per-operation rule is what makes a missing gate
 * greppable, and this is not a second question about a target: it is shaping one response for the
 * principal `authorize` just returned. It is also refused rather than silently stripped. A 200
 * that answers a different question than was asked is how a preserved-looking bundle gets
 * imported as new and drops every link a client already holds.
 */
export const exportWorkspace =
  (ctx: ServiceContext): RouteHandler<typeof workspaceExportRoute, ApiEnv> =>
  async (c) => {
    const { tokens } = c.req.valid('query')
    const principal = authorize(c, 'workspace:list-projects', { kind: 'workspace' })
    const bundle = await bundleWorkspace(ctx, PRODUCT, cleared(principal, tokens))
    return c.json(bundle as ExportBundleBody, 200)
  }

/**
 * Exports the one project addressed, in the same envelope.
 *
 * `export:run` against this project: `manage` holds it, `write` does not, and a task-scoped
 * `manage` is refused because a task scope reaches only `project:read` on a project target. So
 * the refusals here are the policy's, not this handler's, and `capabilities()` answers the UI the
 * same way — a task seat is drawn no export control.
 *
 * The admin check on `preserve` **discloses nothing today**, and a claim that it did would be
 * refuted by the fixture beside this: a `manage` holder reads this project through
 * `GET /v1/microtask/projects/{projectId}` and receives all four of its links with their tokens,
 * the task-scoped one included, because `share:read` is `manage` on a project and `visibleLinks`
 * clears each link against its own scope. What the check buys is that **one condition, in one
 * place, decides whether a response may carry live credentials**, instead of that following
 * implicitly from two route gates plus a per-link view filter. Loosen `export:run` to `write`, or
 * add a second non-admin export address, and the token-bearing variant does not come along
 * silently.
 */
export const exportProject =
  (ctx: ServiceContext): RouteHandler<typeof projectExportRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { tokens } = c.req.valid('query')
    const principal = authorize(c, 'export:run', { kind: 'project', projectId })
    const at = { product: PRODUCT, projectId }
    const bundle = await bundleProject(ctx, at, cleared(principal, tokens))
    return c.json(bundle as ExportBundleBody, 200)
  }
