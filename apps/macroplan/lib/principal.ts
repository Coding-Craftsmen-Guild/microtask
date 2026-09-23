import { ShareToken } from '@repo/contracts'
import type { AdminPrincipal } from '@repo/app-session/principal'

export { adminFrom, payloadOf } from '@repo/app-session/principal'
export type { AdminPrincipal } from '@repo/app-session/principal'

/**
 * The name of the one cookie this app seals, read by every route outside `/s/*` and by nothing
 * inside it (ADR 0032, ADR 0040).
 *
 * `mp_admin` and not `mt_admin`, which is Microtask's. The two apps are one sign-in *password*
 * and two sessions: they may be open in one browser on two hostnames, and a shared cookie name
 * would have each of them clearing the other's session and reading the other's bearer. The
 * sealing itself is one implementation in `@repo/app-session` and the name is this app's
 * (ADR 0014).
 *
 * There is no second cookie. The `/s/*` surface takes its credential from the URL on every
 * request, so a plan seat seals nothing and a browser holds no share token the address bar is not
 * already showing it (ADR 0040).
 */
export const ADMIN_COOKIE = 'mp_admin'

/** The credential a plan seat was given: the `/s/<token>` segment, and nothing else. */
export interface LinkPrincipal {
  /** Names which client kind this builds. */
  readonly kind: 'link'

  /** The share token itself, which is the whole credential. */
  readonly token: string
}

/** Whoever a request presents: an opened `mp_admin`, or a `/s/<token>` segment. */
export type Principal = AdminPrincipal | LinkPrincipal

/** Which of the two a caller is serving, which is fixed by the route it is on. */
export type PrincipalKind = Principal['kind']

/**
 * Reads a `/s/<token>` segment into a link principal, or `null` when it cannot be a share token.
 *
 * The shape is the one the API mints and validates, `ShareToken` from `@repo/contracts`, checked
 * **before** any request is built. A segment that is not a token is a link that does not resolve,
 * and saying so here rather than asking the API is what keeps a value no token can hold — a
 * newline above all, which would split the `Authorization` header — from ever reaching `fetch`,
 * where it would fail as an unreachable API rather than as the dead link it is (ADR 0040).
 *
 * Passing the check proves nothing about the link: only the API knows whether a token names a
 * live seat, and it answers a dead one 401. A seat is scoped to a whole plan and to nothing
 * narrower, so the token is the only thing a holder has to present — what it may then do is read
 * from the seat on every call, never from this value (ADR 0053).
 */
export function linkPrincipal(token: string): LinkPrincipal | null {
  return ShareToken.safeParse(token).success ? { kind: 'link', token } : null
}
