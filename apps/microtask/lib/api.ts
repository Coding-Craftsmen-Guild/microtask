import {
  createAdminClient,
  createLinkClient,
  login,
  type AdminClient,
  type AdminSessionValue,
  type ClientOptions,
  type LinkClient,
} from '@repo/api-client'
import { appEnv } from './env'
import { linkPrincipal, type Principal } from './principal'
import { session } from './session'

/** Either credential's client. Which operations succeed is the API's decision, not this type's. */
export type SessionClient = AdminClient | LinkClient

/**
 * Where the API is and which app is calling, assembled from the one environment reader.
 *
 * `@repo/api-client` reads no environment variable anywhere and takes both as arguments, because
 * the service key names the *server* making the call: a client that read it for itself would be
 * usable from a browser bundle only by inlining the key into that bundle (ADR 0012).
 */
export function apiOptions(): ClientOptions {
  const env = appEnv()
  return { baseUrl: env.apiBaseUrl, serviceKey: env.apiKey }
}

/**
 * Builds the client a principal is entitled to, and no other.
 *
 * The two constructors are non-interchangeable branded types, so this is the only place in the
 * app where a principal turns into authority — and it turns into exactly the authority the
 * principal names. A component cannot reach `createAdminClient` with a share token in hand, which
 * is the confused deputy ADR 0012 exists to close: a Server Action is reachable independently of
 * the page that rendered it, so a read-only visitor could otherwise have driven a call the API
 * read as "admin".
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

/**
 * Exchanges the admin password for the bearer `mt_admin` wraps.
 *
 * It is the one call in this app that presents a service key with no bearer, because the bearer
 * is what it returns. Everything else in the API refuses that combination with a 401.
 */
export function loginWith(password: string): Promise<AdminSessionValue> {
  return login(apiOptions(), password)
}
