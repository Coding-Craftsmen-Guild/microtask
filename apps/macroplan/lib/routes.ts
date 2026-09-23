/**
 * Where a `/s/*` route sends a holder whose link no longer resolves.
 *
 * A path to redirect to rather than a state rendered in place, so the address bar stops carrying
 * the dead token: the terminal page calls nothing, and a reload of it cannot re-attempt the link.
 * Nothing is cleared on the way here, because there is nothing to clear — the link surface holds
 * its credential in the URL and in no cookie (ADR 0040).
 *
 * It sits *inside* `/s/` on purpose, which is amendment (c) of ADR 0032: a static segment beats a
 * dynamic one in the App Router, so this route takes precedence over `/s/[token]` with no special
 * case, and the hardening over `/s/*` covers it instead of needing a second subtree. It cannot
 * shadow a real link either — `unavailable` is eleven characters and `ShareToken` admits sixteen
 * to sixty-four.
 */
export const LINK_UNAVAILABLE_PATH = '/s/unavailable'

/** The one root a share token authenticates from. This app has no legacy spelling of it. */
export const LINK_ROOT = '/s'

/** The page one plan seat lands on. */
export const linkPath = (token: string): string => `${LINK_ROOT}/${encodeURIComponent(token)}`

/**
 * Whether a path authenticates from its own URL rather than from `mp_admin`.
 *
 * Matching is by whole segment — the root itself, or the root followed by a separator — so
 * `/splash` and `/settings` stay on the admin surface. A bare `startsWith('/s')` would hand them
 * to a surface that reads no cookie.
 */
export const isLinkSurface = (pathname: string): boolean =>
  pathname === LINK_ROOT || pathname.startsWith(`${LINK_ROOT}/`)

/**
 * Where one plan is read on the admin surface.
 *
 * `encodeURIComponent` is unconditional for the reason `packages/api-client/src/paths.ts` gives
 * for its own ids: a plan id is a ULID and normally needs no encoding, which is exactly why the
 * one value that would need it is the one that arrived from somewhere unexpected, and a caller
 * building a path by hand is how a `..` segment reaches a router.
 */
export const planPath = (planId: string): string => `/plans/${encodeURIComponent(planId)}`
