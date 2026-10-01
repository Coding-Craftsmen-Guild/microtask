import { dateToDay, dayToDate } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import type { DayRange } from './bands.js'
import { dayToX, widthOfDays } from './scale.js'
import type { PlanScale } from './scale.js'

const MONTHS_PER_YEAR = 12

const LABELS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

/**
 * One calendar month band: the month it names, and its geometry.
 *
 * ### Why the label carries no year
 *
 * `CalendarBand` carries one because `Q1` alone cannot name a band on a multi-year axis, and the
 * quarter row is the top row — it has nothing above it to disambiguate it. A month band is always
 * drawn **under** a quarter band that already says which year it is in, so `Jan 2028` would repeat
 * a fact the cell above it is making, in a cell a third of its width. The `year` is on the object
 * all the same, because a key has to distinguish two Januaries even when a label does not.
 *
 * `endDay` is exclusive and `width` is `endDay - startDay` at this scale, with **no `+ 1`**,
 * matching `CalendarBand` and `FeatureBar`. Bands therefore abut exactly: one band's `endDay` is
 * the next one's `startDay`, and no pixel is drawn twice or left bare between them.
 */
export interface MonthBand {
  readonly year: number

  /** 1 through 12, so a renderer can key on it without parsing the label back. */
  readonly month: number

  /** `Jan`. The year is deliberately absent; see the note above. */
  readonly label: string

  readonly startDay: number

  /** Exclusive: the first working-day offset **not** covered by this band. */
  readonly endDay: number

  readonly x: number

  readonly width: number
}

interface InMonth {
  readonly year: number
  readonly month: number
}

const inMonth = (date: string): InMonth => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
})

const opensOn = (at: InMonth): string => `${pad(at.year, 4)}-${pad(at.month, 2)}-01`

const after = (at: InMonth): InMonth =>
  at.month === MONTHS_PER_YEAR
    ? { year: at.year + 1, month: 1 }
    : { year: at.year, month: at.month + 1 }

const labelOf = (month: number): string => LABELS[month - 1] ?? pad(month, 2)

/**
 * The calendar months a viewport intersects, left to right.
 *
 * ### Why this exists beside `calendarBands`
 *
 * So that the two rows of the time header can share their vertical lines. The header's top row is a
 * calendar quarter and its bottom row used to be a **sprint** tick — a fixed `sprintLengthDays`
 * counted from the plan's own day zero — and those two families of edges coincide only by accident.
 * A plan does not begin its sprints on the first of a quarter and has no reason to, so at the Year
 * rung the header drew two rows of boxes whose boundaries disagreed everywhere, which reads as a
 * broken chart rather than as two true statements about time.
 *
 * A quarter is exactly three calendar months. So every quarter edge is also a month edge, and a
 * header drawing quarters over months has no line in the upper row that the lower row contradicts.
 * `months.test.ts` pins that as a property rather than as an example — every `startDay`
 * `calendarBands` answers is one this answers too — because it is the whole reason this function was
 * written and an example would not notice if it stopped being true.
 *
 * The sprint ticks are **not** replaced everywhere. At the Quarter and Sprint rungs a reader is
 * looking at individual work, and the line they need is the sprint boundary the plan is actually
 * scheduled against; trading it for a calendar line that happens to align would be tidier and less
 * useful.
 *
 * ### How a month becomes a run of working-day offsets
 *
 * Exactly as a quarter does, and the shared technique is why these two functions stay recognisably
 * siblings: name the month's **first calendar date** — `2026-04-01` — and ask `dateToDay` for its
 * offset. That function rounds a weekend date forward to the next working day, which is the answer
 * wanted here: when a month opens on a Saturday its first *working* day is the Monday, and so is the
 * offset. The same call made for the **next** month's opening date is this band's exclusive
 * `endDay`, so one band ends on the offset the next begins on.
 *
 * It is a walk over bands and not over days, so a year is twelve `dateToDay` calls rather than two
 * hundred and sixty.
 *
 * ### Range semantics, which are `calendarBands`'s
 *
 * `range.toDay` is exclusive, so a viewport ending exactly on a band boundary does not pull in the
 * band that boundary opens, and an empty or inverted range yields no bands at all. A band the
 * viewport only partly shows is returned **whole and unclipped** — the walk begins at the month
 * holding `fromDay` and takes that month's own start — because the range selects which bands exist
 * and clipping is the renderer's job. A band clipped here would report a `width` that is not the
 * width of a month.
 *
 * ### What it does not read
 *
 * `sprintLengthDays`. A calendar month is no count of sprints, so two plans differing only in sprint
 * length draw identical bands. Nothing is read from the plan's zone and neither argument is mutated.
 *
 * ### The label's unreachable branch
 *
 * A month outside 1 to 12 has no name in the table, and cannot arise here — the month comes from
 * `dayToDate`, which answers an ISO date. The branch answers the **padded number** rather than an
 * empty string all the same, because an unreachable branch should still say something a reader could
 * act on: `13` in a header cell is visibly wrong and says where to look, where a blank cell is
 * indistinguishable from a month too narrow to be named.
 */
export function monthBands(
  plan: PlanCalendar,
  scale: PlanScale,
  range: DayRange,
): readonly MonthBand[] {
  if (range.toDay <= range.fromDay) return []
  const bands: MonthBand[] = []
  let at = inMonth(dayToDate(range.fromDay, plan))
  let startDay = dateToDay(opensOn(at), plan)
  while (startDay < range.toDay) {
    const endDay = dateToDay(opensOn(after(at)), plan)
    bands.push({
      year: at.year,
      month: at.month,
      label: labelOf(at.month),
      startDay,
      endDay,
      x: dayToX(startDay, scale),
      width: widthOfDays(endDay - startDay, scale),
    })
    at = after(at)
    startDay = endDay
  }
  return bands
}
