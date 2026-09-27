import type { Decoded, PlanSeatChange } from '@repo/api-client'
import type { PlanShareLink } from '@repo/contracts'

/** One seat on a plan as the API answers it, token and all. */
export type Seat = Decoded<typeof PlanShareLink>

/**
 * The two fields a seat edit may carry, and nothing else that arrived beside them.
 *
 * **A Server Action is a public endpoint**, so `sent` is whatever the browser posted rather than whatever
 * this app's own form built. The API's zod strips unknown keys and remains the gate; this exists so the
 * request this app sends says exactly what its UI asked for, which is what makes a surprising request in a
 * log a bug here rather than a question about the API.
 *
 * ### Why it is in a module with no `'use server'`
 *
 * Next registers **every export** of a `'use server'` module as a Server Action reachable by its own id. A
 * helper taking a payload and answering a payload has no business being one of those — it is not an
 * endpoint, and publishing it would be one more thing a POST can reach for no reason. So it sits here, and
 * `plan-share-links.ts` and `seat-seats.ts` both import it: one guard, two credentials.
 *
 * It was module-private in `plan-share-links.ts` until the seat twins needed it. `apps/microtask`'s
 * `actions/share-link-parts.ts` is the same file one product over, for a payload this one reuses, and it
 * reached that shape first.
 */
export const changeOf = (sent: PlanSeatChange): PlanSeatChange => ({
  ...(sent.name !== undefined && { name: sent.name }),
  ...(sent.role !== undefined && { role: sent.role }),
})
