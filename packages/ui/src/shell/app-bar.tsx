import type { ReactNode } from 'react'

/** Props for {@link AppBar}. */
export interface AppBarProps {
  /** The product name, the bold first line of the lockup. */
  product: string
  /** Where the lockup links. Defaults to the site root. */
  href?: string
  /** An optional mark rendered left of the lockup; the asset lives in the app. */
  logo?: ReactNode
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
  wide: 'flex w-full items-center gap-3 px-5 py-3 max-sm:px-3.5',
}

/**
 * The brand bar both products share: indigo ground, a 3px gold underline, and
 * the two-line lockup of the product name over a letter-spaced `CC GUILD`.
 *
 * `product` is a prop rather than a constant because this is the shell
 * Macroplan renders too, and the logo is a slot because the image asset is
 * served by the app, not by this package.
 */
export function AppBar({ product, href = '/', logo, children, width = 'column' }: AppBarProps) {
  return (
    <header className="border-b-[3px] border-gold bg-brand text-white">
      <div className={ROW_BY_WIDTH[width]}>
        <a className="flex items-center gap-2.5 text-white no-underline" href={href}>
          {logo}
          <span className="grid">
            <span className="text-[15px] leading-[1.1] font-bold tracking-[0.02em]">{product}</span>
            <span className="text-[11px] tracking-[0.14em] text-gold uppercase">CC Guild</span>
          </span>
        </a>
        <span className="flex-1" />
        {children}
      </div>
    </header>
  )
}
