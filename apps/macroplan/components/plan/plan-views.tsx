import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import type { ReactNode } from 'react'
import { TimelinePanel } from './board/timeline-panel'
import type { PlanAxis } from './canvas/zoom-view'
import type { PlanScreenModel } from './plan-screen-model'
import { TableAside } from './table/table-aside'
import type { TableWrites } from './table/plan-table'
import type { BoardWrites } from './table/table-writes'
import type { DrawerRoutes } from '../../lib/drawer-routes'
import { VIEW_SWITCH, type PlanView } from './view-switch'

/** Props for {@link PlanViews}. */
export interface PlanViewsProps extends BoardWrites {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly zoom: Rung

  /** The scale and the window the timeline is drawn at, worked out once for the whole screen. */
  readonly axis: PlanAxis

  readonly progress: PlanBridge['items']

  /** The unscheduled tray, shown under the board and not under the table. */
  readonly tray: ReactNode

  /** The plan id or the seat token, whichever roots this surface’s URLs. */
  readonly root: string

  /** What this viewer may do to a row, which decides the table's actions column. */
  readonly writes: TableWrites

  /** Where the table's one plan-level add goes, or `null` on a surface that may not add a rail. */
  readonly newRailHref: string | null

  readonly routes: DrawerRoutes

  /** The hue to propose for a dropped rail, chosen from how many the plan holds. */
  readonly nextRailColour: string

  /** Which rendering is on screen. */
  readonly view: PlanView
}

/**
 * The two renderings of the plan: the one chosen, on screen, and the table, always, for assistive tech.
 *
 * Returns a **fragment**: both panels have to be siblings inside the one flex column that gives them
 * their height, and a wrapper here would make that column contain a single child that contains both.
 *
 * The **timeline** is drawn only while it is chosen. It is an `<svg role="img">` with a label and nothing
 * a screen reader can use inside it, so not drawing it costs a reader one alt text and saves every
 * element of the canvas while the table is up.
 *
 * The **table** is the accessible rendering of the plan, so it is never dropped: with the timeline chosen
 * it sits off screen, where a reader who cannot see the canvas still has every row without finding the
 * switch first. What changed is its cost (ADR 0069): it mounts after the screen has painted, renders from
 * a deferred plan so an edit never waits for it, and is memoised so a zoom or a drawer leaves it alone.
 *
 * The tray belongs to the timeline and is inside its panel: a table row for an unplaced feature is
 * already in the table, with its empty dates showing.
 */
export function PlanViews(props: PlanViewsProps) {
  const { plan, at, zoom, axis, progress, tray, root, routes, writes, newRailHref, view, nextRailColour } = props
  return (
    <>
      {view === 'timeline' ? (
        <div className={VIEW_SWITCH.timelinePanel} data-slot="timeline-panel">
          <TimelinePanel {...props} at={at} axis={axis} nextRailColour={nextRailColour} plan={plan} progress={progress} root={root} routes={routes} tray={tray} zoom={zoom} />
        </div>
      ) : null}
      <TableAside
        newRailHref={newRailHref}
        plan={plan}
        progress={progress}
        root={root}
        routes={routes}
        shown={view === 'table'}
        writes={writes}
      />
    </>
  )
}
