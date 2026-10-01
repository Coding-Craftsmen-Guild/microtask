import { calendarBands, sprintTicks } from '@repo/canvas'
import type { CalendarBand, DayRange, PlanScale } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { chromeRange } from './view'

/**
 * Whether a band takes the shaded half of the alternation.
 *
 * Counted on `year * 4 + quarter` and not on the quarter alone, so the stripe keeps alternating
 * across a year boundary. Q4 and the Q1 after it are consecutive bands; keying on the quarter would
 * make both of them odd and put two unshaded bands side by side at every new year, exactly where a
 * reader most wants the edge to be visible.
 */
export const shaded = (band: CalendarBand): boolean => (band.year * 4 + band.quarter) % 2 === 0

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
      {calendarBands(plan, scale, chromeRange(range)).map((band) =>
        shaded(band) ? (
          <rect
            className={EVEN_BAND}
            data-quarter={`${String(band.year)}-${String(band.quarter)}`}
            data-slot="quarter-band"
            height={height}
            key={`${String(band.year)}-${String(band.quarter)}`}
            width={band.width}
            x={band.x}
            y={0}
          />
        ) : null,
      )}
      {sprintTicks(plan, scale, chromeRange(range)).map((tick) => (
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
