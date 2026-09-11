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
import type { Principal, PrincipalKind } from './principal'
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
 * cookie named. A component cannot reach `createAdminClient` with a share token in hand, which
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
 * The one entry point every server read and write goes through (ADR 0012).
 *
 * `audience` is the route's own fact and never a guess: `/s/*` passes `'link'` and reads
 * `mt_link`, every other route passes `'admin'` and reads `mt_admin`, and neither ever consults
 * the other's cookie. That is what lets an admin open a client's link to check it while holding
 * both sessions at once (ADR 0032).
 *
 * `null` means this browser presents no session of that kind — a cookie that was absent, or one
 * that would not open. What to do about it is the caller's route-shaped decision, because the two
 * answers are not interchangeable: an admin goes to `/login`, and a client must never be shown a
 * password form. `lib/problem.ts` holds both.
 */
export async function apiForSession(audience: PrincipalKind): Promise<SessionClient | null> {
  const cookies = await session()
  const principal = audience === 'admin' ? cookies.admin() : cookies.link()
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
