import type { DayRange, PlanScale } from '@repo/canvas'
import { ArcLayer } from './arc-layer'
import type { CanvasLayout } from './view'
import type { PlanScreenModel } from '../plan-screen-model'
import { Rail } from './rail'
import { TimeGrid } from './time-grid'
import { TodayMark } from './today-mark'
import { railTop } from './view'

const CANVAS = 'block w-full'

/** Props for {@link CanvasBoard}. */
export interface CanvasBoardProps {
  /** The plan being drawn, for the grid, the today line and the label. */
  readonly plan: PlanScreenModel

  /** Now. */
  readonly at: Date

  /** The window of days drawn. */
  readonly range: DayRange

  /** What a day is worth in px. */
  readonly scale: PlanScale

  /** Everything the layout worked out: the rails, the arcs, the size and the frame. */
  readonly layout: CanvasLayout
}

/**
 * The SVG itself: the grid, the arcs, one group per rail, and the today line over all of them.
 *
 * A Server Component, and the reason both gestures are wrappers rather than islands: this is up to two
 * thousand nodes, so a pointer move that re-rendered it would re-render the whole plan sixty times a
 * second. It is extracted from `./plan-canvas.tsx` so that the two roots can nest around it without that
 * file holding both the markup and the wiring.
 */
export function CanvasBoard({ plan, at, range, scale, layout }: CanvasBoardProps) {
  const { rails, arcs, height, width, drawnWidth, frame } = layout
  return (
    <svg
      aria-label={`Timeline of ${plan.name}`}
      className={CANVAS}
      data-slot="plan-canvas"
      height={height}
      role="img"
      style={{ minWidth: width }}
      width={width}
    >
      <TimeGrid height={height} plan={plan} range={range} scale={scale} />
      <ArcLayer arcs={arcs} />
      {rails.map((rail, index) => (
        <Rail frame={frame} key={rail.epicId} rail={rail} top={railTop(index)} width={drawnWidth} />
      ))}
      <TodayMark at={at} height={height} plan={plan} scale={scale} />
    </svg>
  )
}
