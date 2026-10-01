import { dateToDay, dayToDate, rangeOfSprint } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import type { CalendarBand, DayRange, SprintTick, TodayLine } from './bands.js'
import { calendarBands, sprintTicks, todayLine } from './bands.js'
import type { PlanScale } from './scale.js'
import { dayToX, scaleFor, widthOfDays } from './scale.js'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const plan: PlanCalendar = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'Europe/Belgrade',
}

const weekly: PlanCalendar = { ...plan, sprintLengthDays: 5 }

const odd: PlanCalendar = { ...plan, sprintLengthDays: 7 }

const daily: PlanCalendar = { ...plan, sprintLengthDays: 1 }

const longest: PlanCalendar = { ...plan, sprintLengthDays: 60 }

const range = (fromDay: number, toDay: number): DayRange => ({ fromDay, toDay })

const labels = (ticks: readonly SprintTick[]): readonly string[] => ticks.map((tick) => tick.label)

const sprints = (ticks: readonly SprintTick[]): readonly number[] => ticks.map((tick) => tick.sprint)

const marks = (bands: readonly CalendarBand[]): readonly string[] => bands.map((band) => band.label)

/** The quarter a date is in, worked out from its month rather than from the function under test. */
const quarterOfDate = (date: string): number => Math.ceil(Number(date.slice(5, 7)) / 3)

describe('sprintTicks', () => {
  it('draws a sprint band a full sprintLengthDays wide, because rangeOfSprint to is inclusive', () => {
    const [first] = sprintTicks(plan, SCALE, { fromDay: 0, toDay: 20 })
    expect(first?.width).toBe(widthOfDays(plan.sprintLengthDays, SCALE))
  })

  it('covers the inclusive last working day rangeOfSprint names, rather than stopping a day short', () => {
    const [first] = sprintTicks(plan, SCALE, range(0, 20))
    const { to } = rangeOfSprint(0, plan)
    expect(first?.endDay).toBe(dateToDay(to, plan) + 1)
    expect(dayToDate(plan.sprintLengthDays - 1, plan)).toBe(to)
  })

  it('treats toDay as exclusive: day 20 opens sprint 2 and is not in a 0..20 viewport', () => {
    expect(sprints(sprintTicks(plan, SCALE, range(0, 20)))).toEqual([0, 1])
    expect(sprints(sprintTicks(plan, SCALE, range(0, 21)))).toEqual([0, 1, 2])
  })

  it('returns nothing for an empty range, where toDay is not past fromDay', () => {
    expect(sprintTicks(plan, SCALE, range(7, 7))).toEqual([])
    expect(sprintTicks(plan, SCALE, range(7, 3))).toEqual([])
  })

  it('returns a sprint the viewport only partly shows, with its own unclipped geometry', () => {
    const ticks = sprintTicks(plan, SCALE, range(5, 15))
    expect(sprints(ticks)).toEqual([0, 1])
    expect(ticks[0]?.x).toBe(dayToX(0, SCALE))
    expect(ticks[0]?.width).toBe(widthOfDays(10, SCALE))
  })

  it('places each band at its own start day, so bands abut with no gap and no overlap', () => {
    const ticks = sprintTicks(plan, SCALE, range(0, 30))
    expect(ticks.map((tick) => tick.x)).toEqual([dayToX(0, SCALE), dayToX(10, SCALE), dayToX(20, SCALE)])
    expect(ticks.map((tick) => tick.startDay)).toEqual([0, 10, 20])
    expect(ticks.map((tick) => tick.endDay)).toEqual([10, 20, 30])
  })

  it('labels ticks with the ISO weeks they fall in, so the header reads as a calendar', () => {
    expect(labels(sprintTicks(plan, SCALE, range(0, 20)))).toEqual(['W2–3', 'W4–5'])
  })

  it('labels a one-week sprint with a single week number rather than W1-1', () => {
    expect(labels(sprintTicks(weekly, SCALE, range(0, 10)))).toEqual(['W2', 'W3'])
  })

  it('never puts a calendar date in a label, because dates are hover only and never permanent chrome', () => {
    const drawn = labels(sprintTicks(plan, SCALE, range(0, 60))).join(' ')
    expect(drawn).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(drawn).not.toMatch(/2026/)
  })

  it('carries the sprint dates rangeOfSprint gives, for a hover to reveal and nothing to draw', () => {
    const [first, second] = sprintTicks(plan, SCALE, range(0, 20))
    expect({ from: first?.from, to: first?.to }).toEqual(rangeOfSprint(0, plan))
    expect({ from: second?.from, to: second?.to }).toEqual(rangeOfSprint(1, plan))
    expect(first?.to).toBe('2026-01-16')
  })

  it('draws a sprint before the plan started, left of the gutter, rather than folding it onto sprint 0', () => {
    const ticks = sprintTicks(plan, SCALE, range(-10, 0))
    expect(sprints(ticks)).toEqual([-1])
    expect(ticks[0]?.x).toBe(dayToX(-10, SCALE))
    expect(ticks[0]?.x).toBeLessThan(SCALE.gutter)
  })

  it('labels a sprint before the plan started by its own calendar weeks, crossing the new year', () => {
    expect(labels(sprintTicks(plan, SCALE, range(-10, 0)))).toEqual(['W52–1'])
    expect(labels(sprintTicks(daily, SCALE, range(-1, 0)))).toEqual(['W1'])
    expect(labels(sprintTicks(plan, SCALE, range(-10, 10)))).toEqual(['W52–1', 'W2–3'])
  })

  it('shares a week number between adjacent labels at a length that is not a multiple of five', () => {
    expect(labels(sprintTicks(odd, SCALE, range(0, 21)))).toEqual(['W2–3', 'W3–4', 'W4–6'])
    expect(sprints(sprintTicks(odd, SCALE, range(0, 21)))).toEqual([0, 1, 2])
  })

  it('repeats one week across five one-day sprints, because five of them fit in that week', () => {
    expect(labels(sprintTicks(daily, SCALE, range(0, 7)))).toEqual([
      'W2', 'W2', 'W2', 'W2', 'W2', 'W3', 'W3',
    ])
  })

  it('keeps every band a full sprintLengthDays wide at the longest length contracts allows', () => {
    const ticks = sprintTicks(longest, SCALE, range(0, 120))
    expect(labels(ticks)).toEqual(['W2–13', 'W14–25'])
    expect(ticks.map((tick) => tick.width)).toEqual([widthOfDays(60, SCALE), widthOfDays(60, SCALE)])
  })
})

describe('calendarBands', () => {
  it('names the real year quarter each band is in, so no band is labelled Q5', () => {
    expect(marks(calendarBands(plan, SCALE, range(0, 130)))).toEqual([
      'Q1 2026',
      'Q2 2026',
      'Q3 2026',
    ])
  })

  it('carries on into the next year rather than counting a fifth quarter', () => {
    const bands = calendarBands(plan, SCALE, range(0, 300))
    expect(marks(bands).slice(-2)).toEqual(['Q4 2026', 'Q1 2027'])
    expect(bands.at(-1)?.year).toBe(2027)
    expect(bands.at(-1)?.quarter).toBe(1)
  })

  it('agrees with the calendar about which quarter every band opens and closes in', () => {
    for (const band of calendarBands(plan, SCALE, range(0, 300))) {
      expect(quarterOfDate(dayToDate(band.startDay, plan))).toBe(band.quarter)
      expect(quarterOfDate(dayToDate(band.endDay - 1, plan))).toBe(band.quarter)
    }
  })

  it('puts the day before a band in the previous quarter, so no working day is in two bands', () => {
    const bands = calendarBands(plan, SCALE, range(0, 300))
    for (const band of bands.slice(1)) {
      expect(quarterOfDate(dayToDate(band.startDay - 1, plan))).not.toBe(band.quarter)
    }
  })

  it('abuts exactly: one band endDay is the next band startDay, with no pixel drawn twice', () => {
    const bands = calendarBands(plan, SCALE, range(0, 300))
    for (const [index, band] of bands.slice(0, -1).entries()) {
      expect(bands[index + 1]?.startDay).toBe(band.endDay)
      expect(bands[index + 1]?.x).toBe(band.x + band.width)
    }
  })

  it('places and sizes each band from its own days, at the scale it was given', () => {
    for (const band of calendarBands(plan, SCALE, range(0, 300))) {
      expect(band.x).toBe(dayToX(band.startDay, SCALE))
      expect(band.width).toBe(widthOfDays(band.endDay - band.startDay, SCALE))
    }
  })

  it('draws bands of different widths, because quarters hold different numbers of working days', () => {
    const widths = new Set(calendarBands(plan, SCALE, range(0, 300)).map((band) => band.width))
    expect(widths.size).toBeGreaterThan(1)
  })

  it('takes the same DayRange as sprintTicks, with toDay exclusive and an empty one empty', () => {
    expect(marks(calendarBands(plan, SCALE, range(0, 62)))).toEqual(['Q1 2026'])
    expect(marks(calendarBands(plan, SCALE, range(0, 63)))).toEqual(['Q1 2026', 'Q2 2026'])
    expect(calendarBands(plan, SCALE, range(4, 4))).toEqual([])
    expect(calendarBands(plan, SCALE, range(7, 3))).toEqual([])
  })

  it('returns a band the viewport only partly shows whole and unclipped, as the ticks are', () => {
    const [first] = calendarBands(plan, SCALE, range(5, 15))
    expect(first?.label).toBe('Q1 2026')
    expect(first?.startDay).toBe(dateToDay('2026-01-01', plan))
    expect(first?.x).toBe(dayToX(first?.startDay ?? 0, SCALE))
  })

  it('opens the plan first band before day zero, when the quarter started before the plan did', () => {
    const [first] = calendarBands(plan, SCALE, range(0, 10))
    expect(first?.startDay).toBe(-2)
    expect(first?.x).toBeLessThan(dayToX(0, SCALE))
  })

  it('is not told anything by the sprint length, a calendar quarter being no count of sprints', () => {
    expect(calendarBands(weekly, SCALE, range(0, 130))).toEqual(
      calendarBands(plan, SCALE, range(0, 130)),
    )
  })

  it('bands days before the plan started by their own calendar quarter, not by a renumbering', () => {
    const [first] = calendarBands(plan, SCALE, range(-10, -9))
    expect(first?.label).toBe('Q4 2025')
    expect(first?.year).toBe(2025)
  })
})

describe('todayLine', () => {
  const noon = (date: string): Date => new Date(`${date}T12:00:00Z`)

  it('places today at its own working-day offset, from the instant it is given', () => {
    const line = todayLine(plan, noon('2026-01-07'), SCALE)
    expect(line).toEqual<TodayLine>({ date: '2026-01-07', day: 2, x: dayToX(2, SCALE) })
  })

  it('puts a weekend today on the left edge of Monday, because dateToDay rounds a weekend forward', () => {
    const saturday = todayLine(plan, noon('2026-01-10'), SCALE)
    const sunday = todayLine(plan, noon('2026-01-11'), SCALE)
    const monday = todayLine(plan, noon('2026-01-12'), SCALE)
    expect([saturday?.day, sunday?.day, monday?.day]).toEqual([5, 5, 5])
    expect([saturday?.x, sunday?.x]).toEqual([dayToX(5, SCALE), dayToX(5, SCALE)])
    expect(saturday?.date).toBe('2026-01-10')
  })

  it('answers a negative offset left of the gutter for a today before the plan started', () => {
    const line = todayLine(plan, noon('2025-12-29'), SCALE)
    expect(line?.day).toBe(-5)
    expect(line?.x).toBeLessThan(SCALE.gutter)
  })

  it('reads the plan zone, not the host zone: one instant is two dates in two zones', () => {
    const at = new Date('2026-01-07T23:30:00Z')
    expect(todayLine(plan, at, SCALE)?.date).toBe('2026-01-08')
    expect(todayLine({ ...plan, timezone: 'America/Los_Angeles' }, at, SCALE)?.date).toBe('2026-01-07')
  })

  it('is pure: the same instant twice gives the same line, and no argument is written to', () => {
    const at = noon('2026-02-02')
    const before = JSON.stringify(plan)
    expect(todayLine(plan, at, SCALE)).toEqual(todayLine(plan, at, SCALE))
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('answers null for a zone this runtime cannot resolve, where todayIn would throw', () => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: 'Mars/Olympus_Mons' })).toThrow(RangeError)
    expect(todayLine({ ...plan, timezone: 'Mars/Olympus_Mons' }, noon('2026-01-07'), SCALE)).toBeNull()
  })

  it('answers a line for every zone this runtime can resolve, over a spread of offsets', () => {
    const at = noon('2026-01-07')
    for (const timezone of ['UTC', 'Europe/Belgrade', 'America/Los_Angeles', 'Asia/Kolkata']) {
      expect(todayLine({ ...plan, timezone }, at, SCALE)).not.toBeNull()
    }
  })

  it('throws on an invalid instant rather than answering null, so null names the zone and nothing else', () => {
    expect(() => new Date('oops').toISOString()).toThrow(RangeError)
    expect(() => todayLine(plan, new Date('oops'), SCALE)).toThrow(RangeError)
    expect(() => todayLine(plan, new Date(Number.NaN), SCALE)).toThrow(/invalid instant/)
  })

  it('checks the instant before the zone, so a call wrong in both ways throws rather than nulls', () => {
    const wrongBoth = (): TodayLine | null =>
      todayLine({ ...plan, timezone: 'Mars/Olympus_Mons' }, new Date('oops'), SCALE)
    expect(wrongBoth).toThrow(/invalid instant/)
  })

  it('rejects an absent instant loudly, which is what an untyped caller can still reach todayIn with', () => {
    const untyped = todayLine as (plan: PlanCalendar, at?: Date, scale?: PlanScale) => TodayLine | null
    expect(() => untyped(plan)).toThrow()
  })
})
