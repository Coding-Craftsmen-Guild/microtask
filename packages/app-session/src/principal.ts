/** The credential a password login minted, held in the app's admin cookie. */
export interface AdminPrincipal {
  /** Names which cookie this came out of, and which client kind it builds. */
  readonly kind: 'admin'

  /** The short-lived bearer the API minted (ADR 0012). */
  readonly token: string
}

/** The minimum a sealed payload holds: which kind of principal it is, and its token. */
export interface SealablePrincipal {
  /** Which kind of credential the payload carries. */
  readonly kind: string

  /** The credential itself. */
  readonly token: string
}

/** Serialises a principal into the plaintext {@link seal} encrypts. */
export function payloadOf(principal: SealablePrincipal): string {
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
 * Reads an opened admin-cookie payload back into an admin principal, or `null`.
 *
 * `kind` is checked rather than merely reported: a sealed payload naming any other kind opens
 * fine — one secret seals every blob an app has ever written — and must still not be read as an
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
