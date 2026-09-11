import { open, seal } from './crypto'
import {
  ADMIN_COOKIE,
  LINK_COOKIE,
  LINK_MAX_AGE_SECONDS,
  payloadOf,
  principalFrom,
  type AdminPrincipal,
  type LinkPrincipal,
  type Principal,
  type PrincipalKind,
} from './principal'

/**
 * One `Set-Cookie` this app writes, with every attribute spelled out.
 *
 * A full object rather than name-and-value plus defaults, because a cleared cookie must carry
 * the **same** attributes as the one it replaces or the browser keeps both: `Path` and `Secure`
 * are part of a cookie's identity for removal, not decoration on it.
 */
export interface SealedCookie {
  /** Which of the two cookies this is. */
  readonly name: string

  /** The sealed blob, or the empty string when this cookie is being cleared. */
  readonly value: string

  /** Always `true`: no script may read a credential. */
  readonly httpOnly: boolean

  /** `true` behind TLS, derived from the proxy's `x-forwarded-proto`. */
  readonly secure: boolean

  /** `lax`, so a client following a share link from an email arrives holding their cookie. */
  readonly sameSite: 'lax'

  /** Always `/`, which is what makes the payload's confidentiality load-bearing (ADR 0032). */
  readonly path: '/'

  /** Seconds the cookie lives, or `0` to remove it. */
  readonly maxAge: number
}

/** The subset of Next's cookie store this app uses, narrowed so a test needs no request scope. */
export interface CookieJar {
  /** Reads one cookie by name, or `undefined` when the request carried none. */
  get(name: string): { readonly value: string } | undefined

  /** Writes one cookie, replacing any of the same name. */
  set(cookie: SealedCookie): void
}

/** What the two-cookie reader needs: a jar, the sealing key, and whether the hop is TLS. */
export interface SessionCookieOptions {
  /** The cookie store for this request. */
  readonly jar: CookieJar

  /** `COOKIE_SECRET`, the key both cookies are sealed under. */
  readonly secret: string

  /** Whether to mark the cookies `Secure`. */
  readonly secure: boolean
}

/**
 * The two cookies, as six operations that never touch each other's cookie.
 *
 * Disjointness is the whole point and it is structural rather than conventional: each reader
 * names exactly one cookie, so an admin who opens a client's link to check it holds both at once
 * and neither shadows the other. One cookie holding either principal — which the spec had —
 * would have ended the admin's own session on the one operation an admin performs most often
 * (ADR 0032).
 */
export interface SessionCookies {
  /** The admin principal every route outside `/s/*` reads, or `null`. */
  admin(): AdminPrincipal | null

  /** The link principal every `/s/*` route reads, or `null`. */
  link(): LinkPrincipal | null

  /** Seals `mt_admin` for exactly as long as the bearer it wraps is valid. */
  sealAdmin(token: string, expiresInSeconds: number): void

  /** Seals `mt_link` for thirty days, because a share token has no expiry. */
  sealLink(token: string): void

  /** Removes `mt_admin`, leaving `mt_link` alone. */
  clearAdmin(): void

  /** Removes `mt_link`, leaving `mt_admin` alone. */
  clearLink(): void
}

const HTTPS = 'https'

/**
 * Whether a request reached the app over TLS, read from the proxy that terminated it.
 *
 * `x-forwarded-proto` and not the request URL, because the app is deployed behind Coolify: the
 * hop the app itself sees is plain HTTP inside the network, so a cookie marked `Secure` from the
 * app's own view of the scheme would be marked wrongly on every request. The **first** entry of
 * the list is the client-facing hop; a chained proxy appends rather than replaces.
 *
 * Absent means `false`, which is local `next dev` over HTTP. That is the only environment where
 * a session cookie travels unmarked, and marking it `Secure` there would mean no session at all.
 */
export function secureFrom(forwardedProto: string | null): boolean {
  return forwardedProto?.split(',')[0]?.trim().toLowerCase() === HTTPS
}

/**
 * The `Set-Cookie` that removes one of the two cookies.
 *
 * Every attribute matches the sealed cookie it replaces. `Path` is part of a cookie's identity,
 * and a browser will not let a non-`Secure` write displace a `Secure` cookie, so a clear spelled
 * with different attributes would leave the credential in place and report success.
 */
export function clearedCookie(name: string, secure: boolean): SealedCookie {
  return { name, value: '', httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }
}

/**
 * Binds the two cookies to one request's jar.
 *
 * Every read goes through {@link open} and then {@link principalFrom}, and every failure at
 * either step is `null`: a tampered blob, a blob sealed under a rotated secret and a payload of
 * the other kind all mean "this browser presents no session", which ADR 0032 requires be treated
 * as absent rather than as an error anybody is shown.
 */
export function sessionCookies(options: SessionCookieOptions): SessionCookies {
  const read = (name: string, kind: PrincipalKind): ReturnType<typeof principalFrom> => {
    const raw = options.jar.get(name)
    if (raw === undefined) return null
    const plaintext = open(options.secret, raw.value)
    return plaintext === null ? null : principalFrom(plaintext, kind)
  }
  const write = (name: string, value: string, maxAge: number): void => {
    options.jar.set({
      name,
      value,
      httpOnly: true,
      secure: options.secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
    })
  }
  const sealed = (principal: Principal): string => seal(options.secret, payloadOf(principal))
  return {
    admin: () => {
      const found = read(ADMIN_COOKIE, 'admin')
      return found?.kind === 'admin' ? found : null
    },
    link: () => {
      const found = read(LINK_COOKIE, 'link')
      return found?.kind === 'link' ? found : null
    },
    sealAdmin: (token, expiresInSeconds) =>
      write(ADMIN_COOKIE, sealed({ kind: 'admin', token }), expiresInSeconds),
    sealLink: (token) => write(LINK_COOKIE, sealed({ kind: 'link', token }), LINK_MAX_AGE_SECONDS),
    clearAdmin: () => options.jar.set(clearedCookie(ADMIN_COOKIE, options.secure)),
    clearLink: () => options.jar.set(clearedCookie(LINK_COOKIE, options.secure)),
  }
}
