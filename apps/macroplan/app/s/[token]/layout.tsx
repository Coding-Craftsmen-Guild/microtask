import type { ReactNode } from 'react'
import { LinkFrame } from '../../../components/link/link-frame'
import { linkPath } from '../../../lib/routes'
import { seatPlanScreen } from './seat-plan'

/** Props for {@link LinkLayout}. */
export interface LinkLayoutProps {
  /** The token segment, which is also where the brand lockup links. */
  readonly params: Promise<{ readonly token: string }>

  /**
   * Whatever is open beside the plan: one feature, one item, or the sentence saying nothing is.
   *
   * It is the **drawer slot** rather than the page. The plan is handed to the browser here, through
   * {@link seatPlanScreen}, and the browser draws the drawer the address names beside it — so opening a
   * feature is a `history.pushState` and no request at all (ADR 0069). The routes below still exist, so an
   * address can be linked to and reloaded; they render nothing, and this passes them through untouched.
   */
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
 *
 * **The plan is read here and not in `page.tsx`**, so that every drawer address under this layout opens
 * over the one plan it read: a layout does not re-render when navigation moves between its children.
 * `seat-plan.tsx` is the whole of that render, kept out of this file because a frame and a plan are two
 * subjects and this one is about the frame.
 */
export default async function LinkLayout({ params, children }: LinkLayoutProps) {
  const { token } = await params
  return <LinkFrame home={linkPath(token)}>{await seatPlanScreen(token, children)}</LinkFrame>
}
