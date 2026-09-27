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
   * It is the **drawer slot** rather than the page, which is the change this layout carries. The plan and
   * its five managers are drawn here, through {@link seatPlanScreen}, and the route below fills the panel
   * beside them — so opening a feature is one soft navigation that re-renders the drawer and leaves the
   * canvas and the table exactly as they are, a layout not re-rendering when navigation moves between its
   * children (ADR 0057). `(admin)/plans/[planId]/layout.tsx` has had that shape from the start; this
   * surface had no drawer until its writes were mounted, so its `page.tsx` rendered the whole screen and
   * there was nowhere a drawer segment could sit without rebuilding 2,200 table rows to open one panel.
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
 * **The plan is drawn here and not in `page.tsx`**, so that a drawer segment has somewhere to sit. What
 * that costs is that this layout makes the surface's two reads — both `cache()`d on their arguments, so a
 * drawer page beneath it finding one feature shares this read rather than making a second. `seat-plan.tsx`
 * is the whole of that render, kept out of this file because a frame and a plan are two subjects and this
 * one is about the frame.
 */
export default async function LinkLayout({ params, children }: LinkLayoutProps) {
  const { token } = await params
  return <LinkFrame home={linkPath(token)}>{await seatPlanScreen(token, children)}</LinkFrame>
}
