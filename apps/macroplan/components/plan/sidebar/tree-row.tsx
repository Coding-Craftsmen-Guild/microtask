import Link from 'next/link'
import type { AttentionMap } from '../attention/attention'
import { AttentionDot } from '../attention/attention-mark'
import { SELECT_RADIO_NAME } from './select-css'
import { TREE } from './sidebar-css'

const CARET = '▾'

interface Disclosure {
  readonly openId: string | undefined
  readonly openLabel: string | undefined
  readonly name: string
}

function RailCaret({ openId, openLabel, name }: Disclosure) {
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

function RailSwatch({ colour }: { readonly colour: string | undefined }) {
  const painted = colour === undefined || colour === '' ? undefined : { backgroundColor: colour }
  return <span className={TREE.swatch} data-slot="rail-swatch" style={painted} />
}

/** Props for {@link TreeRow}. */
export interface TreeRowProps {
  /** What the row is called, and what it is searched by. */
  readonly name: string

  /** The radio this row's grip checks, from `select-css.ts`. */
  readonly radioId: string

  /** Where the name goes, or `null` on a surface with no drawer for this kind of thing. */
  readonly href: string | null

  /** Everything wrong with this entity, for the dot at the end of the row. */
  readonly found: AttentionMap

  /** The id to look the attention up by, which is the entity's own. */
  readonly id: string

  /** Whether this is a rail or one of its features, which decides the indent and the swatch. */
  readonly kind: 'rail' | 'feature'

  /** The rail's colour, for a rail row's chip. Ignored for a feature. */
  readonly colour?: string

  /**
   * The id of the checkbox this row's caret toggles, for a rail. Absent on a feature, which has none.
   *
   * The caret is rendered **inside** the row rather than beside it, so that a rail reads as one line
   * with a disclosure at its start; what it does is `sidebar-css.ts`'s `TREE_CSS`, asked from the
   * branch above, and the glyph points down because an open rail is the resting state. One character
   * that turns rather than two swapped on `:checked`, so nothing in the markup can disagree with the
   * state of the checkbox that drives it.
   */
  readonly openId?: string

  /** What the caret is called, with the rail's name appended by this component. */
  readonly openLabel?: string

  /**
   * What a hover over this row says, joined, or nothing for a rail.
   *
   * It lands as `data-detail` beside `data-hover-id`, and those two attributes are the whole of what
   * `canvas/plan-pointer.tsx` needs: the card to draw, and which feature's marks to light while it is
   * up. That is why hovering a row in the tree and hovering a bar are one implementation rather than
   * two — the row is just another element carrying the same pair.
   */
  readonly detail?: string
}

/**
 * One row of the tree: a grip that selects, a name that opens, and a mark when something is wrong.
 *
 * Both kinds of row are this component because they differ only in indent, weight and whether the
 * grip paints a colour — and because writing them twice is how the rail row and the feature row came
 * to disagree about `min-w-0` in the first place, which is what put the sidebar on top of the canvas.
 */
export function TreeRow(props: TreeRowProps) {
  const { name, radioId, href, found, id, kind, colour, detail, openId, openLabel } = props
  return (
    <div
      className={kind === 'rail' ? TREE.railRow : TREE.featureRow}
      data-detail={kind === 'feature' ? detail : undefined}
      data-hover-id={kind === 'feature' ? id : undefined}
      data-search={name.toLowerCase()}
      data-slot="sidebar-row"
    >
      <RailCaret name={name} openId={openId} openLabel={openLabel} />
      <label aria-label={`Highlight ${name}`} className={TREE.grip} htmlFor={radioId}>
        {kind === 'rail' ? <RailSwatch colour={colour} /> : null}
      </label>
      {href === null ? (
        <span className={kind === 'rail' ? TREE.railStatic : TREE.featureName} title={name}>
          {name}
        </span>
      ) : (
        <Link className={kind === 'rail' ? TREE.railName : TREE.featureName} href={href} title={name}>
          {name}
        </Link>
      )}
      <AttentionDot on={found.get(id)} />
    </div>
  )
}

/** The hidden radio that makes one row of the tree the selected one. */
export function TreeRadio({ radioId }: { readonly radioId: string }) {
  return <input className="peer sr-only" id={radioId} name={SELECT_RADIO_NAME} type="radio" />
}
