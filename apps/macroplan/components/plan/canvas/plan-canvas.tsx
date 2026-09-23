import type { Plan } from '@repo/api-client'
import { dayToX, itemsToMarks, railLayout, rungFor, treatmentsOf } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import { QuarterBandLayer } from './quarter-bands'
import { Rail } from './rail'
import { SprintTickLayer } from './sprint-ticks'
import { TodayMark } from './today-mark'
import {
  canvasHeight,
  canvasWidth,
  CANVAS_RANGE,
  CANVAS_SCALE,
  DRAWS,
  gutterX,
  LAYOUT,
  marksByFeature,
  railNames,
  railTop,
  unplacedByRail,
  viewBoxOf,
  type RailFrame,
} from './view'

const CANVAS = 'block shrink-0'

/** Props for {@link PlanCanvas}. */
export interface PlanCanvasProps {
  /** The plan and the schedule derived from it, exactly as `GET /plans/{planId}` answered. */
  readonly plan: Plan

  /** The instant to draw the today line at. Read once by the page and threaded down. */
  readonly at: Date

  /** The working days on screen. Defaults to {@link CANVAS_RANGE}, which is the feature rung. */
  readonly range?: DayRange

  /** The px per working day and the label gutter. Defaults to {@link CANVAS_SCALE}. */
  readonly scale?: PlanScale
}

/**
 * The plan's timeline, as one `<svg>`: quarter bands, sprint gridlines, a rail per epic, a bar per
 * placed feature and a strip per placed item.
 *
 * **It computes no geometry.** Every x and every width on this canvas came out of `@repo/canvas`,
 * which holds no React and no DOM and was tested without one — spec §5: "Layout is **pure
 * functions** … with the React component a thin renderer over their output. An SVG canvas is
 * otherwise untestable except through screenshots." What is decided here is which of those functions
 * to call, in what order to nest their output, and which px the chrome's own boxes are.
 *
 * The plan goes into each of those functions **as the value, never as a spread**. A contracts-shaped
 * `PlanView` satisfies `CanvasPlan` and `PlanCalendar` structurally with no adapter and no cast, and
 * `plan.schedule` satisfies both `CanvasSchedule` and `CanvasScheduleWithStatus`; `{ ...plan }` would
 * be a fresh object literal, and excess-property checking would then reject `id`, `name`,
 * `shareLinks`, `createdAt`, `updatedAt` and `schedule` one by one.
 *
 * `range` and `scale` are props with defaults rather than constants read inside, and that is what
 * keeps every rung reachable: `rungFor` reads the range, a range wider than a quarter is the epic
 * rung, and a canvas gated on the epic rung draws no bars. Phase 3's zoom and pan will pass them; the
 * admin page takes the defaults, which are one quarter and therefore the feature rung.
 *
 * ### `role="img"`, and the honest version of that
 *
 * An SVG is invisible to a screen reader without help, and this one is a picture rather than a
 * structure: `role="img"` with an `aria-label` naming the plan says "here is a timeline of Atlas
 * rollout" and stops, which is the truth — every band label, rail name and bar inside it is a graphic
 * with no accessible name of its own, and announcing 2,000 unnamed rects would be worse than
 * announcing none. Spec §5 is explicit that the answer is a second rendering, not a decorated
 * drawing: "An SVG-only plan is unreadable to a screen reader, and the table is also the fastest way
 * to audit a plan someone else drew." Task 13 builds that table as this canvas's accessible peer.
 *
 * There is no `eslint-plugin-jsx-a11y` and no `axe` in this repo, so a role-based assertion is the
 * whole mechanism — `plan-canvas.test.tsx` finds this canvas by its role and its name and by nothing
 * else.
 */
export function PlanCanvas({
  plan,
  at,
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
}: PlanCanvasProps) {
  const rails = railLayout(plan, plan.schedule, scale)
  const height = canvasHeight(rails.length)
  const treatments = treatmentsOf(plan.schedule)
  const frame: RailFrame = {
    marks: marksByFeature(itemsToMarks(plan, plan.schedule, scale)),
    treatments,
    draws: DRAWS[rungFor(range)],
    labelX: gutterX(scale, range) + LAYOUT.labelInset,
    axisX: dayToX(range.fromDay, scale),
  }
  const names = railNames(plan)
  const unplaced = unplacedByRail(plan, treatments)
  return (
    <svg
      aria-label={`Timeline of ${plan.name}`}
      className={CANVAS}
      data-slot="plan-canvas"
      height={height}
      role="img"
      viewBox={viewBoxOf(rails.length, scale, range)}
      width={canvasWidth(scale, range)}
    >
      <QuarterBandLayer height={height} plan={plan} range={range} scale={scale} />
      <SprintTickLayer height={height} plan={plan} range={range} scale={scale} />
      {rails.map((rail, index) => (
        <Rail
          frame={frame}
          key={rail.epicId}
          name={names.get(rail.epicId)}
          rail={rail}
          top={railTop(index)}
          unplaced={unplaced.get(rail.epicId) ?? []}
        />
      ))}
      <TodayMark at={at} height={height} plan={plan} scale={scale} />
    </svg>
  )
}
