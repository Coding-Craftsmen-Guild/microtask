import type { PlanCalendar } from './structure.js'

const MS_PER_DAY = 86_400_000
const MONDAY_BEFORE_EPOCH = -3
const WORKING_DAYS_PER_WEEK = 5
const DAYS_PER_WEEK = 7

function toEpochDay(date: string): number {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const dayOfMonth = Number(date.slice(8, 10))
  return Date.UTC(year, month - 1, dayOfMonth) / MS_PER_DAY
}

function toDate(epochDay: number): string {
  const at = new Date(epochDay * MS_PER_DAY)
  const year = String(at.getUTCFullYear()).padStart(4, '0')
  const month = String(at.getUTCMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(at.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${dayOfMonth}`
}

function weekday(epochDay: number): number {
  return new Date(epochDay * MS_PER_DAY).getUTCDay()
}

function firstWorkingDayFrom(epochDay: number): number {
  const day = weekday(epochDay)
  if (day === 0) return epochDay + 1
  if (day === 6) return epochDay + 2
  return epochDay
}

function workingIndex(epochDay: number): number {
  const week = Math.floor((epochDay - MONDAY_BEFORE_EPOCH) / DAYS_PER_WEEK)
  return week * WORKING_DAYS_PER_WEEK + (weekday(epochDay) - 1)
}

function workingEpochDay(index: number): number {
  const week = Math.floor(index / WORKING_DAYS_PER_WEEK)
  const withinWeek = index - week * WORKING_DAYS_PER_WEEK
  return MONDAY_BEFORE_EPOCH + week * DAYS_PER_WEEK + withinWeek
}

function anchorIndex(calendar: PlanCalendar): number {
  return workingIndex(firstWorkingDayFrom(toEpochDay(calendar.startDate)))
}

/** Whether a calendar date is a working day. Saturday and Sunday are not; holidays do not exist. */
export function isWorkingDay(date: string): boolean {
  const day = weekday(toEpochDay(date))
  return day !== 0 && day !== 6
}

/**
 * The calendar date a working-day offset lands on.
 *
 * Day 0 is the plan's `startDate` when that is a working day, and otherwise the next working day.
 * Negative offsets count backwards through working days.
 *
 * Every date in this file is a `(year, month, day)` triple carried as a UTC midnight instant and
 * advanced by whole multiples of 86 400 000 ms. UTC has no offset transitions, so no DST change
 * can widen or narrow a day, and no plan can start on a wall-clock date that its own zone skipped.
 * A plan's `timezone` is therefore read by {@link todayIn} and by nothing else.
 *
 * Five working days are exactly seven calendar days, which makes the conversion a division rather
 * than a walk: offset 2 000 costs what offset 1 costs, and this is called once per feature and per
 * item on every read of a plan.
 */
export function dayToDate(day: number, calendar: PlanCalendar): string {
  return toDate(workingEpochDay(anchorIndex(calendar) + day))
}

/**
 * The working-day offset a calendar date sits at.
 *
 * A weekend date answers the offset of the **next** working day, so a Saturday, a Sunday and the
 * Monday after them share one offset — which is what puts a today line drawn at the weekend on the
 * left edge of Monday, where no work has started.
 *
 * Rounding forward is also what keeps this the exact inverse of {@link dayToDate}: that function
 * only ever yields working days, and a plan's own day 0 is reached through the same rounding, so
 * `dateToDay(dayToDate(d)) === d` for every offset, negative ones included. The other direction
 * cannot hold — three calendar dates share each weekend-adjacent offset, and only one comes back.
 */
export function dateToDay(date: string, calendar: PlanCalendar): number {
  return workingIndex(firstWorkingDayFrom(toEpochDay(date))) - anchorIndex(calendar)
}

/**
 * Today's calendar date in a plan's own zone, from an instant.
 *
 * The one question in the product that needs a zone at all; every other date is already a calendar
 * date. Read through `formatToParts` rather than a formatted string, whose field order and
 * separators are a locale's business and are not fixed across runtimes. `en-US` is passed only to
 * pin the calendar to Gregorian — the parts are reassembled here and the formatting never shown.
 *
 * An unresolvable `timeZone` throws `RangeError` out of `Intl` and is let through rather than
 * falling back to UTC, because a plan silently drawn a day off is worse than a refusal.
 */
export function todayIn(timezone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const field = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value
    if (value === undefined) {
      throw new RangeError(`Intl produced no "${type}" part for timezone "${timezone}"`)
    }
    return value
  }
  return `${field('year').padStart(4, '0')}-${field('month')}-${field('day')}`
}
