import type { PlanBridge } from '@repo/api-client'
import { todayLine } from '@repo/canvas'
import type { Rung } from '@repo/canvas'
import type { ReactNode } from 'react'
import { PlanBoard } from './board/plan-board'
import type { FeaturePlace } from './canvas/drag-root'
import { ZOOM_VIEW } from './canvas/zoom-view'
import type { PlanScreenModel } from './plan-screen-model'
import { PlanTable } from './table/plan-table'
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

  readonly routes: DrawerRoutes
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
  const { plan, at, zoom, progress, place, tray, root, routes } = props
  const view = ZOOM_VIEW[zoom]
  const today = todayLine(plan, at, view.scale)
  const reach = today === null ? plan : { ...plan, todayDay: today.day }
  return (
    <>
      <div className={VIEW_SWITCH.timelinePanel} data-slot="timeline-panel">
        <PlanBoard
          at={at}
          place={place}
          plan={plan}
          progress={progress}
          range={view.rangeFor(reach)}
          root={root}
          routes={routes}
          rung={zoom}
          scale={view.scale}
        />
        {tray}
      </div>
      <div className={VIEW_SWITCH.tablePanel} data-slot="table-panel">
        <PlanTable plan={plan} progress={progress} />
      </div>
    </>
  )
}
