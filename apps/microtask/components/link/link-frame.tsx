import { AppBar } from '@repo/ui/shell/app-bar'
import { Page } from '@repo/ui/shell/page'
import type { ReactNode } from 'react'
import { Logo } from '@repo/ui/shell/logo'

/** Props for {@link LinkFrame}. */
export interface LinkFrameProps {
  /** Where the brand lockup links: the link's own page, never `/`. */
  home: string
  /** The page. */
  children: ReactNode
}

/**
 * The client surface's frame: the brand bar with no Sign out, and the page column.
 *
 * The lockup links to the link's own page rather than to the bar's default `/`, which is the
 * admin surface: a client clicking the logo would otherwise land on a password form, the one
 * answer a client must never be given (ADR 0032).
 */
export function LinkFrame({ home, children }: LinkFrameProps) {
  return (
    <>
      <AppBar href={home} logo={<Logo size="bar" />} product="Microtask" />
      <Page>{children}</Page>
    </>
  )
}
