import { open, seal } from './crypto'
import { ADMIN_COOKIE, adminFrom, payloadOf, type AdminPrincipal } from './principal'

/**
 * One `Set-Cookie` this app writes, with every attribute spelled out.
 *
 * A full object rather than name-and-value plus defaults, because a cleared cookie must carry
 * the **same** attributes as the one it replaces or the browser keeps both: `Path` and `Secure`
 * are part of a cookie's identity for removal, not decoration on it.
 */
export interface SealedCookie {
  /** Which cookie this is: `mt_admin`, the only one this app writes (ADR 0040). */
  readonly name: string

  /** The sealed blob, or the empty string when this cookie is being cleared. */
  readonly value: string

  /** Always `true`: no script may read a credential. */
  readonly httpOnly: boolean

  /** `true` behind TLS, derived from the proxy's `x-forwarded-proto`. */
  readonly secure: boolean

  /** `lax`, so an admin following a link to a task from an email arrives signed in. */
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

/** What the session needs: a jar, the sealing key, and whether the hop is TLS. */
export interface SessionCookieOptions {
  /** The cookie store for this request. */
  readonly jar: CookieJar

  /** `COOKIE_SECRET`, the key `mt_admin` is sealed under. */
  readonly secret: string

  /** Whether to mark the cookie `Secure`. */
  readonly secure: boolean
}

/**
 * The admin session: three operations on `mt_admin`, and nothing else.
 *
 * There is no link half. The client surface authenticates from the token in its URL on every
 * request, so it has no session to read, seal or clear — and an admin who opens a client's link
 * to check it keeps their own session, because nothing under `/s/*` touches a cookie at all. That
 * was the reason ADR 0032 gave for a second cookie; ADR 0040 meets it by having none.
 */
export interface SessionCookies {
  /** The admin principal every route outside `/s/*` reads, or `null`. */
  admin(): AdminPrincipal | null

  /** Seals `mt_admin` for exactly as long as the bearer it wraps is valid. */
  sealAdmin(token: string, expiresInSeconds: number): void

  /** Removes `mt_admin`. */
  clearAdmin(): void
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
 * The `Set-Cookie` that removes a cookie this app sealed.
 *
 * Every attribute matches the sealed cookie it replaces. `Path` is part of a cookie's identity,
 * and a browser will not let a non-`Secure` write displace a `Secure` cookie, so a clear spelled
 * with different attributes would leave the credential in place and report success.
 */
export function clearedCookie(name: string, secure: boolean): SealedCookie {
  return { name, value: '', httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 0 }
}

/**
 * Binds the admin session to one request's jar.
 *
 * Every read goes through {@link open} and then {@link adminFrom}, and every failure at either
 * step is `null`: a tampered blob, a blob sealed under a rotated secret and a payload of another
 * kind all mean "this browser presents no session", which ADR 0032 requires be treated as absent
 * rather than as an error anybody is shown.
 */
export function sessionCookies(options: SessionCookieOptions): SessionCookies {
  return {
    admin: () => {
      const raw = options.jar.get(ADMIN_COOKIE)
      const plaintext = raw === undefined ? null : open(options.secret, raw.value)
      return plaintext === null ? null : adminFrom(plaintext)
    },
    sealAdmin: (token, expiresInSeconds) =>
      options.jar.set({
        name: ADMIN_COOKIE,
        value: seal(options.secret, payloadOf({ kind: 'admin', token })),
        httpOnly: true,
        secure: options.secure,
        sameSite: 'lax',
        path: '/',
        maxAge: expiresInSeconds,
      }),
    clearAdmin: () => options.jar.set(clearedCookie(ADMIN_COOKIE, options.secure)),
  }
}
