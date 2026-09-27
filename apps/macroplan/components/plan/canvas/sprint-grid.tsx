import { quarterBands, sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'

const EVEN_BAND = 'fill-foreground/[0.02]'

const TICK_LINE = 'stroke-border'

/** Props for {@link SprintGrid}. */
export interface SprintGridProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  readonly height: number
}

/**
 * The grid the bars sit on: an alternating wash per quarter, and a rule at each sprint boundary.
 *
 * This is what `QuarterBandLayer` and `SprintTickLayer` were, minus every piece of text and every
 * hover target. The headings are HTML in the row above (`TimeHeader`), and the per-sprint hover
 * rectangles went with them — a full-height transparent `<rect>` per sprint was one invisible
 * pointer target per sprint lying over every bar on the canvas, which is a strange thing to have
 * built and a worse thing to drag through.
 *
 * Merging the two layers into one also halves the number of `<g>` wrappers on a canvas whose element
 * count is the thing that grows with the plan.
 */
export function SprintGrid({ plan, scale, range, height }: SprintGridProps) {
  return (
    <g data-slot="sprint-grid">
      {quarterBands(plan, scale, range).map((band) =>
        band.quarter % 2 === 0 ? (
          <rect
            className={EVEN_BAND}
            data-quarter={band.quarter}
            data-slot="quarter-band"
            height={height}
            key={band.quarter}
            width={band.width}
            x={band.x}
            y={0}
          />
        ) : null,
      )}
      {sprintTicks(plan, scale, range).map((tick) => (
        <line
          className={TICK_LINE}
          data-slot="sprint-tick"
          data-sprint={tick.sprint}
          key={tick.sprint}
          x1={tick.x}
          x2={tick.x}
          y1={0}
          y2={height}
        />
      ))}
    </g>
  )
}
