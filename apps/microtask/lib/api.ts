import { apiOptions } from '@repo/app-session/api'
import { createAdminClient, createLinkClient, type AdminClient, type ClientOptions, type LinkClient } from '@repo/api-client'
import { linkPrincipal, type Principal } from './principal'
import { session } from './session'

export { apiOptions, loginWith } from '@repo/app-session/api'

/** Either credential's client. Which operations succeed is the API's decision, not this type's. */
export type SessionClient = AdminClient | LinkClient

/**
 * Builds the client a principal is entitled to, and no other.
 *
 * This is the only place in the app where a principal turns into authority, and it turns into
 * exactly the authority the principal names: the branch is on the principal's own discriminant, so
 * a caller holding a `Principal` cannot take the arm that does not match it. That is what closes
 * the confused deputy ADR 0012 exists to close — a Server Action is reachable independently of the
 * page that rendered it, so a read-only visitor could otherwise have driven a call the API read as
 * "admin".
 *
 * The brands are on the clients this **returns**, not on the tokens the constructors take, so what
 * the type system enforces is that the two clients are mutually unassignable: a call typed for one
 * cannot be handed the other. It does not stop `createAdminClient(options, shareToken)` from
 * compiling — both constructors take the token as a bare `string` — and nothing bans a component
 * importing one, this app's lint restricting only `@repo/store`, `@repo/kernel` and the domain
 * packages. So the funnel is a convention with a single enforcement point rather than a compile
 * error, and this app renders a live share surface with real tokens in a component's hands: it
 * holds exactly as long as this function stays the sole caller of either constructor.
 *
 * Both branches stay here rather than in `@repo/app-session`, which mints no client at all: a
 * shared module that could mint a link client would be a share token's way into an app that has
 * no share links, and the admin half it used to hold went when its last caller did (ADR 0014).
 *
 * `options` is a parameter rather than read from {@link apiOptions} inside, so a test can inject
 * a fetcher and assert what actually goes on the wire.
 */
export function clientFor(principal: Principal, options: ClientOptions): SessionClient {
  return principal.kind === 'admin'
    ? createAdminClient(options, principal.token)
    : createLinkClient(options, principal.token)
}

/**
 * The admin client `mt_admin` names, for every route outside `/s/*` (ADR 0012).
 *
 * `audience` admits one value. It stays a parameter so every call site still says which surface
 * it serves, and so the link half this function used to have is a compile error rather than a
 * `null`: a `/s/*` route has no session to ask for, because its credential is in its URL
 * (ADR 0040) — it calls {@link apiForLink}.
 *
 * `null` means this browser presents no admin session — a cookie that was absent, or one that
 * would not open — and `lib/problem.ts` turns that into `/login?next=`.
 */
export async function apiForSession(audience: 'admin'): Promise<SessionClient | null> {
  const principal = (await session())[audience]()
  return principal === null ? null : clientFor(principal, apiOptions())
}

/**
 * The link client a `/s/<token>` URL names, for every `/s/*` page, action and route (ADR 0040).
 *
 * The token is the whole credential, taken from the route's own `params` or handed to a Server
 * Action as its first argument, and **no cookie is read**: not `mt_admin`, which would let an
 * admin session on the same browser elevate a client's page, and no link cookie, because there is
 * none. An action called with a token has exactly that token's power, which is no more than
 * holding the URL already gives — the API gates every call on the link's own role and scope.
 *
 * `null` for a segment that cannot be a share token, before any request is built; what to do
 * about it is the caller's, and it is always the terminal page (`lib/problem.ts`).
 */
export function apiForLink(token: string): SessionClient | null {
  const principal = linkPrincipal(token)
  return principal === null ? null : clientFor(principal, apiOptions())
}
