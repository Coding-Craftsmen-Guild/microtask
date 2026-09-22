import { ApiError } from '@repo/api-client'
import { loginPathFor } from './next-path'
import { plainRefusal, type RefusalCopy } from './refusal'

/** What an admin surface should do about a failed call. */
export type AdminRemedy =
  | {
      /** An admin has no live session: send them to sign in, keeping where they were going. */
      readonly kind: 'login'

      /** `/login?next=<sanitised pathname>`. */
      readonly location: string
    }
  | {
      /** Anything else: show it. */
      readonly kind: 'problem'

      /** The HTTP status, or `0` when the API could not be reached at all. */
      readonly status: number

      /** The sentence to put in front of the user: the surface's plain copy, never the API's. */
      readonly detail: string
    }

/** The sentences one admin surface shows, which name its product and so belong to its app. */
export interface AdminCopy {
  /** What to say when the API could not be reached or answered something unusable. */
  readonly unavailable: string

  /** What to say for each status the API can refuse with. */
  readonly refusals: RefusalCopy
}

const UNAUTHORIZED = 401

/**
 * Turns a failed admin call into the one thing the app should do about it.
 *
 * A 401 goes to `/login?next=<pathname>` — carrying the deep link, which the app being replaced
 * dropped on every expiry. The three per-cause 401 codes the API distinguishes —
 * `unknown_service`, `no_principal`, `unknown_principal` — all land in that branch: the
 * distinction matters to an operator reading a log, not to a browser, which has no usable
 * session either way.
 *
 * Every other refusal is a `'problem'` carrying the surface's plain sentence for its status,
 * never the API's `detail`: `Not permitted: tab:write` is a fact about the API's policy, not
 * something to put in front of whoever pressed the button.
 *
 * Anything that is not an `ApiError` — a DNS failure, a dead socket, a body the contract schema
 * refused — is a `'problem'` with status `0` and the fixed sentence. It is deliberately not a
 * `'login'`: signing in again cannot fix an unreachable API, and redirecting there would turn an
 * outage into a login loop.
 */
export function adminRemedyFor(error: unknown, pathname: string, copy: AdminCopy): AdminRemedy {
  if (!(error instanceof ApiError)) return { kind: 'problem', status: 0, detail: copy.unavailable }
  if (error.status === UNAUTHORIZED) return { kind: 'login', location: loginPathFor(pathname) }
  return { kind: 'problem', status: error.status, detail: plainRefusal(error.status, copy.refusals) }
}

/**
 * The remedy for an admin request that presented no credential at all: the admin cookie was
 * absent, or would not open.
 *
 * Spelled separately from {@link adminRemedyFor} because there is no error to inspect — no
 * request was made, and the answer is the same as a 401's by construction rather than by a
 * synthetic `ApiError` built to be read back.
 */
export function adminRemedyForNoSession(pathname: string): AdminRemedy {
  return { kind: 'login', location: loginPathFor(pathname) }
}
