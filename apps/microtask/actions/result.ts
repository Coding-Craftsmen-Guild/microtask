import { notFound, redirect } from 'next/navigation'
import { apiForSession, type SessionClient } from '../lib/api'
import type { PrincipalKind } from '../lib/principal'
import { remedyFor, remedyForNoSession, type Remedy } from '../lib/problem'

/** A write the API refused, or one this app refused before sending, with the words to show. */
export interface ActionFailure {
  /** Always `false`, which is what a caller switches on. */
  readonly ok: false

  /** The HTTP status the API answered, or `0` when it could not be reached. */
  readonly status: number

  /** The sentence to put in front of the user. */
  readonly detail: string
}

/**
 * What every Server Action in this directory answers: the value the API returned, or why not.
 *
 * A value rather than a thrown error, because an action's rejection reaches the browser as an
 * opaque digest in production — the one thing the user needed, the API's sentence, would be
 * the one thing lost. A 409 in particular is a real conflict the user must see (ADR 0016), and
 * a result they can render is how it reaches them rather than a retry nobody asked for.
 */
export type ActionResult<Value> = { readonly ok: true; readonly value: Value } | ActionFailure

/** A failure this app decided without asking the API, spelled the way the API's are. */
export const rejected = (status: number, detail: string): ActionFailure => ({
  ok: false,
  status,
  detail,
})

const settle = (remedy: Remedy): ActionFailure => {
  if (remedy.kind === 'problem') return rejected(remedy.status, remedy.detail)
  redirect(remedy.location)
}

/**
 * Runs one API call on the client handed in, and turns whatever went wrong into the one thing the
 * audience's surface should do about it (`lib/problem.ts`).
 *
 * The one body both surfaces' calls share, so an admin action and a link action cannot drift in
 * how they answer: `null` — no credential of the audience at all — and a 401 each redirect, to
 * `/login?next=` for the admin and to `/s/unavailable` for a link, and every other refusal comes
 * back as its sentence. `redirect` is called outside the `try`, because it works by throwing and a
 * `catch` around it would swallow it.
 *
 * Which client it is, is decided by the caller from its own route, never from an argument the
 * browser sent as proof: {@link adminCall} from `mt_admin`, `linkCall` from the share token that is
 * itself the credential (ADR 0040).
 */
export async function callWith<Value>(
  api: SessionClient | null,
  audience: PrincipalKind,
  pathname: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  if (api === null) return settle(remedyForNoSession(audience, pathname))
  let failure: unknown
  try {
    return { ok: true, value: await call(api) }
  } catch (error) {
    failure = error
  }
  return settle(remedyFor(failure, audience, pathname))
}

/**
 * Runs one API call with the admin authority this request's cookie names, and no other.
 *
 * **A Server Action is a public endpoint**, reachable by a POST that no page of this app
 * rendered, so the authority is re-derived from `mt_admin` on every call and never from an
 * argument: an id the browser sent is a *target* for the API to judge, never proof that the
 * caller may touch it. The API is the gate (ADR 0009) and this never papers over its answer — a
 * 403 comes back as a failure the user sees, not as an empty success.
 *
 * No session and a 401 both redirect to `/login?next=<pathname>`, so an expired admin lands back
 * on the page they were using (ADR 0032). `pathname` is the page the action serves, built by the
 * caller from route facts rather than read from a header, and it only ever reaches `?next=`
 * through `safeNextPath`.
 */
export async function adminCall<Value>(
  pathname: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return callWith(await apiForSession('admin'), 'admin', pathname, call)
}

const MISSING = new Set([404, 422])

/**
 * A page's own read, answered: a thing the API does not hold — or an id that is not an id, which
 * it answers 422 — renders the route's not-found page rather than a sentence.
 *
 * Every other refusal comes back as its sentence for the page to show in place of what it could
 * not read, rather than thrown into an error boundary that production strips of its message.
 */
export function missingIsNotFound<Value>(result: ActionResult<Value>): ActionResult<Value> {
  if (!result.ok && MISSING.has(result.status)) notFound()
  return result
}

/** {@link adminCall} for a page's own read; see {@link missingIsNotFound}. */
export async function adminRead<Value>(
  pathname: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return missingIsNotFound(await adminCall(pathname, call))
}

/**
 * Unwraps a call whose own body may refuse, so a refusal decided here and one the API decided
 * reach the caller in the same shape.
 */
export const flattened = <Value>(result: ActionResult<ActionResult<Value>>): ActionResult<Value> =>
  result.ok ? result.value : result
