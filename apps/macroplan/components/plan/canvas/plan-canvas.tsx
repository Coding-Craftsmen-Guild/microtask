import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { DragRoot, type FeaturePlace } from './drag-root'
import { ArcLayer } from './arc-layer'
import { Rail } from './rail'
import { TimeGrid } from './time-grid'
import { TodayMark } from './today-mark'
import { axisX, canvasLayout, CANVAS_RANGE, CANVAS_SCALE, railTop, type Counted } from './view'

const CANVAS = 'block w-full'

const NOTHING_OPENS = (): null => null

/** Props for {@link PlanCanvas}. */
export interface PlanCanvasProps {
  readonly plan: PlanScreenModel

  readonly progress?: Counted

  readonly at: Date

  /** The working days on screen. Defaults to {@link CANVAS_RANGE}, which is the feature rung. */
  readonly range?: DayRange

  readonly scale?: PlanScale

  /** Which rung to draw: bars and ticks, or one node per feature. */
  readonly rung?: Rung

  readonly place: FeaturePlace | null

  /** Where a bar opens. Defaults to opening nothing, for a canvas with no surface behind it. */
  readonly hrefOf?: (featureId: string) => string | null
}

/**
 * The plan's timeline: the sprint grid, the dependency arcs, one band per rail, and today.
 *
 * It draws **geometry only**. The rail names are an HTML column beside it and the quarter and week
 * headings an HTML row above it, both laid out from the same numbers this is — `board-css.ts` and
 * `view.ts` carry why. What is left is the part that genuinely wants a `viewBox`: things positioned
 * on a day axis.
 *
 * Layer order is paint order, and it is deliberate: the grid is behind everything, arcs are behind
 * the bars they join so a curve never crosses a name, the rails carry the bars and their labels,
 * and today is last so its rule is visible over a filled bar.
 *
 * ### No `viewBox`, which is what lets it fill a pane nobody measured
 *
 * The canvas has to reach the right edge of a pane whose width a Server Component cannot know.
 * Stretching an SVG that carries a `viewBox` is the obvious way and the wrong one: it scales **both**
 * axes, so rail bands grow taller than the HTML name rows beside them, and at
 * `preserveAspectRatio="none"` every `<circle>` becomes an ellipse and every label stretches. This
 * canvas holds rects, circles, polygons, lines, paths and text, and only two of those survive a
 * non-uniform scale.
 *
 * With no `viewBox` an SVG's user units **are** CSS pixels and there is no scaling transform at all.
 * So `w-full` fills the pane, the SVG clips its content to its own box, and every mark is drawn at
 * exactly the px the layout computed. The `minWidth` is the width the range needs, which is what
 * makes a plan too long to fit scroll rather than squash. It is an inline style rather than a class
 * because it is a runtime number and Tailwind's scanner reads class names as text.
 *
 * Two things follow elsewhere. `TimeGrid` is drawn for a **bled** range, so the grid reaches an
 * edge the range alone would stop short of (`./view.ts`'s `chromeRange`). And the drag stops
 * converting units at all: `./selection.ts` records that `userScale` and the one measurement feeding
 * it are gone, because a client pixel is now a user unit by construction.
 */
export function PlanCanvas({
  plan,
  at,
  place,
  progress = [],
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
  rung = 'feature',
  hrefOf = NOTHING_OPENS,
}: PlanCanvasProps) {
  const { rails, arcs, height, width, frame } = canvasLayout({
    plan,
    range,
    scale,
    rung,
    progress,
    hrefOf,
  })
  return (
    <DragRoot
      axisX={axisX(scale, range)}
      gutter={scale.gutter}
      place={place}
      planId={plan.id}
      pxPerDay={scale.pxPerDay}
    >
      <svg
        aria-label={`Timeline of ${plan.name}`}
        className={CANVAS}
        data-slot="plan-canvas"
        height={height}
        role="img"
        style={{ minWidth: width }}
        width={width}
      >
        <TimeGrid height={height} plan={plan} range={range} rung={rung} scale={scale} />
        <ArcLayer arcs={arcs} />
        {rails.map((rail, index) => (
          <Rail frame={frame} key={rail.epicId} rail={rail} top={railTop(index)} width={width} />
        ))}
        <TodayMark at={at} height={height} plan={plan} scale={scale} />
      </svg>
    </DragRoot>
  )
}
