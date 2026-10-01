import { calendarBands, sprintTicks, todayLine } from '@repo/canvas'
import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import { chromeRange } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import { TIER, TIME } from './board-css'
import { QuarterCell, SprintCell, YearCell } from './header-cells'
import { yearBands } from './time-bands'

const TODAY = 'TODAY'

const TODAY_OFFSET = 4

/** Props for {@link TimeHeader}. */
export interface TimeHeaderProps {
  readonly plan: PlanScreenModel

  readonly scale: PlanScale

  readonly range: DayRange

  /**
   * Which stop is drawn, which decides what each sprint cell has room to say.
   *
   * Passed rather than derived from the range with `rungFor`, for the reason `CanvasQuery` states:
   * the range follows the plan's own span, so a short plan at the Year stop produces a range
   * `rungFor` would call `item`, and the header would label in a stop's worth of detail under a
   * canvas drawing a rollup. The two must agree, and the only way to be sure is for both to be told.
   */
  readonly rung: Rung

  /** The instant to read the clock at, which is what puts the `TODAY` tag somewhere. */
  readonly at: Date

  /** The canvas width, so the header is exactly as wide as the thing it labels. */
  readonly width: number
}

/**
 * The calendar headings, as three tiers of HTML positioned over the axis the canvas uses.
 *
 * ### Why it is not in the SVG
 *
 * It was, and it clipped. A `<text>` at a band's x is drawn at that x whether or not the band is on
 * screen, so the first revision routed every heading through a `labelX` clamp to keep the current
 * quarter's name from scrolling out of its own band. As HTML each heading is a box inside a
 * positioned row, `overflow-hidden` does the clipping, and a long name simply ellipsises.
 *
 * ### Why three tiers
 *
 * A year, a quarter, a sprint, each nesting inside the one above it. The year is what was missing: a
 * plan running into January showed `Q1` with nothing saying which year's, and the `TODAY` tag had no
 * row of its own and so nowhere to be but on top of a quarter's name.
 *
 * The bottom tier is sprints at **every** stop now, where it used to be months at the Year stop. The
 * swap was made because a quarter is exactly three calendar months and sprints are not, so two rows
 * of boxes disagreed everywhere at four pixels a day. What changed is that a sprint cell is no longer
 * handed one string to clip — `time-bands.ts` gives each stop what it has room for, which is `S1` at
 * four pixels a day and `Sprint 1 · W40–41 · Sep 28 – Oct 9` at forty. So the row that was dense is
 * legible, and the plan is labelled in the unit it is actually scheduled against at every zoom.
 *
 * ### Why the numbers come from the same functions the canvas uses
 *
 * `calendarBands` and `sprintTicks` are the canvas's own geometry, called here with the same scale
 * and the same `chromeRange`. Two sources for one axis is two things to drift; this way a heading is
 * over its band because both were computed from one number. `./time-bands.ts`'s years are a fold over
 * the quarters for exactly that reason rather than a second walk of the calendar.
 *
 * ### Why the range is bled
 *
 * The canvas fills a pane it was not told the width of, so the chrome is drawn past the days the
 * marks use and whatever is not reached is clipped. `chromeRange` carries the argument; the point
 * here is only that the header and the grid under it are bled by the **same** call, so a cell and
 * the rule beneath it cannot end at different days.
 */
export function TimeHeader({ plan, scale, range, rung, at, width }: TimeHeaderProps) {
  const drawn = chromeRange(range)
  const quarters = calendarBands(plan, scale, drawn)
  const today = todayLine(plan, at, scale)
  return (
    <div className={TIME.header} data-slot="time-header" style={{ minWidth: width }}>
      <div className={TIME.yearRow} style={{ height: TIER.year }}>
        {yearBands(quarters).map((band) => (
          <YearCell band={band} key={band.year} />
        ))}
        {today === null ? null : (
          <span className={TIME.today} data-slot="today-tag" style={{ left: today.x + TODAY_OFFSET }}>
            {TODAY}
          </span>
        )}
      </div>
      <div className={TIME.quarterRow} style={{ height: TIER.quarter }}>
        {quarters.map((band) => (
          <QuarterCell band={band} key={`${String(band.year)}-${String(band.quarter)}`} />
        ))}
      </div>
      <div className={TIME.sprintRow} style={{ height: TIER.sprint }}>
        {sprintTicks(plan, scale, drawn).map((tick) => (
          <SprintCell key={tick.sprint} rung={rung} tick={tick} />
        ))}
      </div>
    </div>
  )
}
