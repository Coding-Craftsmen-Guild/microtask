/** Where an admin signs in, and where every admin 401 and every sign-out lands. */
export const LOGIN_PATH = '/login'

/**
 * Where a `/s/*` route sends a holder whose link no longer resolves.
 *
 * A path rather than a rendered component, because the page that learns the link is gone cannot
 * clear the cookie itself: Next allows a cookie write only while the request store's phase is
 * `'action'`, so a Server Component render is refused outright (`ReadonlyRequestCookiesError`,
 * read in `next/dist/server/web/spec-extension/adapters/request-cookies.js`). `proxy.ts` is the
 * only thing that both sees a plain navigation and may write a cookie on it, so the clear happens
 * on arrival here and the terminal page itself is an ordinary static route.
 *
 * It sits *inside* `/s/` on purpose. A static segment beats a dynamic one in the App Router, so
 * the route this names takes precedence over `/s/[token]`; putting it outside would need a second
 * `noindex` subtree, and ADR 0037 makes `noindex` a property of the `/s/*` tree.
 */
export const LINK_UNAVAILABLE_PATH = '/s/unavailable'

const LINK_ROOTS = ['/s', '/share'] as const

/**
 * Whether a path belongs to the client surface, which reads `mt_link` and nothing else.
 *
 * `/share/*` is included because it is the legacy spelling of the same surface, 308'd to `/s/*`
 * (ADR 0037): a client following an old link must never be bounced to `/login` on the way.
 * Matching is by whole segment, so `/sales` and `/shared-notes` are *not* client routes.
 */
export function isLinkSurface(pathname: string): boolean {
  return LINK_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}
