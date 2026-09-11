import type { RouteHandler } from '@hono/zod-openapi'
import type { Principal } from '@repo/kernel'
import { NotFound } from '@repo/kernel'
import type { ProjectManifest, ProjectService, ShareLink } from '@repo/microtask-domain'
import { shareView } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { currentShareRoute } from './routes.js'

const NO_LINK = 'This credential does not name a share link'

const actingLink = (principal: Principal): Extract<Principal, { kind: 'link' }> => {
  if (principal.kind !== 'link') throw new NotFound(NO_LINK)
  return principal
}

const storedLink = (manifest: ProjectManifest, token: string): ShareLink => {
  const found = manifest.shareLinks.find((link) => link.token === token)
  if (found === undefined) throw new NotFound(NO_LINK)
  return found
}

/**
 * Describes the share link the caller presented, and what it reaches.
 *
 * The token comes from `c.get('principal')` — never from a path segment and never from a header
 * schema — so the credential stays in the `Authorization` header where it cannot reach a log
 * line or a `Referer` (ADR 0013). The view it builds carries no token at all, its own included:
 * the caller already has the one it sent, and a response with no token field cannot leak
 * somebody else's.
 *
 * An admin credential names no share link, so it is answered 404 rather than 403: it is not
 * refused the question, there is simply no current share to describe. Narrowing to a link before
 * the gate is also what lets the single `authorize` call have a target at all — the target is
 * the caller's own scope root, and an admin has no scope to derive one from.
 *
 * The stored link is looked up rather than rebuilt from the principal, so what the caller is
 * told is what the manifest holds. Resolution found it a moment ago, so its absence means it was
 * revoked in between — a real race, and one that must answer the same 404 as an unknown token
 * rather than a 500.
 */
export const readCurrentShare =
  (projects: ProjectService): RouteHandler<typeof currentShareRoute, ApiEnv> =>
  async (c) => {
    const link = actingLink(c.get('principal'))
    const { projectId } = link.scope
    authorize(c, 'project:read', { kind: 'project', projectId })
    const manifest = await projects.read({ product: PRODUCT, projectId })
    return c.json(shareView(manifest, storedLink(manifest, link.token)), 200)
  }
