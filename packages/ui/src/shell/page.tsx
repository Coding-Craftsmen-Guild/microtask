import type { ReactNode } from 'react'

/** Props for {@link Page}. */
export interface PageProps {
  /** The page body. */
  children: ReactNode
}

/**
 * The one width-and-padding container every page body sits in: centred, capped
 * at legacy's 900px, 20px of side padding stepping down to 14px under 640px,
 * and 80px of bottom padding so the last row clears the viewport edge.
 *
 * It renders the `main` landmark, so a page composes `AppBar` then `Page` and
 * needs no wrapper of its own.
 */
export function Page({ children }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[900px] px-5 pb-20 max-sm:px-3.5">{children}</main>
  )
}
