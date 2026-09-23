import type { SprintTick } from '@repo/canvas'
import { isWorkingDay } from '@repo/schedule'

/**
 * Everything a sprint's hover is allowed to read: its label and its two calendar dates.
 *
 * **The `Pick` is the safety mechanism, not a tidiness.** A `SprintTick` also carries `startDay`,
 * `endDay`, `x` and `width`, and a sentence built from an offset is the one bug this whole task
 * exists to avoid: `dateToDay` rounds a Saturday, a Sunday and the Monday after them onto one
 * offset, so `dayToDate` can only ever hand back the Monday. A hover that stored the offset and
 * rendered a date from it would therefore name Monday for a Saturday. Narrowing the parameter to
 * the three string fields makes that impossible to write here rather than merely discouraged —
 * there is no number in scope to convert.
 *
 * The dates arrive **carried**, the way `TodayMark` carries `data-date` beside `data-day`:
 * `sprintTicks` passes `rangeOfSprint`'s own answers through untouched, and this passes them
 * through again.
 */
export type SprintDates = Pick<SprintTick, 'label' | 'from' | 'to'>

/**
 * What a hover over one sprint's column says: its week label, then the days it opens and closes on.
 *
 * `SprintTick.to` is **inclusive** — the sprint's last working day, and the one closed range in the
 * codebase beside a wall of exclusive `endDay`s. So the two dates are joined by the word `to` and
 * not by a dash: `2026-09-28 to 2026-10-15` names 10-15 as a day of the sprint, which is what the
 * datum says, while a dash range beside the label's own en dash would put two dashes meaning two
 * different things in one short sentence.
 *
 * Nothing here formats a date. Spec §5 asks for "real calendar dates", and an ISO date is the one
 * rendering that is the same date in every locale — the axis it labels is not localised either, and
 * `startDate` is written out in the same shape on the screen's own settings line.
 */
export const sprintHover = (tick: SprintDates): string =>
  `${tick.label} · ${tick.from} to ${tick.to}`

/**
 * What a hover over the today line says: today's date in the plan's own zone, and why the line may
 * not be where that date looks like it should be.
 *
 * A today that falls at the weekend has **no offset of its own to occupy**, because the axis is
 * working days: `todayLine` rounds it forward and draws the line on the left edge of Monday, where
 * no work has started. `TodayMark` argues that this "reads as an off-by-one to anyone who has not
 * been told", and a hover is exactly where to tell them — so the sentence names the true date
 * first, from `TodayLine.date` and never from `TodayLine.day`, and then says why the line sits
 * elsewhere.
 *
 * It says "the next one" rather than "Monday". Weekends are the only non-working days `isWorkingDay`
 * knows — "holidays do not exist" — so Monday would be true today, and would silently become a lie
 * on the day this product learns about holidays.
 */
export const todayHover = (date: string): string =>
  isWorkingDay(date)
    ? `Today · ${date}`
    : `Today · ${date} · not a working day, so the line sits at the next one`
