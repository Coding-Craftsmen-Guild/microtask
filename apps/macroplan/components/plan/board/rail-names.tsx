import Link from 'next/link'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { LAYOUT } from '../canvas/view'
import { BOARD, HEADER_HEIGHT } from './board-css'
import type { BoardRail } from './board-rows'

const UNCLAIMED = 'Unclaimed rail'

const features = (count: number): string => (count === 1 ? '1 feature' : `${String(count)} features`)

/** Props for {@link RailNames}. */
export interface RailNamesProps {
  readonly root: string

  readonly routes: DrawerRoutes

  readonly rails: readonly BoardRail[]
}

/**
 * The rail names, one row per band, aligned to the canvas beside them.
 *
 * The spacer at the top is the time header's height. Without it every name would sit one header
 * higher than the bars it belongs to, which is the kind of error that looks like a rounding problem
 * and is actually a missing box.
 *
 * Each name is a link to its rail's drawer, which is what the first revision's separate `Open` link
 * was for. That link was a second focusable thing per row that had to fit in the same width, and it
 * is what escaped the sidebar and landed on top of the canvas: the name is the link now, and there
 * is nothing beside it to push out.
 */
export function RailNames({ root, routes, rails }: RailNamesProps) {
  return (
    <div className={BOARD.names} data-slot="rail-names">
      <div className={BOARD.headerCell} style={{ height: HEADER_HEIGHT }} />
      {rails.map((rail) => (
        <div
          className={BOARD.railRow}
          data-epic-id={rail.id}
          data-slot="rail-name"
          key={rail.id}
          style={{ height: LAYOUT.railHeight }}
        >
          <span
            className={BOARD.railSwatch}
            style={rail.colour === null ? undefined : { backgroundColor: rail.colour }}
          />
          {routes.rail === null ? (
            <span className={BOARD.railStatic} title={rail.name ?? UNCLAIMED}>
              {rail.name ?? UNCLAIMED}
            </span>
          ) : (
            <Link className={BOARD.railName} href={routes.rail(root, rail.id)} title={rail.name ?? UNCLAIMED}>
              {rail.name ?? UNCLAIMED}
            </Link>
          )}
          <span className={BOARD.railCount}>{features(rail.featureCount)}</span>
        </div>
      ))}
    </div>
  )
}
