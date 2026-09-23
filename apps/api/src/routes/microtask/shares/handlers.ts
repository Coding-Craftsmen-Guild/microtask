import type { RouteHandler } from '@hono/zod-openapi'
import type { Principal, ProjectScope } from '@repo/kernel'
import { Forbidden, isProjectScope, NotFound } from '@repo/kernel'
import type { ProjectManifest, ProjectService, ShareLink } from '@repo/microtask-domain'
import { shareView } from '@repo/microtask-domain'
import { authorize, notPermitted } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { currentShareRoute } from './routes.js'

const NO_LINK = 'This credential does not name a share link'

type MicrotaskLink = Extract<Principal, { kind: 'link' }> & { readonly scope: ProjectScope }

const actingLink = (principal: Principal): MicrotaskLink => {
  if (principal.kind !== 'link') throw new NotFound(NO_LINK)
  if (!isProjectScope(principal.scope)) throw new Forbidden(notPermitted('project:read'))
  return { ...principal, scope: principal.scope }
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
 * The acting link is narrowed to a **project-rooted** scope, because `Principal` spans both
 * products and a Microtask route means one of them. That narrowing is **checked** rather than cast:
 * one token index serves both products, so `PrincipalResolver.resolve` can legitimately return a
 * plan-scoped link, and `principal as MicrotaskLink` would be asserting in the authorization path
 * something no code had established. The check is `isProjectScope`, the kernel's own guard for the
 * type, so the narrower type is earned rather than claimed.
 *
 * What refuses a plan holder is `requireProduct` at the mount, not this check. The claim that stood
 * here — that this is the only route in the subtree needing one — was false when it was written:
 * `searchGate` builds its target from the caller's own scope too, and asked `project:read` about a
 * `plan` target rather than refusing it. So the guard is registered once beside the credential
 * guard, and every route added to this subtree gets it without knowing about it.
 *
 * The check survives that guard because it is the only thing that can give this handler a
 * `ProjectScope`. A middleware refusal is invisible to the compiler: `principal.scope` is still the
 * full union here, and `scope.projectId` below needs the narrower type. So the guard owns the
 * refusal and this owns the type, and the `Forbidden` it raises is unreachable through the app —
 * kept, and worded by `notPermitted` rather than by hand, so that the two layers cannot disagree if
 * some future mount forgets the guard.
 *
 * That refusal is a **403 and not a 404**, for the reason `requireProduct` gives: answering 404
 * would claim the caller's link does not exist, which is untrue — it exists, in the other product —
 * and would tell a plan holder that a Microtask project it named was absent. The admin's 404 above
 * is a different statement and keeps its status: an admin credential names no share link at all.
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
