import type { RouteHandler } from '@hono/zod-openapi'
import { Forbidden, type Principal } from '@repo/kernel'
import type { ServiceContext, TokenDisposition } from '@repo/microtask-domain'
import { bundleProject, bundleWorkspace } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { ExportBundleBody, projectExportRoute, workspaceExportRoute } from './routes.js'

const ADMIN_ONLY = 'Only an admin may export live share tokens'

/**
 * The disposition this principal may be answered with, or a refusal.
 *
 * The one condition in the whole API that decides whether a response may carry live credentials.
 * Both export handlers call it and neither decides anything itself, so loosening `export:run` or
 * adding a third export address cannot bring the token-bearing variant along silently.
 *
 * Exported because the workspace address is the only part of that route the gate cannot
 * demonstrate from outside: `workspace:list-projects` refuses every link principal before this
 * runs, so no request to `GET /v1/microtask/export` can make this throw, and only a direct test
 * of it can show that it would. The project address does demonstrate it — a `manage` holder is
 * cleared by the gate there and refused here — but a test of that address measures one call site,
 * where this is the thing being insured.
 *
 * `Forbidden` rather than a second `authorize()` call: one gate per operation is what makes a
 * missing gate greppable, and this is not a second question about a target. It is shaping one
 * response for the principal the gate has already cleared, which is what `authorize` returns its
 * principal for.
 */
export const clearedDisposition = (
  principal: Principal,
  tokens: TokenDisposition,
): TokenDisposition => {
  if (tokens === 'preserve' && principal.kind !== 'admin') throw new Forbidden(ADMIN_ONLY)
  return tokens
}

/**
 * Exports every project in the product, as one bundle.
 *
 * The gate is `workspace:list-projects` on the workspace, so this address answers the admin and
 * nobody else — there is no scope in which "every project" is a question a seat may ask.
 *
 * `tokens=preserve` goes through {@link clearedDisposition}, the same call the project route
 * makes — and **no request to this address can reach that refusal**, the gate above having already
 * turned away everything that is not the admin. That is the point of it rather than an oversight:
 * one condition decides whether a response may carry live credentials, so the day this route is
 * reachable by anything else, the token-bearing variant does not come along with it. Being
 * unreachable from outside is also why that function is exported and tested directly.
 */
export const exportWorkspace =
  (ctx: ServiceContext): RouteHandler<typeof workspaceExportRoute, ApiEnv> =>
  async (c) => {
    const { tokens } = c.req.valid('query')
    const principal = authorize(c, 'workspace:list-projects', { kind: 'workspace' })
    const bundle = await bundleWorkspace(ctx, PRODUCT, clearedDisposition(principal, tokens))
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
 * clears each link against its own scope. This is the one address where that refusal is
 * reachable, so it is where a request can demonstrate it — a `manage` holder asking to preserve
 * is answered 403 here rather than a stripped 200, which is how a preserved-looking bundle would
 * otherwise get imported as new and drop every link a client holds. What the condition buys, and
 * why it is written once rather than at each call site, is in {@link clearedDisposition}.
 */
export const exportProject =
  (ctx: ServiceContext): RouteHandler<typeof projectExportRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { tokens } = c.req.valid('query')
    const principal = authorize(c, 'export:run', { kind: 'project', projectId })
    const at = { product: PRODUCT, projectId }
    const bundle = await bundleProject(ctx, at, clearedDisposition(principal, tokens))
    return c.json(bundle as ExportBundleBody, 200)
  }
