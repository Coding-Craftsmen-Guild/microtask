import Link from 'next/link'
import { TREE } from './sidebar-css'
import { SIDEBAR_WORDS } from './sidebar-words'

const CARET = '▾'

const PLUS = '+'

/** What a rail's disclosure needs: the checkbox it toggles, what to call it, and whose rail it is. */
export interface DisclosureProps {
  /** The checkbox's `id`, or nothing on a feature row, which has no disclosure. */
  readonly openId: string | undefined

  readonly openLabel: string | undefined

  readonly name: string
}

/**
 * The caret that collapses a rail, drawn **inside** its row.
 *
 * So a rail reads as one line with a disclosure at its start. What it does is `sidebar-css.ts`'s
 * `TREE_CSS`, asked from the branch above, and the glyph points down because an open rail is the
 * resting state. One character that turns rather than two swapped on `:checked`, so nothing in the
 * markup can disagree with the state of the checkbox that drives it.
 */
export function RailCaret({ openId, openLabel, name }: DisclosureProps) {
  if (openId === undefined) return null
  return (
    <label
      aria-label={`${openLabel ?? ''} ${name}`}
      className={TREE.caret}
      data-slot="rail-caret"
      htmlFor={openId}
    >
      {CARET}
    </label>
  )
}

/** The colour chip that doubles as the control selecting a rail, or a muted one for a rail with no hue. */
export function RailSwatch({ colour }: { readonly colour: string | undefined }) {
  const painted = colour === undefined || colour === '' ? undefined : { backgroundColor: colour }
  return <span className={TREE.swatch} data-slot="rail-swatch" style={painted} />
}

/**
 * The control that puts a feature on this rail, or nothing where there is nowhere for it to go.
 *
 * It is a **link** to the field that already creates a feature on a named rail — `rail-anchors.ts`
 * carries why there is no route of its own and why a link beats a button here. It names the rail it
 * would add to, because a column of identical `+` controls is a column of identical announcements
 * otherwise.
 */
export function RailAdd({ href, name }: { readonly href: string | undefined; readonly name: string }) {
  if (href === undefined) return null
  return (
    <Link
      aria-label={`${SIDEBAR_WORDS.addFeature} to ${name}`}
      className={TREE.add}
      data-slot="rail-add-feature"
      href={href}
    >
      {PLUS}
    </Link>
  )
}
