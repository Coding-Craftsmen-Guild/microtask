import { dateToDay, dayToDate, isoWeek, rangeOfSprint, sprintOf, todayIn } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { dayToX, widthOfDays } from './scale.js'
import type { PlanScale } from './scale.js'

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

/** Which quarter of a year a band is, 1 through 4. */
export type Quarter = 1 | 2 | 3 | 4

/**
 * One calendar quarter band: the year and quarter it names, and its geometry.
 *
 * ### Why a band is a real quarter and not a count of sprints
 *
 * It was a count: six sprints measured from the plan's own `startDate`, labelled `Q${n + 1}`. That
 * kept this module pure arithmetic over offsets and bought two properties — every band edge fell on
 * a sprint boundary, and every band was the same width at a given scale.
 *
 * Both were paid for in the only currency the header has. A plan starting in late September drew
 * `Q1` over October and ran out at `Q5`, and there is no year in which `Q5` is a quarter of
 * anything. This row's whole job is to tell a reader *when*, and it was answering in a unit only the
 * plan knew. So the band is now the quarter a calendar would call it, and it carries its `year`
 * because `Q1` alone cannot distinguish two of them.
 *
 * What that costs is stated rather than hidden. A band edge no longer lands on a sprint boundary —
 * the ticks are a separate row and are not cut by one, so nothing is drawn through a label — and
 * bands are no longer equal width, because quarters genuinely hold different numbers of working
 * days. The chrome breathing through February is the calendar being told the truth.
 *
 * `endDay` is exclusive and `width` is `endDay - startDay` at this scale, with **no `+ 1`**,
 * matching `FeatureBar`. Bands therefore abut exactly: one band's `endDay` is the next one's
 * `startDay`, and no pixel is drawn twice or left bare between them.
 */
export interface CalendarBand {
  readonly year: number

  readonly quarter: Quarter

  /** `Q4 2026`. The year is in the label because four ordinals cannot name a multi-year axis. */
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
 * `label` names the **ISO weeks** the sprint's own first and last working days fall in: `W40–41`,
 * `W42–43`. A sprint inside one week labels as `W40`, not `W40–40`. **No calendar date is ever in
 * the label.** Spec §5: "real calendar dates appear on hover, never as permanent chrome" — and a
 * week number is not a date.
 *
 * ### Why the weeks are the calendar's and not the plan's
 *
 * They were the plan's: `Math.floor(sprint * days / 5) + 1`, counting from the plan's own first
 * week. That made `W1` the plan's opening week, which read fine until {@link CalendarBand} started
 * naming real quarters above it — and then one header had `W1` sitting under `Q4 2026`, two rows
 * answering in two different calendars. The ticks moved rather than the bands, because a reader
 * matching this page against anything else they own is matching it against a calendar.
 *
 * A `sprintLengthDays` that is not a multiple of five makes **adjacent labels share a week number**,
 * and that is arithmetic rather than a rounding bug: a sprint boundary falls mid-week and the week
 * it falls in is genuinely part of both sprints. At 1, five consecutive ticks share one week — five
 * one-day sprints inside one week, each a distinct tick with distinct geometry. `@repo/contracts`
 * allows any `int().min(1).max(60)`, so every one of these is reachable through the API and none is
 * special cased; a label names the weeks a sprint touches, and nothing more.
 *
 * A **negative** sprint labels from its own dates like any other, so a sprint before a plan that
 * starts in January reads `W52–1` — the last week of the old year into the first of the new. That
 * is a correct label rather than an overflow to clamp, and it is the case the plan-relative form got
 * visibly wrong: it printed `W-1–0`, which is not a week.
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
  const first = isoWeek(dayToDate(sprint * days, calendar)).week
  const last = isoWeek(dayToDate(sprint * days + days - 1, calendar)).week
  return first === last ? `W${first}` : `W${first}–${last}`
}

function indicesIn(range: DayRange, indexOf: (day: number) => number): readonly number[] {
  if (range.toDay <= range.fromDay) return []
  const first = indexOf(range.fromDay)
  const count = indexOf(range.toDay - 1) - first + 1
  return Array.from({ length: count }, (_, step) => first + step)
}

const MONTHS_PER_QUARTER = 3

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

const quarterOfMonth = (month: number): Quarter => {
  if (month <= MONTHS_PER_QUARTER) return 1
  if (month <= MONTHS_PER_QUARTER * 2) return 2
  if (month <= MONTHS_PER_QUARTER * 3) return 3
  return 4
}

interface Named {
  readonly year: number
  readonly quarter: Quarter
}

const named = (date: string): Named => ({
  year: Number(date.slice(0, 4)),
  quarter: quarterOfMonth(Number(date.slice(5, 7))),
})

const opensOn = (at: Named): string =>
  `${pad(at.year, 4)}-${pad((at.quarter - 1) * MONTHS_PER_QUARTER + 1, 2)}-01`

const NEXT: Readonly<Record<Quarter, Quarter>> = { 1: 2, 2: 3, 3: 4, 4: 1 }

const after = (at: Named): Named =>
  at.quarter === 4
    ? { year: at.year + 1, quarter: NEXT[at.quarter] }
    : { year: at.year, quarter: NEXT[at.quarter] }

/**
 * The calendar quarters a viewport intersects, left to right.
 *
 * ### How a quarter becomes a run of working-day offsets
 *
 * Each band's edges are found by naming the quarter's **first calendar date** — `2026-04-01` for Q2
 * 2026 — and asking `dateToDay` for its offset. That function rounds a weekend date forward to the
 * next working day, which is exactly the answer wanted here: when a quarter opens on a Saturday, its
 * first *working* day is the Monday, and so is the offset. The same call made for the **next**
 * quarter's opening date is this band's exclusive `endDay`, so one band ends on the offset the next
 * begins on and the two abut with nothing between them.
 *
 * It is a walk over bands and not over days. A viewport holding a year is four calls to
 * `dateToDay` and not two hundred and sixty, because the band's extent is derived from its own
 * dates rather than discovered by scanning for where the quarter changes.
 *
 * ### Range semantics, which are {@link sprintTicks}'s
 *
 * `range.toDay` is exclusive, so a viewport ending exactly on a band boundary does not pull in the
 * band that boundary opens, and an empty or inverted range yields no bands at all. A band the
 * viewport only partly shows is returned **whole and unclipped** — the walk begins at the quarter
 * holding `fromDay` and takes that quarter's own start, not the viewport's — because the range
 * selects which bands exist and clipping is the renderer's job. A band clipped here would report a
 * `width` that is not the width of a quarter.
 *
 * As with the ticks, a renderer must clamp a partly-visible band's **label** into the viewport
 * rather than clamp the band; `components/plan/board/time-header.tsx` draws these as HTML boxes and
 * lets `overflow-hidden` do it.
 *
 * ### What it does not read
 *
 * `sprintLengthDays`. A calendar quarter is no count of sprints, so two plans differing only in
 * sprint length draw identical bands — which `bands.test.ts` pins, because the previous definition
 * of this function was exactly the opposite and the two are easy to confuse by eye.
 *
 * Nothing is read from the plan's zone and neither argument is mutated.
 */
export function calendarBands(
  plan: PlanCalendar,
  scale: PlanScale,
  range: DayRange,
): readonly CalendarBand[] {
  if (range.toDay <= range.fromDay) return []
  const bands: CalendarBand[] = []
  let at = named(dayToDate(range.fromDay, plan))
  let startDay = dateToDay(opensOn(at), plan)
  while (startDay < range.toDay) {
    const endDay = dateToDay(opensOn(after(at)), plan)
    bands.push({
      year: at.year,
      quarter: at.quarter,
      label: `Q${at.quarter} ${pad(at.year, 4)}`,
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

function resolvesZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

function dateIn(timezone: string, at: Date): string | null {
  if (Number.isNaN(at.getTime())) {
    throw new RangeError('todayLine was given an invalid instant')
  }
  return resolvesZone(timezone) ? todayIn(timezone, at) : null
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
 * ### `null` means one thing: this runtime cannot resolve the plan's zone
 *
 * Nothing else. An unresolvable `timezone` is probed for **before** the instant is read, with the
 * same `new Intl.DateTimeFormat('en-US', { timeZone })` that `@repo/contracts` refines `Timezone`
 * with, and that probe is the only thing inside the only `try`. So a caller who lost the today line
 * can act on one diagnosis rather than three.
 *
 * A `Timezone` that reached this through `PlanView.parse` was refined against `Intl` by that same
 * probe, so it **cannot** make this answer `null` on the runtime that parsed it. The case that
 * remains is a zone one runtime resolves and another does not — a tz database that differs between
 * the Node that wrote the plan and the browser that draws it, or between two deploys — not a value
 * that arrived unvalidated.
 *
 * `todayIn` lets that `RangeError` through, "because a plan silently drawn a day off is worse than
 * a refusal", and this returns `null` instead. The two are not in tension: `todayIn` has only two
 * answers available, the right date or a wrong one, and refuses rather than return the wrong one.
 * This has a third — **draw the plan and draw no today line** — which is neither a wrong date nor
 * a lost canvas, and is visible as an absence rather than silent as an error. Every bar, band and
 * tick on the axis is still correct, because none of them reads a zone.
 *
 * ### What throws instead
 *
 * An **invalid instant** — `new Date('oops')`, or the `undefined` an untyped caller can still get
 * past the signature. It throws a `RangeError` naming this function, and it is checked first, so a
 * defect beats a graceful degradation when a call is wrong in both ways at once. Widening `null` to
 * cover it would be the exact failure this whole note exists to prevent: an absent today line read
 * as a tz-database mismatch when the real cause was a bad clock read, which no deploy will fix.
 * `Date.prototype.toISOString` and `Intl`'s own `formatToParts` both answer a bad instant with a
 * `RangeError`, so this is their convention and not a new one.
 *
 * And `todayIn`'s own hand-thrown `RangeError` for an `Intl` that resolved the zone but produced no
 * date part. That is a defect in a runtime, not a plan a UI should quietly draw half of, and it now
 * propagates — the earlier form of this function caught it, because its `try` wrapped the whole
 * call rather than the zone probe.
 */
export function todayLine(plan: PlanCalendar, at: Date, scale: PlanScale): TodayLine | null {
  const date = dateIn(plan.timezone, at)
  if (date === null) return null
  const day = dateToDay(date, plan)
  return { date, day, x: dayToX(day, scale) }
}
