import type { ReactNode } from 'react'
import { LinkFrame } from '../../../components/link/link-frame'
import { linkPath } from '../../../lib/routes'

/** Props for {@link LinkLayout}. */
export interface LinkLayoutProps {
  /** The token segment, which is also where the brand lockup links. */
  readonly params: Promise<{ readonly token: string }>

  /** The seat's page. */
  readonly children: ReactNode
}

/**
 * Every `/s/<token>/*` page's frame: the brand bar linking back to this link's own page, with no
 * Sign out, because a plan seat has no session to end (ADR 0040).
 *
 * This is the layout that needs the token, which is the whole reason the surface has two: `/s/*`
 * carries the `noindex`/`no-referrer` metadata for every page including the terminal one, and a
 * frame cannot live there because `/s/unavailable` must reach no token at all.
 *
 * It sets **no metadata of its own**. The title is the page's, from the plan's name, and the
 * subtree's robots and referrer are already set one segment up — restating either here would be a
 * second owner for the surface's one security-relevant head.
 *
 * `linkPath` is `lib/routes.ts`'s, the same function the redirects use, so the brand link and the
 * route it points at cannot drift; it encodes the segment, for the reason that file gives.
 */
export default async function LinkLayout({ params, children }: LinkLayoutProps) {
  const { token } = await params
  return <LinkFrame home={linkPath(token)}>{children}</LinkFrame>
}
