import { adminRemedyFor, adminRemedyForNoSession, type AdminCopy, type AdminRemedy } from '@repo/app-session/admin-remedy'
import { ACTION_REFUSALS } from './refusal'

/** What the UI says when the API could not be reached or answered something unusable. */
export const SERVICE_UNAVAILABLE = 'Macroplan could not reach its API. Try again in a moment.'

export type { AdminRemedy as Remedy } from '@repo/app-session/admin-remedy'

const COPY: AdminCopy = { unavailable: SERVICE_UNAVAILABLE, refusals: ACTION_REFUSALS }

/**
 * What a caller should do about a failed call: sign in again, or show the sentence.
 *
 * Two outcomes and not Microtask's three, because this app has one audience. A 401 always means
 * the admin's own session ended, so it always redirects to `/login?next=<pathname>` carrying the
 * deep link; there is no client holding a revoked share link who must never be shown a password
 * form (ADR 0032, ADR 0040). The decision itself is `@repo/app-session`'s, so the two apps cannot
 * drift in how an admin 401 is handled; what this file supplies is the wording.
 */
export function remedyFor(error: unknown, pathname: string): AdminRemedy {
  return adminRemedyFor(error, pathname, COPY)
}

/**
 * The remedy for a request that presented no credential at all: `mp_admin` was absent, or would
 * not open.
 *
 * Spelled separately from {@link remedyFor} because there is no error to inspect — no request was
 * made, and the answer is the same as a 401's by construction rather than by a synthetic
 * `ApiError` built to be read back.
 */
export function remedyForNoSession(pathname: string): AdminRemedy {
  return adminRemedyForNoSession(pathname)
}
