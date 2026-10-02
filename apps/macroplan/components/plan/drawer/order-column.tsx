import { BAND, ORDER } from './list-css'
import { OrderCell } from './order-cell'
import type { PanelParts } from './panel-parts'
import { PANEL_GRID } from './panel-css'
import { OrderSteps } from './order-steps'
import { PANEL_BANDS } from './panel-words'

const MIDDOT = String.fromCharCode(0xb7)

/** Props for {@link OrderColumn}. */
export interface OrderColumnProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * An item's second column: where it sits in its feature, and the two moves either way.
 *
 * ### Why order is the whole column
 *
 * An item's dates are not its own: items run one after another inside their feature, so moving one
 * earlier moves everything after it later, and the sprint it lands in follows from that. Order is
 * therefore the only thing on an item's panel that changes *when* it happens — which is why it gets a
 * column with the neighbours named in it rather than two buttons in a band.
 *
 * The two boxes are what the arrows mean, written out: `Comes after` holds the item that would swap
 * with a press of the left arrow, and each is a link to that item's own panel, so working down a
 * breakdown is a chain rather than a trip back through the feature.
 *
 * ### Why a feature has no column like this
 *
 * Move up and Move down are gone from a feature's panel, and were not replaced here: a feature's order
 * on its rail is set by dragging the bar, which is the same gesture with the dates visible, and its
 * start is set by the dependencies beside it. Two buttons in a panel could never say which of those
 * three a reader meant.
 */
export function OrderColumn({ parts }: OrderColumnProps) {
  const { row, values, closeHref } = parts
  const family = values.panel.family
  const at = family.findIndex((one) => one.id === row.id)
  if (row.kind !== 'item' || at === -1) return null
  return (
    <div className={PANEL_GRID.split} data-slot="panel-order">
      <p className={BAND.title}>{PANEL_BANDS.order}</p>
      <p className={BAND.sub}>{`${String(at + 1)} of ${String(family.length)} ${MIDDOT} ${values.panel.dates}`}</p>
      <div className={ORDER.cells}>
        <OrderCell
          fallback={PANEL_BANDS.start}
          item={family[at - 1]}
          label={PANEL_BANDS.after}
          root={closeHref}
          stack={parts.stack}
        />
        <OrderSteps parts={parts} />
        <OrderCell
          fallback={PANEL_BANDS.end}
          item={family[at + 1]}
          label={PANEL_BANDS.before}
          root={closeHref}
          stack={parts.stack}
        />
      </div>
      {parts.link}
    </div>
  )
}
