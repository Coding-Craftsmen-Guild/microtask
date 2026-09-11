const addressedHost = (headers: Headers): string | null => {
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (forwarded !== undefined && forwarded !== '') return forwarded.toLowerCase()
  return headers.get('host')?.toLowerCase() ?? null
}

const originHost = (origin: string | null): string | null => {
  if (origin === null) return null
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

/**
 * Whether a request's `Origin` names the host the browser addressed.
 *
 * A Server Action gets this check from Next and a Route Handler gets nothing, so the two document
 * routes make it themselves, before any credential is touched. On the admin route it guards an
 * ambient credential: `SameSite=Lax` already withholds `mt_admin` from a cross-site `PUT`, and
 * this is the standard second layer. The link route has no ambient credential — its token is in
 * the path, and whoever holds it can write with it from anywhere — so there the check keeps the
 * two routes' contract one and the same rather than guarding a secret (ADR 0040).
 *
 * The host is read the way Next reads it for an action — the **first** `X-Forwarded-Host` entry
 * when a proxy supplied one, `Host` otherwise — because the app runs behind Coolify and the hop it
 * sees itself is an internal one. A cross-site page cannot forge that header: a cross-origin `PUT`
 * is preflighted whatever it carries, and the `OPTIONS` answer Next generates for this route has
 * no `Access-Control-Allow-Origin`, so the browser never sends the write.
 *
 * Stricter than Next in one respect, on purpose: a **missing** `Origin` is refused, where Next
 * lets an action through with a warning. Every browser sends `Origin` on a `PUT`, the keepalive
 * flush on unload included, so the only requests without one are hand-built ones. An opaque
 * `null` origin — a sandboxed frame, a redirect across origins — is refused too, because it does
 * not parse as a URL and so names no host at all.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = originHost(headers.get('origin'))
  return origin !== null && origin === addressedHost(headers)
}
