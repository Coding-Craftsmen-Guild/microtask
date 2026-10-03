import { PlanLink } from '../nav/plan-nav'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import type { AttentionMap } from './attention'
import { ATTENTION_WHY } from './attention-words'
import { TRAY } from './attention-css'

const HEADING = 'Not on the timeline'

const NOTHING = 'Everything with an estimate is on the timeline.'

/** One feature with no bar: what it is called, and which rail it sits on. */
export interface TrayRow {
  readonly id: string

  readonly name: string

  readonly railName: string | null
}

/** Props for {@link UnscheduledTray}. */
export interface UnscheduledTrayProps {
  /** The features the pass could not place, in rail order. */
  readonly rows: readonly TrayRow[]

  readonly found: AttentionMap

  readonly routes: DrawerRoutes

  readonly root: string
}

/**
 * The features that have no bar, one row each, with what to do about it.
 *
 * ### What this is not
 *
 * It is not the conflict panel. That panel listed every problem the scheduler reported, including
 * one row per unsized *item*, and printed each row twice — a sentence and then the same subject
 * again as a link. On the deployed plan that came to about thirty rows above the timeline, and the
 * timeline started 2780px down the page.
 *
 * This lists **features only**, because a feature is the thing that has a bar and so the only thing
 * whose absence from the chart is worth a row. An unsized item is not missing from the timeline; it
 * never had a place on it. Its badge lives on its feature and in that feature's drawer, where
 * someone is in a position to give it an estimate.
 *
 * ### Why it is below the board and not above it
 *
 * A reader comes to this page for the plan. What is *not* on the plan is a footnote to that, and a
 * footnote goes underneath. It stays visible rather than collapsing, because four rows is not worth
 * hiding and a disclosure that has to be opened is a thing nobody opens.
 *
 * ### Why each row says so little
 *
 * A noun phrase — "Needs an estimate" — and the sentence explaining it on hover. The sentence was in
 * the row to begin with, and four rows of "Give it an estimate and it will take a place on the
 * timeline" is the conflict panel's own failure in miniature: the same words repeated once per row,
 * crowding out the names that differ.
 */
export function UnscheduledTray({ rows, found, routes, root }: UnscheduledTrayProps) {
  if (rows.length === 0) return null
  return (
    <section className={TRAY.panel} data-slot="unscheduled-tray">
      <h2 className={TRAY.heading}>
        {HEADING}
        <span className={TRAY.count}>{rows.length}</span>
      </h2>
      <ul className={TRAY.rows}>
        {rows.map((row) => {
          const why = found.get(row.id)?.[0]
          return (
            <li className={TRAY.row} data-slot="tray-row" key={row.id}>
              <PlanLink className={TRAY.name} href={routes.feature(root, row.id)}>
                {row.name}
              </PlanLink>
              {row.railName === null ? null : <span className={TRAY.rail}>{row.railName}</span>}
              <span className={TRAY.why} title={why === undefined ? NOTHING : ATTENTION_WHY[why.kind]}>
                {why?.detail ?? NOTHING}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
