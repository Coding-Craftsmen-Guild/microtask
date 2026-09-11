const addressedHost = (headers: Headers): string | null => {
  const forwarded = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (forwarded !== undefined && forwarded !== '') return forwarded.toLowerCase()
  return headers.get('host')?.toLowerCase() ?? null
}

const originHost = (origin: string | null): string | null => {
  if (origin === null || origin === 'null') return null
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

/**
 * Whether a request's `Origin` names the host the browser addressed.
 *
 * A Server Action gets this check from Next and a Route Handler gets nothing, so the one route
 * that writes a document with the admin cookie makes it itself. `SameSite=Lax` already withholds
 * `mt_admin` from a cross-site `PUT`; this is the standard second layer, and it is one
 * comparison.
 *
 * The host is read the way Next reads it for an action — the **first** `X-Forwarded-Host` entry
 * when a proxy supplied one, `Host` otherwise — because the app runs behind Coolify and the hop it
 * sees itself is an internal one. A cross-site page cannot forge that header: setting it makes a
 * `fetch` preflighted, and nothing here answers a preflight.
 *
 * Stricter than Next in one respect, on purpose: a **missing** `Origin` is refused, where Next
 * lets an action through with a warning. Every browser sends `Origin` on a `PUT`, the keepalive
 * flush on unload included, so the only requests without one are hand-built ones — and an
 * opaque `null` origin is refused for the same reason.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = originHost(headers.get('origin'))
  const host = addressedHost(headers)
  return origin !== null && host !== null && origin === host
}
