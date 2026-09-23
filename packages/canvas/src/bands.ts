import { dateToDay, rangeOfSprint, sprintOf, todayIn } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { dayToX, widthOfDays } from './scale.js'
import type { PlanScale } from './scale.js'

const WORKING_DAYS_PER_WEEK = 5

/**
 * The stretch of working-day offsets a viewport shows, and the one argument `PlanScale` does not
 * carry — Task 6 left a viewport off the scale on purpose, so every chrome function here is told
 * its range explicitly rather than guessing one from a px width.
 *
 * **`toDay` is exclusive**, matching `CanvasSpan.endDay`, `FeatureBar.endDay` and every other
 * `endDay` in this package. `{ fromDay: 0, toDay: 20 }` is twenty working days: 0 through 19. Day
 * 20 opens the next sprint and is outside the range.
 *
 * Said plainly because this file is the one place in the codebase where an inclusive range already
 * lives: `rangeOfSprint` in `@repo/schedule` answers `{ from, to }` with **`to` inclusive**, and
 * {@link SprintTick} carries both conventions at once — exclusive offsets for geometry, inclusive
 * dates for a hover. A second inclusive `day` convention here would be indefensible, so there
 * isn't one: every `…Day` number in this file is exclusive at its upper end.
 *
 * Both ends are signed. A viewport scrolled before the plan's `startDate` has a negative
 * `fromDay`, which is a real position rather than something to clamp — the same reason `dayToX`
 * takes a signed day and `sprintOf` floors into negative sprints.
 */
export interface DayRange {
  readonly fromDay: number

  /** Exclusive: the first working-day offset **past** the right edge of the viewport. */
  readonly toDay: number
}

/**
 * How many sprints one {@link QuarterBand} spans.
 *
 * A "quarter" here is **a fixed count of sprints counted from the plan's own `startDate`**, not a
 * real calendar quarter. Spec §5 (`docs/superpowers/specs/2026-09-22-macroplan-design.md`) names
 * quarter bands and the `W1–2` ticks they carry, and says nothing about what bounds a band; a
 * `PlanCalendar` carries a `startDate`, a `sprintLengthDays` and a `timezone`, and no notion of a
 * calendar quarter at all. Counting sprints is the choice that keeps this module pure arithmetic
 * over offsets, and it buys two properties a calendar quarter cannot have: every band edge falls
 * on a sprint boundary, so no band ever cuts a tick's label in half, and every band is the same
 * width at a given scale, so the chrome does not breathe as a plan scrolls through February.
 *
 * Six is chosen against the default `sprintLengthDays` of 10 (`macroplan-domain`'s
 * `DEFAULT_SPRINT_LENGTH_DAYS`): six ten-day sprints are twelve weeks, which is a calendar quarter
 * to within a week. At a different sprint length a band is still six sprints and no longer three
 * months, which is exactly why the bands carry an ordinal — `Q1`, `Q2` — and never a month name or
 * a date. Nothing reads `Q3` here as July.
 */
export const SPRINTS_PER_QUARTER = 6

/**
 * One quarter band: which quarter it is, the ordinal it is labelled with, and its geometry.
 *
 * `quarter` is 0-based from the plan's first working day and `label` is `Q${quarter + 1}`, so the
 * plan's opening band is `Q1`. A band before the `startDate` keeps the arithmetic rather than a
 * friendlier fiction — quarter `-1` labels as `Q0` — for the same reason a negative day is a real
 * x: chrome that quietly renumbered itself would put `Q1` in two places.
 *
 * `endDay` is exclusive and `width` is `endDay - startDay` at this scale, with **no `+ 1`**,
 * matching `FeatureBar`. Bands therefore abut exactly: one band's `endDay` is the next one's
 * `startDay`, and no pixel is drawn twice or left bare between them.
 */
export interface QuarterBand {
  readonly quarter: number

  readonly label: string

  readonly startDay: number

  /** Exclusive: the first working-day offset **not** covered by this band. */
  readonly endDay: number

  readonly x: number

  readonly width: number
}

/**
 * One sprint tick inside a band: the sprint it draws for, its `W1–2` label, its geometry, and the
 * two calendar dates a hover may reveal.
 *
 * `label` is derived from `sprint` and `sprintLengthDays` alone — week numbers counted from the
 * plan's own first week, 1-based, as spec §5 writes them: `W1–2`, `W3–4`. A sprint one week long
 * labels as `W1`, not `W1–1`. **No calendar date is ever in the label.** Spec §5: "real calendar
 * dates appear on hover, never as permanent chrome."
 *
 * `from` and `to` are those dates, carried here for Task 14's hover to reveal and for nothing to
 * draw. They come straight from `rangeOfSprint`, so **`to` is inclusive** — it is the sprint's
 * last working day, not the day after it. That is the one inclusive range in the codebase and it
 * is deliberately not mirrored into the offsets beside it: `endDay` is exclusive, and `width` is a
 * full `sprintLengthDays` rather than one day short of it. A band sized from `to - from` would
 * lose the last working day of every sprint, which is why the geometry is computed from the
 * offsets and the dates are only ever passed through.
 */
export interface SprintTick {
  readonly sprint: number

  readonly label: string

  readonly startDay: number

  /** Exclusive: the first working-day offset **not** covered by this tick. */
  readonly endDay: number

  readonly x: number

  readonly width: number

  /** The sprint's first working day, as a calendar date. Hover only; never drawn. */
  readonly from: string

  /** **Inclusive**: the sprint's last working day, as a calendar date. Hover only; never drawn. */
  readonly to: string
}

/**
 * Where today sits on the axis: the plan-zone date it was resolved to, its working-day offset,
 * and its x.
 *
 * `date` is carried for a hover and a label to use, not because the line draws it — spec §5 keeps
 * real dates off the permanent chrome. `day` is signed: a plan that starts next month puts today
 * left of the gutter, which is a true statement about the plan and not a case to clamp.
 */
export interface TodayLine {
  readonly date: string

  readonly day: number

  readonly x: number
}

function labelOf(sprint: number, calendar: PlanCalendar): string {
  const days = calendar.sprintLengthDays
  const first = Math.floor((sprint * days) / WORKING_DAYS_PER_WEEK) + 1
  const last = Math.ceil(((sprint + 1) * days) / WORKING_DAYS_PER_WEEK)
  return first === last ? `W${first}` : `W${first}–${last}`
}

function indicesIn(range: DayRange, indexOf: (day: number) => number): readonly number[] {
  if (range.toDay <= range.fromDay) return []
  const first = indexOf(range.fromDay)
  const count = indexOf(range.toDay - 1) - first + 1
  return Array.from({ length: Math.max(0, count) }, (_, step) => first + step)
}

/**
 * The quarter bands a viewport intersects, left to right.
 *
 * A band is {@link SPRINTS_PER_QUARTER} sprints wide, measured from the plan's first working day;
 * read that constant's note for why a quarter is counted in sprints rather than in months.
 *
 * `range.toDay` is exclusive, so a viewport ending exactly on a band boundary does not pull in the
 * band that boundary opens, and an empty or inverted range yields no bands at all. A band the
 * viewport only partly shows is returned **whole and unclipped**: the range selects which bands
 * exist, and clipping is the renderer's job — an SVG `viewBox` already does it, and a band clipped
 * here would report a `width` that is not the width of a quarter.
 *
 * Pure arithmetic over `sprintLengthDays`. Nothing is read from the plan's zone, no calendar date
 * is computed, and neither argument is mutated.
 */
export function quarterBands(
  plan: PlanCalendar,
  scale: PlanScale,
  range: DayRange,
): readonly QuarterBand[] {
  const span = plan.sprintLengthDays * SPRINTS_PER_QUARTER
  const quarterOf = (day: number): number => Math.floor(sprintOf(day, plan) / SPRINTS_PER_QUARTER)
  return indicesIn(range, quarterOf).map((quarter) => {
    const startDay = quarter * span
    return {
      quarter,
      label: `Q${quarter + 1}`,
      startDay,
      endDay: startDay + span,
      x: dayToX(startDay, scale),
      width: widthOfDays(span, scale),
    }
  })
}

/**
 * The sprint ticks a viewport intersects, left to right, each labelled from its own index.
 *
 * Sprint boundaries come from `sprintOf` in `@repo/schedule` rather than from a division written
 * again here, so a tick and a bar can never disagree about which sprint a day is in — including
 * for a negative day, which `sprintOf` floors into a negative sprint of its own rather than
 * folding onto sprint 0.
 *
 * Every tick is a full `sprintLengthDays` wide and `endDay` is exclusive, so consecutive ticks
 * abut with no gap. `from` and `to` are `rangeOfSprint`'s dates passed through untouched, with
 * `to` **inclusive** — see {@link SprintTick}, which is where that asymmetry is argued.
 *
 * Range semantics and unclipped geometry match {@link quarterBands} exactly, and for the same
 * reasons. Nothing here is written to.
 */
export function sprintTicks(
  plan: PlanCalendar,
  scale: PlanScale,
  range: DayRange,
): readonly SprintTick[] {
  const days = plan.sprintLengthDays
  return indicesIn(range, (day) => sprintOf(day, plan)).map((sprint) => ({
    sprint,
    label: labelOf(sprint, plan),
    startDay: sprint * days,
    endDay: sprint * days + days,
    x: dayToX(sprint * days, scale),
    width: widthOfDays(days, scale),
    ...rangeOfSprint(sprint, plan),
  }))
}

function dateIn(timezone: string, at: Date): string | null {
  try {
    return todayIn(timezone, at)
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/**
 * Where to draw today, from an instant, or `null` for a plan whose zone this runtime cannot
 * resolve.
 *
 * The instant is an argument and there is no default to `new Date()`, because that default is the
 * whole difference between a pure function and one whose output depends on when it ran — and
 * `todayIn` in `@repo/schedule`, the one function in the product that reads a plan's zone at all,
 * already takes a required `Date` for the same reason. A caller reads the clock; this reads the
 * caller.
 *
 * The zone is the plan's own, not the host's. Today is whatever date it is *there*, which is why
 * one instant near midnight answers two different dates for two plans, and why the answer goes
 * through `todayIn` rather than through the host's `Date` accessors.
 *
 * Then `dateToDay`, whose weekend rounding is the load-bearing part: a Saturday, a Sunday and the
 * Monday after them share one offset, so a line drawn at the weekend lands on the **left edge of
 * Monday, where no work has started**. That reads as an off-by-one to anyone who has not been
 * told, and it is the correct answer — there is no offset for a Saturday to occupy, because the
 * axis is working days.
 *
 * ### Why `null`, and why only here
 *
 * A `Timezone` that reached this through `PlanView.parse` was refined against `Intl` by
 * `@repo/contracts`, so it **cannot** make this answer `null` on the runtime that parsed it. The
 * case that remains is a zone one runtime resolves and another does not — a tz database that
 * differs between the Node that wrote the plan and the browser that draws it, or between two
 * deploys — not a value that arrived unvalidated.
 *
 * `todayIn` lets that `RangeError` through, "because a plan silently drawn a day off is worse than
 * a refusal", and this catches it anyway. The two are not in tension: `todayIn` has only two
 * answers available, the right date or a wrong one, and refuses rather than return the wrong one.
 * This has a third — **draw the plan and draw no today line** — which is neither a wrong date nor
 * a lost canvas, and is visible as an absence rather than silent as an error. Every bar, band and
 * tick on the axis is still correct, because none of them reads a zone. Only `RangeError` is
 * caught, and only around the zone lookup; anything else is a defect and is rethrown.
 */
export function todayLine(plan: PlanCalendar, at: Date, scale: PlanScale): TodayLine | null {
  const date = dateIn(plan.timezone, at)
  if (date === null) return null
  const day = dateToDay(date, plan)
  return { date, day, x: dayToX(day, scale) }
}
