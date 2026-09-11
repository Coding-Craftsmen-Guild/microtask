/** The name of the cookie every route outside `/s/*` reads, and nothing else reads (ADR 0032). */
export const ADMIN_COOKIE = 'mt_admin'

/** The name of the cookie every `/s/*` route reads, and nothing else reads (ADR 0032). */
export const LINK_COOKIE = 'mt_link'

const DAY_SECONDS = 24 * 60 * 60

/**
 * How long `mt_link` lives: thirty days.
 *
 * A share token has no expiry of its own and lives until the link is revoked, so there is no
 * shorter lifetime to match. `mt_admin` gets no constant here at all — its `Max-Age` is the
 * bearer's own `expiresInSeconds`, so the cookie cannot outlive the token it wraps. The app
 * being replaced paired a 30-day cookie with a one-hour bearer; that mismatch is the defect
 * being fixed, not a precedent (ADR 0032).
 */
export const LINK_MAX_AGE_SECONDS = 30 * DAY_SECONDS

/** The credential a password login minted, held by every route outside `/s/*`. */
export interface AdminPrincipal {
  /** Names which cookie this came out of, and which client kind it builds. */
  readonly kind: 'admin'

  /** The short-lived bearer the API minted (ADR 0012). */
  readonly token: string
}

/** The credential a client of the business was given, held by `/s/*` alone. */
export interface LinkPrincipal {
  /** Names which cookie this came out of, and which client kind it builds. */
  readonly kind: 'link'

  /** The share token itself, which is the whole credential. */
  readonly token: string
}

/** Whoever a sealed cookie names. */
export type Principal = AdminPrincipal | LinkPrincipal

/** Which of the two a caller is asking for, which is fixed by the route it is serving. */
export type PrincipalKind = Principal['kind']

/** Serialises a principal into the plaintext {@link seal} encrypts. */
export function payloadOf(principal: Principal): string {
  return JSON.stringify({ kind: principal.kind, token: principal.token })
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads an opened cookie payload back into a principal of the kind the caller asked for.
 *
 * `kind` is checked against the caller's expectation rather than merely reported, which is what
 * keeps the two cookies disjoint in substance and not only in name: a value moved from
 * `mt_admin` into `mt_link` opens fine — one secret seals both — and must still not be read as
 * a principal by a `/s/*` route. Whoever could move it already holds the browser, but the rule
 * costs one comparison and the alternative is a session kind decided by whoever set the cookie.
 *
 * Every malformed payload is `null`, for the reason {@link open} returns `null`: to a caller
 * there is no difference between a cookie that will not parse and no cookie at all, and ADR 0032
 * requires the second reading.
 */
export function principalFrom(raw: string, kind: PrincipalKind): Principal | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const token = parsed['token']
  if (parsed['kind'] !== kind || typeof token !== 'string' || token === '') return null
  return kind === 'admin' ? { kind: 'admin', token } : { kind: 'link', token }
}
