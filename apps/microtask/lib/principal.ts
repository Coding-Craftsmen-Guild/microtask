import { ShareToken } from '@repo/contracts'

/**
 * The name of the one cookie this app seals, read by every route outside `/s/*` and by nothing
 * inside it (ADR 0032, ADR 0040).
 *
 * There is no link cookie. The client surface takes its credential from the URL on every request,
 * so a browser holds no share token the address bar does not already show it (ADR 0040).
 */
export const ADMIN_COOKIE = 'mt_admin'

/** The credential a password login minted, held in `mt_admin` by every route outside `/s/*`. */
export interface AdminPrincipal {
  /** Names which cookie this came out of, and which client kind it builds. */
  readonly kind: 'admin'

  /** The short-lived bearer the API minted (ADR 0012). */
  readonly token: string
}

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

/** Serialises a principal into the plaintext {@link seal} encrypts. */
export function payloadOf(principal: Principal): string {
  return JSON.stringify({ kind: principal.kind, token: principal.token })
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const adminTokenOf = (raw: string): string | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const token = parsed['token']
  if (parsed['kind'] !== 'admin' || typeof token !== 'string' || token === '') return null
  return token
}

/**
 * Reads an opened `mt_admin` payload back into an admin principal, or `null`.
 *
 * `kind` is checked rather than merely reported: a sealed payload naming any other kind opens
 * fine — one secret seals every blob this app has ever written — and must still not be read as an
 * admin. Whoever could plant it already holds the browser, but the rule costs one comparison and
 * the alternative is a session kind decided by whoever set the cookie.
 *
 * Every malformed payload is `null`, for the reason {@link open} returns `null`: to a caller
 * there is no difference between a cookie that will not parse and no cookie at all, and ADR 0032
 * requires the second reading.
 */
export function adminFrom(raw: string): AdminPrincipal | null {
  const token = adminTokenOf(raw)
  return token === null ? null : { kind: 'admin', token }
}

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
 * live seat, and it answers a dead one 401.
 */
export function linkPrincipal(token: string): LinkPrincipal | null {
  return ShareToken.safeParse(token).success ? { kind: 'link', token } : null
}
