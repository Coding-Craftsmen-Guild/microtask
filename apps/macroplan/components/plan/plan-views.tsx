import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import type { ReactNode } from 'react'
import { TimelinePanel } from './board/timeline-panel'
import type { CreateWrites } from './board/create-write'
import type { FeaturePlace } from './canvas/drag-root'
import type { PlanScreenModel } from './plan-screen-model'
import { PlanTable, type TableWrites } from './table/plan-table'
import type { DrawerRoutes } from '../../lib/drawer-routes'
import { VIEW_SWITCH } from './view-switch'

/** Props for {@link PlanViews}. */
export interface PlanViewsProps {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly zoom: Rung

  readonly progress: PlanBridge['items']

  readonly place: FeaturePlace | null

  /** The unscheduled tray, shown under the board and not under the table. */
  readonly tray: ReactNode

  /** The plan id or the seat token, whichever roots this surface’s URLs. */
  readonly root: string

  /** What this viewer may do to a row, which decides the table's actions column. */
  readonly writes: TableWrites

  /** Where the table's one plan-level add goes, or `null` on a surface that may not add a rail. */
  readonly newRailHref: string | null

  readonly routes: DrawerRoutes

  /**
   * The four writes the Add strip's drops make, each `null` where this viewer may not make it.
   *
   * Separate from {@link PlanViewsProps.writes}, which is three booleans about what the **table** draws
   * in its actions column. These are the functions themselves, and they are flat and narrow for the
   * reason `board/create-write.ts` records: a drop handler handed the whole `PlanEditActions` could
   * reach seventeen writes it has no business with.
   */
  readonly adds: CreateWrites

  /** The hue to propose for a dropped rail, chosen on the server from how many the plan holds. */
  readonly nextRailColour: string
}

/**
 * The two renderings of the plan, both server-rendered, one hidden by CSS.
 *
 * Returns a **fragment**. Both panels are addressed by `[data-slot]` from a `:has()` rule on the
 * shell, so they no longer have to be siblings of the radios — but they do have to be siblings of
 * each other inside the one flex column that gives them their height, and a wrapper here would make
 * that column contain a single child that contains both, so neither would stretch.
 *
 * The tray belongs to the timeline and is inside its panel: a table row for an unplaced feature is
 * already in the table, with its empty dates showing, so repeating it underneath would be the
 * duplication this revision set out to remove.
 */
export function PlanViews(props: PlanViewsProps) {
  const { plan, at, zoom, progress, place, tray, root, routes, writes, newRailHref } = props
  const { adds, nextRailColour } = props
  return (
    <>
      <div className={VIEW_SWITCH.timelinePanel} data-slot="timeline-panel">
        <TimelinePanel
          adds={adds}
          at={at}
          nextRailColour={nextRailColour}
          place={place}
          plan={plan}
          progress={progress}
          root={root}
          routes={routes}
          tray={tray}
          zoom={zoom}
        />
      </div>
      <div className={VIEW_SWITCH.tablePanel} data-slot="table-panel">
        <PlanTable
          newRailHref={newRailHref}
          plan={plan}
          progress={progress}
          root={root}
          routes={routes}
          writes={writes}
        />
      </div>
    </>
  )
}
