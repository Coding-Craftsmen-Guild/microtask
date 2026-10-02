import Link from 'next/link'
import { drawerHref } from '../../../lib/drawer-routes'
import { BAND, ORDER } from './list-css'
import type { ChildItem } from './values'

/** Props for {@link OrderCell}. */
export interface OrderCellProps {
  /** What this cell is: what comes after this item, or what comes before it. */
  readonly label: string

  /** The neighbour that way, or `undefined` where this item is at that end of its feature. */
  readonly item: ChildItem | undefined

  /** What to say instead: the start of the feature, or its end. */
  readonly fallback: string

  /** The plan's own path, which the link hangs off (`lib/drawer-routes.ts`). */
  readonly root: string
}

/**
 * One end of an item's order: the neighbour that way, as a link, or the end of the feature.
 *
 * The neighbour is named rather than implied, because that is what the arrow beside it will swap this
 * item with — "Move later" on its own asks a reader to remember the list they came from. It is a link as
 * well as a label, so working down a breakdown is a chain rather than a trip back through the feature.
 */
export function OrderCell({ label, item, fallback, root }: OrderCellProps) {
  return (
    <div className={ORDER.cell}>
      <span className={BAND.sub}>{label}</span>
      {item === undefined ? (
        <p className={ORDER.edge}>{fallback}</p>
      ) : (
        <Link className={ORDER.name} href={drawerHref(root, 'item', item.id)}>
          {item.name}
        </Link>
      )}
    </div>
  )
}
