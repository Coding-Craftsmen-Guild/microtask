import type { MacroplanSessionClient } from '@repo/api-client'
import { apiForLink } from '../lib/api'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import { callWith, missingIsNotFound, type ActionResult } from './result'

/**
 * Runs one API call with the authority of the share token handed in, and no other.
 *
 * The link surface's twin of `adminCall`, sharing its body ({@link callWith}), and the token is
 * its whole credential: taken from a page's `params`, or from a Server Action's first argument.
 * **A Server Action is a public endpoint**, so that argument is whatever the browser sent — which
 * is safe here because the token *is* the proof: an action called with a token has exactly that
 * token's power, which the API decides from the seat's own role and the plan it is rooted in on
 * every call, and which is no more than holding the URL already gives (ADR 0040, ADR 0053). No
 * cookie is read, so an admin signed in on the same browser lends a link page nothing.
 *
 * A segment that cannot be a token, and a 401 for one that no longer names a seat, both redirect
 * to the terminal page — never to `/login`, because a seat holder has no password (ADR 0032).
 * Every other refusal comes back as its sentence.
 *
 * The `pathname` `callWith` takes is {@link LINK_UNAVAILABLE_PATH} rather than the page's own,
 * because the only use an admin makes of it is `?next=` and a plan seat has nothing to be sent
 * back to: its credential was in the URL it has just been redirected away from.
 */
export async function linkCall<Value>(
  token: string,
  call: (api: MacroplanSessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return callWith(apiForLink(token), 'link', LINK_UNAVAILABLE_PATH, call)
}

/**
 * {@link linkCall} for a page's own read: a plan the API does not hold — or an id that is not an
 * id, which it answers 422 — renders the route's not-found page, as the admin pages do.
 */
export async function linkRead<Value>(
  token: string,
  call: (api: MacroplanSessionClient) => Promise<Value>,
): Promise<ActionResult<Value>> {
  return missingIsNotFound(await linkCall(token, call))
}
