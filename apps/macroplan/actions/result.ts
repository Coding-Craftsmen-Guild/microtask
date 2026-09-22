import { missingIsNotFound, rejected, type ActionFailure, type ActionResult } from '@repo/app-session/action-result'
import type { AdminClient } from '@repo/api-client'
import { redirect } from 'next/navigation'
import { apiForSession } from '../lib/api'
import { remedyFor, remedyForNoSession, type Remedy } from '../lib/problem'

export { flattened, missingIsNotFound, rejected } from '@repo/app-session/action-result'
export type { ActionFailure, ActionResult } from '@repo/app-session/action-result'

const settle = (remedy: Remedy): ActionFailure => {
  if (remedy.kind === 'problem') return rejected(remedy.status, remedy.detail)
  redirect(remedy.location)
}

/**
 * Runs one API call with the admin authority this request's cookie names, and no other.
 *
 * **A Server Action is a public endpoint**, reachable by a POST that no page of this app
 * rendered, so the authority is re-derived from `mp_admin` on every call and never from an
 * argument: an id the browser sent is a *target* for the API to judge, never proof that the
 * caller may touch it. The API is the gate (ADR 0009) and this never papers over its answer — a
 * 403 comes back as a failure the user sees, not as an empty success.
 *
 * No session and a 401 both redirect to `/login?next=<pathname>`, so an expired admin lands back
 * on the page they were using (ADR 0032). `pathname` is the page the action serves, built by the
 * caller from route facts rather than read from a header, and it only ever reaches `?next=`
 * through `safeNextPath`. `redirect` is called outside the `try`, because it works by throwing
 * and a `catch` around it would swallow it.
 *
 * This is the shape every write in this app will take once it has entities: a Server Action calls
 * {@link adminCall}, and renders what comes back (ADR 0015).
 */
export async function adminCall<Value>(
  pathname: string,
  call: (api: AdminClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  const api = await apiForSession()
  if (api === null) return settle(remedyForNoSession(pathname))
  let failure: unknown
  try {
    return { ok: true, value: await call(api) }
  } catch (error) {
    failure = error
  }
  return settle(remedyFor(failure, pathname))
}

/** {@link adminCall} for a page's own read; see {@link missingIsNotFound}. */
export async function adminRead<Value>(
  pathname: string,
  call: (api: AdminClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return missingIsNotFound(await adminCall(pathname, call))
}
