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

/**
 * Legacy's centred 900px column, without the padding {@link Page} adds around it.
 *
 * For the one shape a `width` prop cannot serve: a page that must cap itself **inside** a `wide`
 * {@link Page}, because a layout cannot see which page it is wrapping. `apps/macroplan`'s admin
 * surface is `wide` for its timeline, and its plan list — a list of rows, unreadable stretched
 * across a wide monitor — wraps itself in this.
 *
 * Exported so the cap has **one owner**. A consumer that wrote `max-w-[900px]` out again would be a
 * copy free to drift from the one `Page` renders, which is what this replaced. It is a separate whole
 * literal from `CLASS_BY_WIDTH.column` rather than a fragment interpolated into it, because this
 * module composes no class name by concatenation — `shell/module-boundaries.test.tsx` asserts that of
 * every file here — and `page.test.tsx` pins the two to each other so neither can move alone.
 *
 * `app-bar.tsx` keeps its own copy of the cap and should: its literal is one whole class string for a
 * flex bar row with its own padding, the token sits in the middle of it, and lifting a fragment out
 * would produce exactly the composed class name the rule above forbids. It is also both products'
 * bar, whose width answers to the brand rather than to a page's body.
 */
export const COLUMN = 'mx-auto w-full max-w-[900px]'

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
