import { AppBar } from '@repo/ui/shell/app-bar'
import { Logo } from '@repo/ui/shell/logo'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'

/** Props for {@link LinkFrame}. */
export interface LinkFrameProps {
  /** Where the brand lockup links: this link's own page, never `/`. */
  readonly home: string

  /** The page. */
  readonly children: ReactNode
}

/**
 * The seat surface's frame: the brand bar with no Sign out, and the page column.
 *
 * The lockup links to the link's own page rather than to the bar's default `/`, which is the admin
 * surface: a plan seat clicking the logo would otherwise land on a password form, the one answer a
 * seat holder must never be given, because they have no password and never will (ADR 0032). There
 * is no Sign out either, for the reason there is nothing to sign out of — this surface's credential
 * is the URL and no cookie, so a seat holds no session to end (ADR 0040).
 *
 * `Page`'s `wide` width, where `apps/microtask`'s `LinkFrame` takes the default column. The one page
 * under this frame is a plan's timeline, and it is the **same** `PlanScreen` the admin surface
 * renders — which brings its own horizontal scroller and wants the viewport rather than legacy's
 * 900px cap, exactly as `app/(admin)/layout.tsx` argues for the admin half. A layout cannot see which
 * page it wraps, so the terminal page caps its own prose instead, the way the plan list does.
 */
export function LinkFrame({ home, children }: LinkFrameProps) {
  return (
    <>
      <AppBar href={home} logo={<Logo size="bar" />} product="Macroplan" />
      <Page width="wide">{children}</Page>
    </>
  )
}
