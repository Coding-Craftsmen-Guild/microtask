import Link from 'next/link'
import type { AttentionMap } from '../attention/attention'
import { AttentionDot } from '../attention/attention-mark'
import { SELECT_RADIO_NAME } from './select-css'
import { RailAdd, RailCaret, RailSwatch } from './row-parts'
import { TREE } from './sidebar-css'

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
   * `./row-parts.tsx` carries why the caret is drawn inside the row and why it is one glyph that turns
   * rather than two swapped on `:checked`.
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

  /**
   * Where a feature is added to this rail, or nothing for a feature row and for a surface with no
   * rail drawer.
   *
   * It is absent on a **feature** row because a feature holds items, and an item is added from the
   * feature's own drawer — the same asymmetry `table/row-actions.tsx` draws, where a feature row
   * offers an add and an item row offers two links rather than three.
   *
   * It is absent on the **seat** surface because `DrawerRoutes.rail` is null there: a seat holder
   * addresses features and items and has no cookie for an admin path (ADR 0032).
   */
  readonly addHref?: string
}

/**
 * One row of the tree: a grip that selects, a name that opens, a mark when something is wrong, and —
 * on a rail — a way to put a feature on it.
 *
 * Both kinds of row are this component because they differ only in indent, weight and whether the
 * grip paints a colour — and because writing them twice is how the rail row and the feature row came
 * to disagree about `min-w-0` in the first place, which is what put the sidebar on top of the canvas.
 *
 * ### Why the whole row lights and the name no longer underlines
 *
 * The name was the only thing that responded to a pointer, so a row read as a word with a link in it
 * rather than as a row. `sidebar-css.ts` moves the hover to the row and takes the underline off, which
 * also leaves the add control a place to appear that is not on top of the name.
 */
export function TreeRow(props: TreeRowProps) {
  const { name, radioId, href, found, id, kind, colour, detail, openId, openLabel, addHref } = props
  return (
    <div
      className={kind === 'rail' ? TREE.railRow : TREE.featureRow}
      data-detail={kind === 'feature' ? detail : undefined}
      data-hover-id={kind === 'feature' ? id : undefined}
      data-kind={kind}
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
      <RailAdd href={addHref} name={name} />
    </div>
  )
}

/** The hidden radio that makes one row of the tree the selected one. */
export function TreeRadio({ radioId }: { readonly radioId: string }) {
  return <input className="peer sr-only" id={radioId} name={SELECT_RADIO_NAME} type="radio" />
}
