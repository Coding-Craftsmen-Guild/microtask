import { dateToDay, dayToDate, rangeOfSprint } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import type { DayRange, QuarterBand, SprintTick, TodayLine } from './bands.js'
import { SPRINTS_PER_QUARTER, quarterBands, sprintTicks, todayLine } from './bands.js'
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

const quarters = (bands: readonly QuarterBand[]): readonly number[] =>
  bands.map((band) => band.quarter)

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

  it('labels ticks W1-2 and W3-4 from the sprint index, exactly as spec section 5 writes them', () => {
    expect(labels(sprintTicks(plan, SCALE, range(0, 20)))).toEqual(['W1–2', 'W3–4'])
  })

  it('labels a one-week sprint with a single week number rather than W1-1', () => {
    expect(labels(sprintTicks(weekly, SCALE, range(0, 10)))).toEqual(['W1', 'W2'])
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

  it('labels a sprint before the plan started from the same arithmetic, rather than renumbering it to W1', () => {
    expect(labels(sprintTicks(plan, SCALE, range(-10, 0)))).toEqual(['W-1–0'])
    expect(labels(sprintTicks(daily, SCALE, range(-1, 0)))).toEqual(['W0'])
    expect(labels(sprintTicks(plan, SCALE, range(-10, 10)))).toEqual(['W-1–0', 'W1–2'])
  })

  it('shares a week number between adjacent labels at a length that is not a multiple of five', () => {
    expect(labels(sprintTicks(odd, SCALE, range(0, 21)))).toEqual(['W1–2', 'W2–3', 'W3–5'])
    expect(sprints(sprintTicks(odd, SCALE, range(0, 21)))).toEqual([0, 1, 2])
  })

  it('repeats W1 across five one-day sprints, because five of them fit in the plan first week', () => {
    expect(labels(sprintTicks(daily, SCALE, range(0, 7)))).toEqual([
      'W1', 'W1', 'W1', 'W1', 'W1', 'W2', 'W2',
    ])
  })

  it('keeps every band a full sprintLengthDays wide at the longest length contracts allows', () => {
    const ticks = sprintTicks(longest, SCALE, range(0, 120))
    expect(labels(ticks)).toEqual(['W1–12', 'W13–24'])
    expect(ticks.map((tick) => tick.width)).toEqual([widthOfDays(60, SCALE), widthOfDays(60, SCALE)])
  })
})

describe('quarterBands', () => {
  it('spans SPRINTS_PER_QUARTER sprints, so no band edge ever cuts a sprint tick in half', () => {
    const [first] = quarterBands(plan, SCALE, range(0, 10))
    expect(SPRINTS_PER_QUARTER).toBe(6)
    expect(first?.endDay).toBe(plan.sprintLengthDays * SPRINTS_PER_QUARTER)
    expect(first?.width).toBe(widthOfDays(plan.sprintLengthDays * SPRINTS_PER_QUARTER, SCALE))
  })

  it('starts every band on a sprint boundary a tick also starts on', () => {
    const bands = quarterBands(plan, SCALE, range(0, 200))
    const starts = new Set(sprintTicks(plan, SCALE, range(0, 200)).map((tick) => tick.startDay))
    expect(bands.every((band) => starts.has(band.startDay))).toBe(true)
  })

  it('takes the same DayRange as sprintTicks, with toDay exclusive', () => {
    expect(quarters(quarterBands(plan, SCALE, range(0, 60)))).toEqual([0])
    expect(quarters(quarterBands(plan, SCALE, range(0, 61)))).toEqual([0, 1])
    expect(quarterBands(plan, SCALE, range(4, 4))).toEqual([])
  })

  it('narrows a band with a shorter sprint, because a quarter here is counted in sprints', () => {
    const [first] = quarterBands(weekly, SCALE, range(0, 10))
    expect(first?.endDay).toBe(5 * SPRINTS_PER_QUARTER)
  })

  it('labels bands from the plan start, one based, and carries no calendar date', () => {
    const bands = quarterBands(plan, SCALE, range(0, 130))
    expect(bands.map((band) => band.label)).toEqual(['Q1', 'Q2', 'Q3'])
    expect(bands.map((band) => band.x)).toEqual([dayToX(0, SCALE), dayToX(60, SCALE), dayToX(120, SCALE)])
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
