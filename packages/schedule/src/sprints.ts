import type { PlanCalendar } from './structure.js'
import { dayToDate } from './calendar.js'

/**
 * Which sprint a working-day offset falls in. 0-based; a UI adds one to label it.
 *
 * `Math.floor`, not truncation: this is a general axis utility, not one that only ever sees a
 * feature's own start. Phase 2's "today line" can legitimately fall before a plan's `startDate`,
 * giving a real negative offset, and that must land in a negative sprint of its own rather than
 * fold onto sprint 0 just because a division toward zero would round it there. Sprints are
 * gridlines drawn under the axis, not a container anything is placed into or counted against —
 * there is no capacity function here, on purpose.
 */
export function sprintOf(day: number, calendar: PlanCalendar): number {
  return Math.floor(day / calendar.sprintLengthDays)
}

/**
 * The first and last calendar dates of one sprint, both inclusive.
 *
 * A sprint spans the working-day offsets `n * sprintLengthDays` through
 * `(n + 1) * sprintLengthDays - 1`; each end is carried through {@link dayToDate} rather than
 * counted in calendar days, so a sprint is always exactly `sprintLengthDays` working days wide
 * regardless of which weekend falls inside it. `to` is inclusive here on purpose, unlike
 * `Span.endDay` elsewhere in this package, because a sprint is a closed range a UI draws a
 * gridline around, not a half-open range something is scheduled into.
 */
export function rangeOfSprint(sprint: number, calendar: PlanCalendar): { from: string; to: string } {
  const first = sprint * calendar.sprintLengthDays
  const last = first + calendar.sprintLengthDays - 1
  return { from: dayToDate(first, calendar), to: dayToDate(last, calendar) }
}
