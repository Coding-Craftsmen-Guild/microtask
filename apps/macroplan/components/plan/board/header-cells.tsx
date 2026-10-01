import type { CalendarBand, Rung, SprintTick } from '@repo/canvas'
import { TIME } from './board-css'
import { sprintWords, type YearBand } from './time-bands'

/**
 * The narrowest cell that still gets its quarter's name, in px.
 *
 * ### Why a label is dropped rather than merely clipped
 *
 * Each cell clips to its own band, which is what stops a sliver of a quarter printing on top of the
 * next one's name. That left a second way to look broken: a plan opening four working days before Q4
 * 2026 sits in a Q3 2026 whose visible cell is a few pixels wide, and clipping drew a lone `Q` in the
 * corner of the page. One letter is not a quarter, and a reader cannot tell it from a fault.
 *
 * So a band narrower than this draws its cell — the band is real and the grid stays unbroken — and no
 * text. Nothing legible is lost.
 *
 * 48 is `Q4 2026` at this row's own size plus its padding, measured in a browser rather than derived,
 * because `happy-dom` answers every text measurement with zero and nothing here can ask.
 */
export const NAMEABLE = 48

/** The same threshold for a short name — `Q3` — which is what a clamped leading quarter carries. */
export const NAMEABLE_SHORT = 24

/** Where one band's heading sits in the row, after clamping. */
export interface BandCell {
  readonly left: number

  readonly width: number
}

/**
 * The two numbers {@link cellOf} needs, named structurally so one clamp serves every row.
 *
 * A quarter band, a year band and a sprint tick are clamped identically and for the same reason —
 * each can open before the axis does — and none has anything else {@link cellOf} reads. Taking the
 * shape rather than any one type is what stops a second row growing a second, subtly different clamp.
 */
export interface Placed {
  readonly x: number

  readonly width: number
}

/**
 * One band's cell, clamped so a band that opens off screen still shows its name.
 *
 * ### Why clamping is needed now and was not before
 *
 * A band used to start on the plan's own day zero, because a quarter was six sprints counted from
 * there. A **calendar** quarter opens whenever the calendar says: a plan starting 2026-09-28 sits in
 * Q3 2026, a quarter that opened on 2026-07-01 — sixty working days before the plan did. Its band is
 * returned whole and unclipped, as `calendarBands` says it must be, so its `x` is negative and a cell
 * positioned at it would carry its label off the left edge. The visible two-thirds of the band would
 * then read as unlabelled.
 *
 * So the **cell** is clamped and the band is not: `left` is floored at the axis origin and exactly
 * those pixels come off the width, which leaves the cell's right edge where the band's right edge is.
 * `@repo/canvas`'s own note asks for this and says why no test there can discover it — clipping is
 * the renderer's job, and this is the renderer.
 */
export const cellOf = (band: Placed): BandCell => {
  const clamped = Math.max(band.x, 0)
  return { left: clamped, width: band.width - (clamped - band.x) }
}

/** Whether a band opens before the axis does, which is what makes its cell a partial one. */
export const isClamped = (band: Placed): boolean => band.x < 0

/** One year's heading, in the top tier. */
export function YearCell({ band }: { readonly band: YearBand }) {
  const cell = cellOf(band)
  return (
    <span
      className={TIME.year}
      data-slot="year-head"
      data-year={band.year}
      style={{ left: cell.left, width: cell.width }}
    >
      {cell.width < NAMEABLE_SHORT ? null : band.label}
    </span>
  )
}

/**
 * One quarter's heading, in the middle tier.
 *
 * ### Why a clamped quarter is shaded and renamed
 *
 * A plan starting in late September opens inside a Q3 that began sixty working days earlier, so the
 * first cell in this row is a stub of a quarter rather than a quarter. Shading it says that, and the
 * short name says it twice: `Q3` where its neighbours read `Q4 2026` is a cell that is visibly not
 * claiming to be the whole of anything. The year is in the tier above either way, so nothing is lost
 * by dropping it from a cell too narrow to hold it.
 */
export function QuarterCell({ band }: { readonly band: CalendarBand }) {
  const cell = cellOf(band)
  const part = isClamped(band)
  const label = part ? `Q${String(band.quarter)}` : band.label
  return (
    <span
      className={part ? `${TIME.quarter} ${TIME.quarterPart}` : TIME.quarter}
      data-part={part ? '' : undefined}
      data-quarter={`${String(band.year)}-${String(band.quarter)}`}
      data-slot="quarter-head"
      style={{ left: cell.left, width: cell.width }}
    >
      {cell.width < (part ? NAMEABLE_SHORT : NAMEABLE) ? null : label}
    </span>
  )
}

/**
 * One sprint's heading, in the bottom tier: what it is called, and when it runs.
 *
 * It is not clamped, where the two band cells are. A sprint tick is a fixed width counted from the
 * plan's own day zero, so the only tick that can open before the axis is one for a negative sprint,
 * which a bled range never reaches to the left — `chromeRange` bleeds rightwards only.
 *
 * `title` carries the full dates whatever the stop shows, which is what a 40px cell at the Year stop
 * has instead of room. `time-bands.ts` carries what each stop says and why.
 */
export function SprintCell({ tick, rung }: { readonly tick: SprintTick; readonly rung: Rung }) {
  const words = sprintWords(tick, rung)
  return (
    <span
      className={TIME.sprint}
      data-slot="week-head"
      data-sprint={tick.sprint}
      style={{ left: tick.x, width: tick.width }}
      title={`${tick.from} to ${tick.to}`}
    >
      <span className={TIME.sprintName}>{words.name}</span>
      {words.when === '' ? null : <span className={TIME.sprintWhen}>{words.when}</span>}
    </span>
  )
}
