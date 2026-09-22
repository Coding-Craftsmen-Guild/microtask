import { missingIsNotFound, rejected, type ActionFailure, type ActionResult } from '@repo/app-session/action-result'
import { redirect } from 'next/navigation'
import { apiForSession, type SessionClient } from '../lib/api'
import type { PrincipalKind } from '../lib/principal'
import { remedyFor, remedyForNoSession, type Remedy } from '../lib/problem'

export { flattened, missingIsNotFound, rejected } from '@repo/app-session/action-result'
export type { ActionFailure, ActionResult } from '@repo/app-session/action-result'

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

/** {@link adminCall} for a page's own read; see {@link missingIsNotFound}. */
export async function adminRead<Value>(
  pathname: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return missingIsNotFound(await adminCall(pathname, call))
}
