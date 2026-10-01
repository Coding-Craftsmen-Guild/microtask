import { calendarBands, monthBands, sprintTicks } from '@repo/canvas'
import type { CalendarBand, DayRange, PlanScale, Rung } from '@repo/canvas'
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

const MONTHLY: Rung = 'epic'

/** Props for {@link TimeGrid}. */
export interface TimeGridProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  /**
   * Which stop is drawn, which decides what the rules count in.
   *
   * The same argument `TimeHeader` takes, and it must be the same value: the header's lower row and
   * these rules are the same boundaries drawn twice, once as a labelled cell and once as a line down
   * the canvas. A disagreement here would put a label over a cell with no line under it.
   */
  readonly rung: Rung

  readonly height: number
}

/**
 * The grid the bars sit on: an alternating wash per quarter, and a rule at each boundary below it.
 *
 * This is what `QuarterBandLayer` and `SprintTickLayer` were, minus every piece of text and every
 * hover target. The headings are HTML in the row above (`../board/time-header.tsx`), and the
 * per-sprint hover rectangles went with them — a full-height transparent `<rect>` per sprint was one
 * invisible pointer target per sprint lying over every bar on the canvas, which is a strange thing to
 * have built and a worse thing to drag through.
 *
 * Merging the two layers into one also halves the number of `<g>` wrappers on a canvas whose element
 * count is the thing that grows with the plan.
 *
 * ### Why it rules months at the Year stop
 *
 * It was `SprintGrid` and ruled sprint boundaries at every stop, which is what the name said. At the
 * Year stop that drew a rule every forty pixels, none of which lined up with the quarter wash behind
 * it — a sprint opens `sprintLengthDays` after the plan's own day zero and a quarter opens on the
 * calendar, so the two coincide only by accident.
 *
 * A quarter is exactly three calendar months, so a month rule falls on every band edge and never
 * inside one by surprise. `../board/time-header.tsx` carries the whole argument, including why the
 * Quarter and Sprint stops keep their sprint rules; what matters here is that both files read
 * {@link TimeGridProps.rung} and neither decides for itself.
 */
export function TimeGrid({ plan, scale, range, rung, height }: TimeGridProps) {
  const drawn = chromeRange(range)
  return (
    <g data-slot="time-grid">
      {calendarBands(plan, scale, drawn).map((band) =>
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
      {rung === MONTHLY
        ? monthBands(plan, scale, drawn).map((band) => (
            <line
              className={TICK_LINE}
              data-month={`${String(band.year)}-${String(band.month)}`}
              data-slot="month-rule"
              key={`${String(band.year)}-${String(band.month)}`}
              x1={band.x}
              x2={band.x}
              y1={0}
              y2={height}
            />
          ))
        : sprintTicks(plan, scale, drawn).map((tick) => (
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
