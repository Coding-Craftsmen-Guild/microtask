import type { Metadata } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

/**
 * Every `/s/*` page is `noindex, nofollow` and asks for no referrer — the subtree's own properties
 * rather than one page's (ADR 0037).
 *
 * The app being replaced marked `share.html` alone, which was the whole of its client surface.
 * Here the surface is a route subtree whose every URL carries a live credential, so a crawler that
 * was handed one must not index it and a page that links out must not send it on (ADR 0040).
 * `next.config.ts` sends the same two facts as response headers, which also cover what this
 * layout never renders: a route handler, a redirect, a 404 outside the tree's own boundary.
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
 * The root of the client surface, which renders every page under it **at request time**.
 *
 * `connection()` is what guarantees it, rather than an inference from which request APIs a page
 * happens to call. A page Next could prerender would be served with a shared-cache lifetime, and a
 * shared cache that stored `/s/<token>` would hand one client's document to whoever asked next;
 * a request-time render is sent `private, no-cache, no-store` (ADR 0040). The terminal page is
 * included, though it names no token, so that no response under `/s/` is ever a cacheable one.
 */
export default async function LinkSurfaceLayout({ children }: LinkSurfaceLayoutProps) {
  await connection()
  return children
}
