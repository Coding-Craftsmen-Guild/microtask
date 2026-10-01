import Link from 'next/link'
import { AttentionDot } from '../attention/attention-mark'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { LAYOUT } from '../canvas/view'
import { railRadioId } from './rail-select-css'
import { RAIL_ROW, RAIL_WIDTH } from './board-css'
import type { BoardRail } from './board-rows'

const UNCLAIMED = 'Unclaimed rail'

const GRIP = '⋮⋮'

const features = (count: number): string => (count === 1 ? '1 feature' : `${String(count)} features`)

/** Props for {@link RailColumn}. */
export interface RailColumnProps {
  readonly root: string

  readonly routes: DrawerRoutes

  readonly rails: readonly BoardRail[]
}

/**
 * The rails, one row per band, inside the board's own scroller and sticky to its left edge.
 *
 * ### What this replaces
 *
 * Two things, and that it replaces two is the point. There was a 17.5rem **tree** in a pane of its
 * own — every rail, every feature under it, a filter and a disclosure — and a 13rem **names column**
 * inside the board. Both listed the same rails in the same order, and a reader scrolling the plan
 * scrolled the tree out of step with the bands it was naming.
 *
 * One column, in the same flex row as the band it names, is what makes the alignment structural: a
 * rail's row and its lane are at the same y because they are the same row. The features the tree
 * listed are on the board — that is what the board is — and the hover card names whichever one the
 * pointer is on.
 *
 * ### There is no spacer, and that is the whole point of the new frame
 *
 * The names column needed one: it was a sibling of the **scroller**, so it had to leave exactly the
 * time header's height blank at its top for row zero to line up with lane zero — a constant two
 * components had to agree on, in a layout `happy-dom` cannot measure. This column is a child of the
 * body row, which already starts under the header, so row zero starts where lane zero does because
 * it is the same row. Nothing is left blank and nothing has to agree.
 *
 * ### Each name is a link, and each swatch is a label
 *
 * The name opens the rail's drawer, which is what the first revision's separate `Open` link was for —
 * a second focusable thing per row that had to fit the same width, and the one that escaped the
 * column and landed on the canvas. The swatch is the `<label>` of a selection radio, so clicking it
 * dims every other rail on the board (`./rail-select-css.ts`): the same control the tree's swatch
 * was, kept because it is the one gesture on this page that answers *read this lane against the
 * others*.
 */
export function RailColumn({ root, routes, rails }: RailColumnProps) {
  return (
    <div className={RAIL_ROW.column} data-slot="rail-names" style={{ width: RAIL_WIDTH }}>
      {rails.map((rail) => (
        <div
          className={RAIL_ROW.row}
          data-epic-id={rail.id}
          data-search={rail.search}
          data-slot="rail-row"
          key={rail.id}
          style={{ height: LAYOUT.railHeight }}
        >
          <span aria-hidden="true" className={RAIL_ROW.grip}>
            {GRIP}
          </span>
          <input className="sr-only" id={railRadioId(rail.id)} name="plan-selection" type="radio" />
          <label
            className={RAIL_ROW.swatch}
            htmlFor={railRadioId(rail.id)}
            style={rail.colour === null ? undefined : { backgroundColor: rail.colour }}
            title={rail.name ?? UNCLAIMED}
          />
          {routes.rail === null ? (
            <span className={RAIL_ROW.nameStatic} title={rail.name ?? UNCLAIMED}>
              {rail.name ?? UNCLAIMED}
            </span>
          ) : (
            <Link
              className={RAIL_ROW.name}
              href={routes.rail(root, rail.id)}
              title={rail.name ?? UNCLAIMED}
            >
              {rail.name ?? UNCLAIMED}
            </Link>
          )}
          <AttentionDot on={rail.attention} />
          <span className={RAIL_ROW.count}>{features(rail.featureCount)}</span>
        </div>
      ))}
    </div>
  )
}
