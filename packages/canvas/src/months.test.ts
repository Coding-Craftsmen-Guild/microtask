import { dateToDay, dayToDate } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { calendarBands } from './bands.js'
import type { DayRange } from './bands.js'
import type { MonthBand } from './months.js'
import { monthBands } from './months.js'
import { dayToX, scaleFor, widthOfDays } from './scale.js'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const plan: PlanCalendar = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'Europe/Belgrade',
}

const weekly: PlanCalendar = { ...plan, sprintLengthDays: 5 }

const range = (fromDay: number, toDay: number): DayRange => ({ fromDay, toDay })

const names = (bands: readonly MonthBand[]): readonly string[] => bands.map((band) => band.label)

/** The month a date is in, read off the date rather than from the function under test. */
const monthOfDate = (date: string): number => Number(date.slice(5, 7))

describe('monthBands', () => {
  it('names the real calendar month each band is in, left to right', () => {
    expect(names(monthBands(plan, SCALE, range(0, 130)))).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
    ])
  })

  it('carries the year, so two Januaries on one axis are distinguishable to a caller', () => {
    const bands = monthBands(plan, SCALE, range(0, 300))
    expect(bands.at(0)?.year).toBe(2026)
    expect(bands.at(-1)?.year).toBe(2027)
  })

  it('opens every quarter on a month boundary, which is the whole reason this exists', () => {
    const wide = range(-40, 420)
    const opens = new Set(monthBands(plan, SCALE, wide).map((band) => band.startDay))
    const quarters = calendarBands(plan, SCALE, wide)
    expect(quarters.length).toBeGreaterThan(4)
    for (const quarter of quarters.slice(1)) {
      expect(opens.has(quarter.startDay)).toBe(true)
    }
  })

  it('leaves only the leading band able to open before the range, which is why the above skips it', () => {
    const wide = range(-40, 420)
    const [firstMonth] = monthBands(plan, SCALE, wide)
    const [firstQuarter] = calendarBands(plan, SCALE, wide)
    expect(firstQuarter?.startDay).toBeLessThan(firstMonth?.startDay ?? 0)
    for (const band of monthBands(plan, SCALE, wide).slice(1)) {
      expect(band.startDay).toBeGreaterThan(wide.fromDay)
    }
  })

  it('draws three months to a quarter, no quarter being covered by two bands or four', () => {
    const wide = range(0, 300)
    const quarters = calendarBands(plan, SCALE, wide)
    for (const quarter of quarters.slice(0, -1)) {
      const inside = monthBands(plan, SCALE, wide).filter(
        (band) => band.startDay >= quarter.startDay && band.startDay < quarter.endDay,
      )
      expect(inside).toHaveLength(3)
    }
  })

  it('agrees with the calendar about which month every band opens and closes in', () => {
    for (const band of monthBands(plan, SCALE, range(0, 300))) {
      expect(monthOfDate(dayToDate(band.startDay, plan))).toBe(band.month)
      expect(monthOfDate(dayToDate(band.endDay - 1, plan))).toBe(band.month)
    }
  })

  it('abuts exactly: one band endDay is the next band startDay, with no pixel drawn twice', () => {
    const bands = monthBands(plan, SCALE, range(0, 300))
    for (const [index, band] of bands.slice(0, -1).entries()) {
      expect(bands[index + 1]?.startDay).toBe(band.endDay)
      expect(bands[index + 1]?.x).toBe(band.x + band.width)
    }
  })

  it('places and sizes each band from its own days, at the scale it was given', () => {
    for (const band of monthBands(plan, SCALE, range(0, 300))) {
      expect(band.x).toBe(dayToX(band.startDay, SCALE))
      expect(band.width).toBe(widthOfDays(band.endDay - band.startDay, SCALE))
    }
  })

  it('takes the same DayRange as the bands beside it, with toDay exclusive and an empty one empty', () => {
    expect(names(monthBands(plan, SCALE, range(0, 20)))).toEqual(['Jan'])
    expect(names(monthBands(plan, SCALE, range(0, 21)))).toEqual(['Jan', 'Feb'])
    expect(monthBands(plan, SCALE, range(4, 4))).toEqual([])
    expect(monthBands(plan, SCALE, range(7, 3))).toEqual([])
  })

  it('returns a band the viewport only partly shows whole and unclipped, as the quarters are', () => {
    const [first] = monthBands(plan, SCALE, range(5, 15))
    expect(first?.label).toBe('Jan')
    expect(first?.startDay).toBe(dateToDay('2026-01-01', plan))
    expect(first?.x).toBe(dayToX(first?.startDay ?? 0, SCALE))
  })

  it('is not told anything by the sprint length, a calendar month being no count of sprints', () => {
    expect(monthBands(weekly, SCALE, range(0, 130))).toEqual(monthBands(plan, SCALE, range(0, 130)))
  })

  it('bands days before the plan started by their own calendar month, not by a renumbering', () => {
    const [first] = monthBands(plan, SCALE, range(-10, -9))
    expect(first?.label).toBe('Dec')
    expect(first?.year).toBe(2025)
    expect(first?.month).toBe(12)
  })
})
