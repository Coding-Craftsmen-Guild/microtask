/** Where an admin signs in, and where every admin 401 and every sign-out lands. */
export const LOGIN_PATH = '/login'

/**
 * Where a `/s/*` route sends a holder whose link no longer resolves.
 *
 * A path to redirect to rather than a state rendered in place, so the address bar stops carrying
 * the dead token: a reload of the terminal page renders a page that calls nothing, and never
 * re-attempts the token. Nothing is cleared on the way here because there is nothing to clear:
 * the client surface holds its credential in the URL and in no cookie (ADR 0040).
 *
 * It sits *inside* `/s/` on purpose. A static segment beats a dynamic one in the App Router, so
 * the route this names takes precedence over `/s/[token]`; putting it outside would need a second
 * `noindex` subtree, and ADR 0037 makes `noindex` a property of the `/s/*` tree. It cannot shadow
 * a real link either: `unavailable` is eleven characters, and a share token is sixteen or more.
 */
export const LINK_UNAVAILABLE_PATH = '/s/unavailable'

const LINK_ROOTS = ['/s', '/share'] as const

/**
 * Whether a path belongs to the client surface, which authenticates from its URL and reads no cookie.
 *
 * `/share/*` is included because it is the legacy spelling of the same surface, 308'd to `/s/*`
 * (ADR 0037): a client following an old link must never be bounced to `/login` on the way.
 * Matching is by whole segment, so `/sales` and `/shared-notes` are *not* client routes.
 */
export function isLinkSurface(pathname: string): boolean {
  return LINK_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}
