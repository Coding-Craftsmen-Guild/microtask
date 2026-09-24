import type { DayRange, PlanScale } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { QuarterBandLayer } from './quarter-bands'
import { Rail } from './rail'
import { SprintTickLayer } from './sprint-ticks'
import { TodayMark } from './today-mark'
import { canvasLayout, CANVAS_RANGE, CANVAS_SCALE, railTop } from './view'

const CANVAS = 'block shrink-0'

/** Props for {@link PlanCanvas}. */
export interface PlanCanvasProps {
  /**
   * The plan and the schedule derived from it, as `GET /plans/{planId}` answered it minus the seats.
   *
   * A {@link PlanScreenModel} rather than a `Plan`, so the type that cannot hold a share token is
   * this component's own floor and not a ceiling one level up on `PlanScreen`. Phase 3 mounts
   * surfaces **beside** that screen — a drawer, a conflict list, a share manager — and a narrowing
   * that lives above it reaches none of them.
   */
  readonly plan: PlanScreenModel

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
 * otherwise untestable except through screenshots." **It also decides none of them.** Which of those
 * functions to call, and in what order, is `canvasLayout`'s in `./view` — asserted there against its
 * return value rather than here through an `<svg>` no test can measure. What is left in this function
 * is which of its answers to nest inside which.
 *
 * The plan goes into each of those functions **as the value, never as a spread**. A contracts-shaped
 * `PlanView` satisfies `CanvasPlan` and `PlanCalendar` structurally with no adapter and no cast, and
 * `plan.schedule` satisfies both `CanvasSchedule` and `CanvasScheduleWithStatus`; `{ ...plan }` would
 * be a fresh object literal, and excess-property checking would then reject `id`, `name`,
 * `createdAt`, `updatedAt` and `schedule` one by one.
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
 * That "no accessible name of its own" holds because it is **enforced**, not because the role is
 * trusted to prune the subtree. `role="img"` is only documented to prune it as a *SHOULD NOT*, and
 * Chromium declines: the two groups that carry a hover `<title>` — `SprintTickLayer`'s targets and
 * `TodayMark` — would otherwise be exposed as named nodes, so each sets `aria-hidden="true"`.
 * `SprintTickLayer` carries that argument, and `plan-hover.test.tsx` pins it.
 *
 * There is no `eslint-plugin-jsx-a11y` and no `axe` in this repo, so a role-based assertion is the
 * whole mechanism: `plan-canvas.test.tsx` asserts the accessible name **only** through
 * `getByRole('img', { name })`, never by reading `aria-label` off the node. Its `data-slot` queries
 * are for geometry and counts, which no role describes.
 */
export function PlanCanvas({
  plan,
  at,
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
}: PlanCanvasProps) {
  const { rails, height, width, viewBox, names, unplaced, frame } = canvasLayout(plan, range, scale)
  return (
    <svg
      aria-label={`Timeline of ${plan.name}`}
      className={CANVAS}
      data-slot="plan-canvas"
      height={height}
      role="img"
      viewBox={viewBox}
      width={width}
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
