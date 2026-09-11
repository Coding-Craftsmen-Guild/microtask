import type { RouteHandler } from '@hono/zod-openapi'
import type { Principal } from '@repo/kernel'
import type { ShareLinkService } from '@repo/microtask-domain'
import { requestedScope } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { createShareLinkRoute, listShareLinksRoute, revokeShareLinkRoute } from './routes.js'

const mintedBy = (principal: Principal): string | null =>
  principal.kind === 'link' ? principal.token : null

/** Lists the project's share links, which every caller the gate clears may see in full. */
export const listShareLinks =
  (links: ShareLinkService): RouteHandler<typeof listShareLinksRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    authorize(c, 'share:read', { kind: 'project', projectId })
    const shareLinks = await links.list({ product: PRODUCT, projectId })
    return c.json({ shareLinks }, 200)
  }

/**
 * Mints a share link over the scope the body asks for, and answers 201.
 *
 * The scope is resolved before the gate and then handed to the service, so the question the
 * policy answered and the scope that gets stored are the same value rather than two derivations
 * of it. A `Scope` is already a valid `Target`, so the gate asks about the thing being shared
 * with no translation in between — which is why a task-scoped holder is cleared for its own task
 * and refused the project without either case being written down here.
 *
 * `createdBy` comes from the credential that presented the request and never from the body, so a
 * client cannot name a parent it was not minted through. That field is what the revocation
 * cascade walks, and a link free to choose its own parent could place itself outside the subtree
 * a leaked manager takes with it (ADR 0010). The admin records nothing, having no link to
 * descend from.
 */
export const createShareLink =
  (links: ShareLinkService): RouteHandler<typeof createShareLinkRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const request = c.req.valid('json')
    const scope = requestedScope(projectId, request)
    const principal = authorize(c, 'share:create', scope)
    const created = await links.create(
      { product: PRODUCT, projectId },
      { name: request.name, role: request.role, scope, createdBy: mintedBy(principal) },
    )
    return c.json(created, 201)
  }

/** Revokes a link and every link descended from it, reporting all of them. */
export const revokeShareLink =
  (links: ShareLinkService): RouteHandler<typeof revokeShareLinkRoute, ApiEnv> =>
  async (c) => {
    const { projectId, token } = c.req.valid('param')
    authorize(c, 'share:revoke', { kind: 'project', projectId })
    const revoked = await links.revoke({ product: PRODUCT, projectId }, token)
    return c.json({ revoked }, 200)
  }
