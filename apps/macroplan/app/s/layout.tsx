import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * Every `/s/*` page is `noindex, nofollow` and asks for no referrer — the subtree's own properties
 * rather than one page's (ADR 0040).
 *
 * Every URL under here carries a live credential, so a crawler handed one must not index it and a
 * page that links out must not send it on. `next.config.ts` sends both as response headers as well,
 * with `Cache-Control: private, no-store`, and those reach what this layout never renders: a
 * redirect, and a 404 outside this tree's own boundary. Neither is redundant — the meta covers the
 * document a crawler parses, the header covers everything else on the surface.
 */
export const metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
} satisfies Metadata

/** Props for {@link LinkSurfaceLayout}. */
export interface LinkSurfaceLayoutProps {
  /** The `/s/*` page. */
  readonly children: ReactNode
}

/**
 * The root of the seat surface, which exists to carry {@link metadata} to every page under it.
 *
 * It renders nothing of its own, and that is why there are two layouts rather than one: the frame's
 * brand lockup links to the seat's own page, so it needs the token, and the token is a segment
 * below. `/s/unavailable` is under this layout too and must reach no token at all — it is a static
 * page that calls nothing (ADR 0032 amendment (c)) — so the frame lives in `[token]/layout.tsx` and
 * the terminal page draws its own.
 *
 * There is deliberately **no `loading.tsx`** anywhere under `/s/`, and that is a measured
 * requirement rather than an omission: a `loading.tsx` wraps the page in a Suspense boundary, the
 * response then starts streaming before the page has decided, and Next answers `redirect()` with a
 * 200 carrying a meta refresh instead of a 307 — measured in ADR 0040. A dead link has to be a real
 * status, so this subtree stays free of one; `layout.test.tsx` sweeps for it.
 */
export default function LinkSurfaceLayout({ children }: LinkSurfaceLayoutProps) {
  return children
}
