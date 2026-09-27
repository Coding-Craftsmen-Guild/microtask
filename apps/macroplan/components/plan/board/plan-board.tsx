import { railLayout } from '@repo/canvas'
import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import type { FeaturePlace } from '../canvas/drag-root'
import { PlanCanvas } from '../canvas/plan-canvas'
import type { Counted } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { BOARD } from './board-css'
import { boardRails } from './board-rows'
import { RailNames } from './rail-names'
import { TimeHeader } from './time-header'
import { canvasWidth } from '../canvas/view'

/** Props for {@link PlanBoard}. */
export interface PlanBoardProps {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly range: DayRange

  readonly scale: PlanScale

  readonly rung: Rung

  readonly progress: Counted

  readonly place: FeaturePlace | null

  readonly root: string

  readonly routes: DrawerRoutes
}

/**
 * The timeline as a reader meets it: rail names that stay put, dates that stay on screen, and the
 * canvas scrolling under both.
 *
 * ### Why the rails are laid out twice
 *
 * `railLayout` is called here for the names column and again inside `PlanCanvas` for the bars. It is
 * a pure function of the plan, the schedule and the scale, and all three are the same both times, so
 * the two agree by construction — which is the property that matters, and a cheaper one to hold than
 * threading a layout through two components that otherwise share nothing. Passing it down would make
 * `PlanCanvas` take geometry it can compute, and it is the component that owns computing it.
 */
export function PlanBoard(props: PlanBoardProps) {
  const { plan, at, range, scale, rung, progress, place, root, routes } = props
  const rails = boardRails(plan, railLayout(plan, plan.schedule, scale))
  const width = canvasWidth(scale, range)
  return (
    <div className={BOARD.scroller} data-slot="plan-board">
      <RailNames rails={rails} root={root} routes={routes} />
      <div className={BOARD.timeline} data-slot="timeline-scroller">
        <TimeHeader plan={plan} range={range} scale={scale} width={width} />
        <PlanCanvas
          at={at}
          hrefOf={(featureId) => routes.feature(root, featureId)}
          place={place}
          plan={plan}
          progress={progress}
          range={range}
          rung={rung}
          scale={scale}
        />
      </div>
    </div>
  )
}
