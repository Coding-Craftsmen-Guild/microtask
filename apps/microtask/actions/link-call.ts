import { notFound, redirect } from 'next/navigation'
import { apiForLink, type SessionClient } from '../lib/api'
import { remedyFor } from '../lib/problem'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import { rejected, type ActionResult } from './result'

/**
 * Runs one API call with the authority of the share token handed in, and no other.
 *
 * The link surface's twin of `adminCall`, and the token is its whole credential: taken from a
 * page's `params`, or from a Server Action's first argument. **A Server Action is a public
 * endpoint**, so that argument is whatever the browser sent — which is safe here because the
 * token *is* the proof: an action called with a token has exactly that token's power, which the
 * API decides from the link's own role and scope on every call and which is no more than holding
 * the URL already gives (ADR 0040). No cookie is read, so an admin signed in on the same browser
 * lends a link page nothing.
 *
 * A segment that cannot be a token, and a 401 for one that no longer names a seat, both redirect
 * to the terminal page — never to `/login`, because a client has no password (ADR 0032).
 * `redirect` is called outside the `try`, because it works by throwing and a `catch` around it
 * would swallow it. Every other refusal comes back as its sentence.
 */
export async function linkCall<Value>(
  token: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  const api = apiForLink(token)
  if (api === null) redirect(LINK_UNAVAILABLE_PATH)
  let failure: unknown
  try {
    return { ok: true, value: await call(api) }
  } catch (error) {
    failure = error
  }
  const remedy = remedyFor(failure, 'link', LINK_UNAVAILABLE_PATH)
  if (remedy.kind === 'problem') return rejected(remedy.status, remedy.detail)
  redirect(remedy.location)
}

const MISSING = new Set([404, 422])

/**
 * {@link linkCall} for a page's own read: a task the API does not hold — or an id that is not an
 * id, which it answers 422 — renders the route's not-found page, as the admin pages do.
 *
 * Every other refusal comes back as its sentence for the page to show in place of what it could
 * not read, rather than thrown into an error boundary that production strips of its message.
 */
export async function linkRead<Value>(
  token: string,
  call: (api: SessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  const result = await linkCall(token, call)
  if (!result.ok && MISSING.has(result.status)) notFound()
  return result
}
