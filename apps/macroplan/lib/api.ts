import { apiOptions } from '@repo/app-session/api'
import {
  createMacroplanAdminClient,
  createMacroplanLinkClient,
  type ClientOptions,
  type MacroplanSessionClient,
} from '@repo/api-client'
import { linkPrincipal, type Principal } from './principal'
import { session } from './session'

export { apiOptions, loginWith } from '@repo/app-session/api'

/**
 * Builds the client a principal is entitled to, and no other.
 *
 * The two constructors are non-interchangeable branded types, so this is the only place in the
 * app where a principal turns into authority — and it turns into exactly the authority the
 * principal names. A component cannot reach `createMacroplanAdminClient` with a share token in
 * hand, which is the confused deputy ADR 0012 exists to close: a Server Action is reachable
 * independently of the page that rendered it, so a plan seat could otherwise have driven a call
 * the API read as "admin".
 *
 * There is no shared constructor for the link half. `@repo/app-session` has the admin one only,
 * because a module both apps import that could mint a link client would be a share token's way
 * into whichever of them had not decided to hold one (ADR 0014). This app has decided: ADR 0053
 * puts Macroplan's sharing on the existing share-link system at plan scope, and phase 1 shipped
 * the seat routes it describes. What survives of the older note is the half that was never about
 * timing — authority is minted here from a principal and from nothing else.
 *
 * `options` is a parameter rather than read from {@link apiOptions} inside, so a test can inject
 * a fetcher and assert what actually goes on the wire.
 */
export function clientFor(principal: Principal, options: ClientOptions): MacroplanSessionClient {
  return principal.kind === 'admin'
    ? createMacroplanAdminClient(options, principal.token)
    : createMacroplanLinkClient(options, principal.token)
}

/**
 * The admin client `mp_admin` names, for every route outside `/s/*` (ADR 0012).
 *
 * A `/s/*` route has no session to ask for, because its credential is in its URL (ADR 0040) — it
 * calls {@link apiForLink} instead, and that is the whole of the split.
 *
 * `null` means this browser presents no admin session — a cookie that was absent, or one that
 * would not open — and `lib/problem.ts` turns that into `/login?next=`.
 */
export async function apiForSession(): Promise<MacroplanSessionClient | null> {
  const principal = (await session()).admin()
  return principal === null ? null : clientFor(principal, apiOptions())
}

/**
 * The link client a `/s/<token>` URL names, for every `/s/*` page, action and route (ADR 0040).
 *
 * The token is the whole credential, taken from the route's own `params` or handed to a Server
 * Action as its first argument, and **no cookie is read**: not `mp_admin`, which would let an
 * admin session on the same browser elevate a seat's page, and no link cookie, because there is
 * none. An action called with a token has exactly that token's power, which is no more than
 * holding the URL already gives — the API gates every call on the seat's own role and the plan it
 * is rooted in (ADR 0053).
 *
 * Synchronous, which is the visible shape of that: there is no cookie jar to await, so nothing
 * here is asynchronous but the call the caller then makes.
 *
 * `null` for a segment that cannot be a share token, before any request is built; what to do
 * about it is the caller's, and it is always the terminal page (`lib/problem.ts`).
 */
export function apiForLink(token: string): MacroplanSessionClient | null {
  const principal = linkPrincipal(token)
  return principal === null ? null : clientFor(principal, apiOptions())
}
