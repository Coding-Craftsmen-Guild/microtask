import { z } from '@hono/zod-openapi'
import { EntityId } from '@repo/contracts'

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
