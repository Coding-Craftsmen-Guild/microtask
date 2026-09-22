import { ApiError } from '@repo/api-client'
import { adminRemedyFor, adminRemedyForNoSession, type AdminRemedy } from '@repo/app-session/admin-remedy'
import { plainRefusal } from '@repo/app-session/refusal'
import { ACTION_REFUSALS } from './refusal'
import type { PrincipalKind } from './principal'
import { LINK_UNAVAILABLE_PATH } from './routes'

/** What the UI says when the API could not be reached or answered something unusable. */
export const SERVICE_UNAVAILABLE = 'Microtask could not reach its API. Try again in a moment.'

/**
 * What a caller should do about a failed call, decided from the status and the audience.
 *
 * Three outcomes and not two, because a 401 means something different to each audience and the
 * spec's blanket "any 401 sends the browser to `/login`" is wrong for one of them. The admin two
 * are `AdminRemedy` from `@repo/app-session`, shared with Macroplan; the third is this app's,
 * because only this app has a surface whose credential is a URL (ADR 0040).
 */
export type Remedy =
  | AdminRemedy
  | {
      /** A link holder's token names nobody: the link is gone and there is nothing to sign in to. */
      readonly kind: 'unavailable'

      /** {@link LINK_UNAVAILABLE_PATH}. */
      readonly location: string
    }

const UNAUTHORIZED = 401

const ADMIN_COPY = { unavailable: SERVICE_UNAVAILABLE, refusals: ACTION_REFUSALS.admin }

const unavailable = (): Remedy => ({ kind: 'unavailable', location: LINK_UNAVAILABLE_PATH })

const linkRemedyFor = (error: unknown): Remedy => {
  if (!(error instanceof ApiError)) return { kind: 'problem', status: 0, detail: SERVICE_UNAVAILABLE }
  if (error.status === UNAUTHORIZED) return unavailable()
  return { kind: 'problem', status: error.status, detail: plainRefusal(error.status, ACTION_REFUSALS.link) }
}

/**
 * Turns a failed call into the one thing the app should do about it.
 *
 * The 401 branch is **per cookie**, which is the whole point. An admin 401 goes to
 * `/login?next=<pathname>` — carrying the deep link, which the app being replaced dropped on
 * every expiry. A link 401 goes to the terminal page and can *never* produce a `'login'` remedy:
 * showing an admin password form to a client whose link was revoked is the worst available
 * answer, and a client has no password and never will (ADR 0032).
 *
 * The three per-cause 401 codes the API distinguishes — `unknown_service`, `no_principal`,
 * `unknown_principal` — all land in the same branch here. The distinction matters to an operator
 * reading a log, not to a browser: whichever credential was missing, this browser has no usable
 * session of its audience's kind.
 *
 * Every other refusal is a `'problem'` carrying the audience's plain sentence for its status
 * (`lib/refusal.ts`), never the API's `detail`: `Not permitted: tab:write` is a fact about the
 * API's policy, and an admin downgrading a write link under an open page should leave the
 * visitor reading that the link does not allow it, as legacy's `This link is read-only` did.
 *
 * Anything that is not an `ApiError` — a DNS failure, a dead socket, a body the contract schema
 * refused — is a `'problem'` with status `0` and a fixed sentence. It is deliberately not a
 * `'login'`: signing in again cannot fix an unreachable API, and redirecting there would turn an
 * outage into a login loop.
 */
export function remedyFor(error: unknown, audience: PrincipalKind, pathname: string): Remedy {
  return audience === 'admin' ? adminRemedyFor(error, pathname, ADMIN_COPY) : linkRemedyFor(error)
}

/**
 * The remedy for a request that presented no credential of its audience at all.
 *
 * For an admin route that is no `mt_admin` that opens: `apiForSession` answered `null`. For a link
 * route it is a `/s/<token>` segment that cannot be a share token: `apiForLink` answered `null`.
 * Spelled separately from {@link remedyFor} because there is no error to inspect — no request was
 * made, and the answer is the same as a 401's by construction rather than by a synthetic
 * `ApiError` built to be read back.
 */
export function remedyForNoSession(audience: PrincipalKind, pathname: string): Remedy {
  return audience === 'admin' ? adminRemedyForNoSession(pathname) : unavailable()
}
