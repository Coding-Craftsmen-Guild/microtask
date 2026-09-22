import { ShareToken } from '@repo/contracts'
import type { AdminPrincipal } from '@repo/app-session/principal'

export { adminFrom, payloadOf } from '@repo/app-session/principal'
export type { AdminPrincipal } from '@repo/app-session/principal'

/**
 * The name of the one cookie this app seals, read by every route outside `/s/*` and by nothing
 * inside it (ADR 0032, ADR 0040).
 *
 * There is no link cookie. The client surface takes its credential from the URL on every request,
 * so a browser holds no share token the address bar does not already show it (ADR 0040).
 *
 * It is spelled here rather than in `@repo/app-session` because Macroplan seals `mp_admin` from
 * the same code: the two apps may be open in one browser, and a shared name would have each of
 * them clearing the other's session (ADR 0014).
 */
export const ADMIN_COOKIE = 'mt_admin'

/** The credential a client of the business was given: the `/s/<token>` segment, and nothing else. */
export interface LinkPrincipal {
  /** Names which client kind this builds. */
  readonly kind: 'link'

  /** The share token itself, which is the whole credential. */
  readonly token: string
}

/** Whoever a request presents: an opened `mt_admin`, or a `/s/<token>` segment. */
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
 * live seat, and it answers a dead one 401. It has no counterpart in `@repo/app-session` because
 * the share-link surface is Microtask's alone: Macroplan will reach Microtask's entities through
 * share tokens one day, and it will hold them the way any client does — in a URL, not a cookie.
 */
export function linkPrincipal(token: string): LinkPrincipal | null {
  return ShareToken.safeParse(token).success ? { kind: 'link', token } : null
}
