import Link from 'next/link'
import { drawerHref } from '../../../lib/drawer-routes'
import { EstimateField } from './estimate-field'
import { ItemAdd } from './item-add'
import { BAND, ITEMS } from './list-css'
import type { PanelParts } from './panel-parts'
import { PANEL_GRID } from './panel-css'
import { itemsLine, PANEL_BANDS } from './panel-words'

const totalOf = (days: readonly (number | null)[]): number | null =>
  days.every((one) => one === null)
    ? null
    : days.reduce<number>((running, one) => running + (one ?? 0), 0)

/** Props for {@link ItemsColumn}. */
export interface ItemsColumnProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * The third column: the items of this feature, each sized where it sits.
 *
 * ### Why the estimates are here rather than one drawer deeper
 *
 * Breaking a feature down is the work this panel exists for, and it was eight navigations: open the
 * feature, read that it has four items, open each one, type a number, come back. The items are the
 * column, and each one's estimate is a stepper in its own row, so the whole breakdown is one screen
 * and the total under the heading moves as it is typed.
 *
 * A name is still a link to that item's own panel, because an item has more to it than a size — a
 * description, a task link, where it sits in the order. The link is built from the panel's own
 * `closeHref`, which is the plan's path on both surfaces, so nothing had to be handed a route builder
 * (`lib/drawer-routes.ts`).
 *
 * ### Why the add row is inside the box
 *
 * The last row of the list is the one that adds to it. A form under the box would be a second thing
 * on the column, and the point of the row is that it is the end of the list: type, press Add, and the
 * item appears where the row was.
 */
export function ItemsColumn({ parts }: ItemsColumnProps) {
  const { row, values, controls, actions, planId, closeHref } = parts
  if (row.kind !== 'feature') return null
  const items = values.panel.family
  return (
    <div className={PANEL_GRID.split} data-slot="panel-items">
      <div className={ITEMS.head}>
        <p className={BAND.title}>{PANEL_BANDS.items}</p>
        <p className={BAND.sub}>{itemsLine(items.length, totalOf(items.map((one) => one.estimateDays)))}</p>
      </div>
      {items.length === 0 ? <p className={BAND.empty}>{PANEL_BANDS.noItems}</p> : null}
      <div className={ITEMS.box}>
        {items.map((item, index) => (
          <div className={ITEMS.row} data-slot="item-row" key={item.id}>
            <span className={ITEMS.index}>{index + 1}</span>
            <Link className={ITEMS.name} href={drawerHref(closeHref, 'item', item.id)}>
              {item.name}
            </Link>
            {controls.estimateItem ? (
              <EstimateField
                estimate={actions.estimateItem}
                estimateDays={item.estimateDays}
                kind="item"
                mini
                of={item.name}
                planId={planId}
                subjectId={item.id}
              />
            ) : null}
          </div>
        ))}
        {controls.createItem ? (
          <ItemAdd createItem={actions.createItem} featureId={row.id} planId={planId} />
        ) : null}
      </div>
    </div>
  )
}
