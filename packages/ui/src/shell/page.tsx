import type { ReactNode } from 'react'

/** Props for {@link Page}. */
export interface PageProps {
  /** The page body. */
  children: ReactNode
  /**
   * `column` is legacy's capped 900px column; `wide` drops the cap for content that wants the
   * viewport, such as a timeline that scrolls horizontally. Defaults to `column`.
   */
  width?: 'column' | 'wide'
}

const CLASS_BY_WIDTH: Readonly<Record<'column' | 'wide', string>> = {
  column: 'mx-auto w-full max-w-[900px] px-5 pb-20 max-sm:px-3.5',
  wide: 'mx-auto w-full px-5 pb-20 max-sm:px-3.5',
}

/**
 * The one width-and-padding container every page body sits in: 20px of side padding stepping
 * down to 14px under 640px, and 80px of bottom padding so the last row clears the viewport edge.
 * Centred and capped at legacy's 900px unless `width` is `wide`.
 *
 * The two widths are whole class strings held in a constant rather than one string with the cap
 * conditionally appended, because Tailwind's scanner reads source as plain text and emits nothing
 * for a class name it cannot see literally — the same reason `ProgressBar`'s gradients and
 * `outcomes.ts`'s badge tones are held as constants rather than built at runtime.
 *
 * It renders the `main` landmark, so a page composes `AppBar` then `Page` and
 * needs no wrapper of its own.
 */
export function Page({ children, width = 'column' }: PageProps) {
  return <main className={CLASS_BY_WIDTH[width]}>{children}</main>
}
