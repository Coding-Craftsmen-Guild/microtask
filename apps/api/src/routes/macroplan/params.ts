import { z } from '@hono/zod-openapi'
import { EntityId, ShareToken } from '@repo/contracts'

/**
 * A route mounted under `/plans/{planId}`.
 *
 * Every builder below extends this one rather than declaring its own id, for the reason
 * `routes/params.ts` already records on the Microtask side: a parameter that exists only on a
 * parent's mount path is **not emitted** into the document, so a child declaring only `itemId`
 * tells a client that `planId` does not exist. Redeclaring is also what validates it — an
 * unvalidated `planId` is an authorization target built from an unchecked string, and the target is
 * what the whole policy decides on.
 */
export const planParams = z.object({ planId: EntityId })

/** A route under `/plans/{planId}/epics/{epicId}`. */
export const epicParams = planParams.extend({ epicId: EntityId })

/** A route under `/plans/{planId}/features/{featureId}`. */
export const featureParams = planParams.extend({ featureId: EntityId })

/** A route under `/plans/{planId}/items/{itemId}`. */
export const itemParams = planParams.extend({ itemId: EntityId })

/**
 * A route under `/plans/{planId}/share-links/{token}`.
 *
 * The one address in this subtree that is not a ULID: a seat is named by the token it hands out, so
 * acting on one needs no second identifier. That token is a path segment because it names the
 * **seat being acted on**, never the caller — whose own credential stays in the `Authorization`
 * header, which is what keeps it out of server logs and `Referer` (ADR 0013).
 *
 * The token is validated as a {@link ShareToken} rather than taken as any string, so a malformed one
 * is a 422 from the validator rather than a lookup that misses and answers 404 — and that 404 would
 * be claiming a well-formed seat is absent when the request never named one.
 */
export const planShareLinkParams = planParams.extend({ token: ShareToken })
