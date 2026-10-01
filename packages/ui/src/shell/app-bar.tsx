import type { ReactNode } from 'react'

/** Props for {@link AppBar}. */
export interface AppBarProps {
  /** The product name, the bold first line of the lockup. */
  product: string
  /** Where the lockup links. Defaults to the site root. */
  href?: string
  /** An optional mark rendered left of the lockup; the asset lives in the app. */
  logo?: ReactNode
  /**
   * Where the reader is, rendered after the lockup behind a hairline divider.
   *
   * A slot and not a list of crumbs, because the bar is laid out by a layout and the trail is known
   * to a route below it: the app fills this from a parallel route (`app/(admin)/@crumbs`), which is
   * the one way a nested segment's own read can reach a bar rendered above it. `CrumbTrail` is the
   * markup to put here, and the divider is drawn here rather than there so a bar with no trail has
   * no stray rule in it.
   */
  crumbs?: ReactNode
  /** Actions pushed to the far end of the bar, such as a sign-out link. */
  children?: ReactNode
  /**
   * `column` centres the bar's contents on legacy's 900px, matching a `column` page body beneath
   * it. `wide` runs them to the viewport edges, for a surface whose body is `wide` or `full`:
   * a lockup centred in the middle 900px of a 1600px screen reads as a document header, and the
   * actions at its far end land in the middle of the page rather than at the end of the bar.
   * Defaults to `column`.
   */
  width?: 'column' | 'wide'
}

const ROW_BY_WIDTH: Readonly<Record<'column' | 'wide', string>> = {
  column: 'mx-auto flex w-full max-w-[900px] items-center gap-3 px-5 py-3.5 max-sm:px-3.5',
  wide: 'flex w-full items-center gap-3 px-5 py-2 max-sm:px-3.5',
}

const DIVIDER = 'h-[22px] w-px shrink-0 bg-white/[0.18] max-sm:hidden'

/**
 * The brand bar both products share: indigo ground, a 3px gold underline, and
 * the two-line lockup of the product name over a letter-spaced `CC GUILD`.
 *
 * `product` is a prop rather than a constant because this is the shell
 * Macroplan renders too, and the logo is a slot because the image asset is
 * served by the app, not by this package.
 *
 * ### Two rows, and why only the wide one was restyled
 *
 * `wide` heads an application frame and now takes 8px of vertical padding rather than 12, so the bar
 * is 44px tall and the plan beneath it starts that much higher: a tool's chrome costs whatever it
 * takes away from the work, and this bar carries a lockup, a trail and one link. The `column` row is
 * untouched, because the surface it heads is a document and a document's header may breathe.
 *
 * ### The trail, and why it is behind a rule
 *
 * A lockup and a breadcrumb are two different things that both name where you are, and run together
 * they read as one four-word title. The 1px rule is what tells the eye that the left of it is the
 * product and the right of it is this page's place in it — the same device every tool with a
 * breadcrumb in its brand bar uses. It is drawn here and not in `CrumbTrail` so that a bar with no
 * trail carries no rule, which is the shape `apps/microtask` renders.
 */
export function AppBar({ product, href = '/', logo, crumbs, children, width = 'column' }: AppBarProps) {
  return (
    <header className="border-b-[3px] border-gold bg-brand text-white">
      <div className={ROW_BY_WIDTH[width]}>
        <a className="flex shrink-0 items-center gap-2.5 text-white no-underline" href={href}>
          {logo}
          <span className="grid">
            <span className="text-[14px] leading-[1.1] font-bold tracking-[0.02em]">{product}</span>
            <span className="text-[10px] tracking-[0.14em] text-gold uppercase">CC Guild</span>
          </span>
        </a>
        {crumbs === undefined || crumbs === null ? null : (
          <>
            <span aria-hidden="true" className={DIVIDER} />
            {crumbs}
          </>
        )}
        <span className="flex-1" />
        {children}
      </div>
    </header>
  )
}
