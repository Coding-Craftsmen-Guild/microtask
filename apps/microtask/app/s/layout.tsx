import type { Metadata } from 'next'
import type { ReactNode } from 'react'

/**
 * Every `/s/*` page is `noindex, nofollow` and asks for no referrer — the subtree's own properties
 * rather than one page's (ADR 0037).
 *
 * The app being replaced marked `share.html` alone, which was the whole of its client surface.
 * Here the surface is a route subtree whose every URL carries a live credential, so a crawler that
 * was handed one must not index it and a page that links out must not send it on (ADR 0040).
 * `next.config.ts` sends both as response headers too, with `Cache-Control: private, no-store`,
 * which reach what this layout never renders: a route handler, a redirect, a 404 outside the
 * tree's own boundary.
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
 * The root of the client surface, which exists to carry {@link metadata} to every page under it.
 *
 * It renders nothing of its own: the frame needs the token for its brand link, so it lives one
 * segment down, and the terminal page draws its own.
 */
export default function LinkSurfaceLayout({ children }: LinkSurfaceLayoutProps) {
  return children
}
