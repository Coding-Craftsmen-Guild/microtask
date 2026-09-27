import { describe, expect, it } from 'vitest'
import type { CanvasSchedule } from './plan.js'
import { bestFit, lastPlannedDay, rangeFor } from './window.js'

const scheduleOf = (spans: readonly { readonly endDay: number }[]): CanvasSchedule => ({
  spans: spans.map((span, index) => ({ id: `f${String(index)}`, startDay: 0, endDay: span.endDay })),
})

const QUERY = { lastDay: 0, sprintLengthDays: 10, pxPerDay: 14, paneWidth: 1120 }

describe('lastPlannedDay reads how far the placed work reaches', () => {
  it('answers the furthest end day, which need not be the last span in the array', () => {
    expect(lastPlannedDay(scheduleOf([{ endDay: 4 }, { endDay: 31 }, { endDay: 12 }]))).toBe(31)
  })

  it('answers zero for a plan with nothing placed, rather than -Infinity from an empty reduce', () => {
    expect(lastPlannedDay(scheduleOf([]))).toBe(0)
  })

  it('never answers negative, so a schedule of day-zero milestones still yields a usable floor', () => {
    expect(lastPlannedDay(scheduleOf([{ endDay: 0 }]))).toBe(0)
  })
})

describe('rangeFor gives a short plan a full pane instead of a corner', () => {
  it('reaches one pane of days when the plan is shorter than the pane', () => {
    expect(rangeFor({ ...QUERY, lastDay: 12 })).toEqual({ fromDay: 0, toDay: 80 })
  })

  it('reaches the plan when the plan is longer, so a long plan overflows and scrolls', () => {
    expect(rangeFor({ ...QUERY, lastDay: 200 })).toEqual({ fromDay: 0, toDay: 210 })
  })

  it('always starts at day zero, since panning is not what this is', () => {
    expect(rangeFor({ ...QUERY, lastDay: 400 }).fromDay).toBe(0)
  })
})

describe('rangeFor pads the plan out to a whole sprint', () => {
  it('adds a spare sprint past the end, so the last bar is not flush against the edge', () => {
    expect(rangeFor({ ...QUERY, lastDay: 200, sprintLengthDays: 10 }).toDay).toBe(210)
  })

  it('lands on a sprint boundary whatever day the work ends on', () => {
    for (const lastDay of [1, 7, 12, 99, 194, 200]) {
      const { toDay } = rangeFor({ ...QUERY, lastDay, pxPerDay: 400 })
      expect(toDay % 10).toBe(0)
      expect(toDay).toBeGreaterThan(lastDay)
    }
  })

  it('honours a plan whose sprint is not ten days', () => {
    expect(rangeFor({ ...QUERY, lastDay: 100, sprintLengthDays: 14, pxPerDay: 400 }).toDay).toBe(126)
  })

  it('survives a sprint length of zero rather than dividing by it', () => {
    expect(rangeFor({ ...QUERY, lastDay: 30, sprintLengthDays: 0 }).toDay).toBeGreaterThan(30)
  })
})

describe('rangeFor scales the floor with the zoom, which is the whole point of a zoom', () => {
  it('wants fewer days at a coarser scale and more at a finer one', () => {
    const coarse = rangeFor({ ...QUERY, pxPerDay: 4 }).toDay
    const fine = rangeFor({ ...QUERY, pxPerDay: 42 }).toDay
    expect(coarse).toBeGreaterThan(fine)
  })

  it('asks for about one pane of pixels at each scale, which is why the canvas fills it', () => {
    for (const pxPerDay of [4, 14, 42]) {
      const { toDay } = rangeFor({ ...QUERY, pxPerDay })
      expect(toDay * pxPerDay).toBeGreaterThanOrEqual(QUERY.paneWidth)
    }
  })

  it('survives a pane of width zero rather than answering Infinity days', () => {
    expect(Number.isFinite(rangeFor({ ...QUERY, paneWidth: 0 }).toDay)).toBe(true)
  })
})

describe('bestFit opens a plan at the finest scale that nearly fits the pane', () => {
  const OFFERS = [
    { rung: 'item', pxPerDay: 42 },
    { rung: 'feature', pxPerDay: 14 },
    { rung: 'epic', pxPerDay: 4 },
  ]

  const fitFor = (lastDay: number) =>
    bestFit(OFFERS, { lastDay, sprintLengthDays: 10, paneWidth: 1040 })?.rung

  it('opens a short plan at the finest scale, where a bar is wide enough to carry its name', () => {
    expect(fitFor(16)).toBe('item')
  })

  it('steps out to the middle scale for a plan a sprint view could not hold', () => {
    expect(fitFor(90)).toBe('feature')
  })

  it('steps out again for a plan of several quarters', () => {
    expect(fitFor(400)).toBe('epic')
  })

  it('falls back to the coarsest offer for a plan longer than any of them shows', () => {
    expect(fitFor(20000)).toBe('epic')
  })

  it('opens an empty plan at the finest scale rather than at a year of nothing', () => {
    expect(fitFor(0)).toBe('item')
  })

  it('answers null for no offers at all, rather than inventing a scale', () => {
    expect(bestFit([], { lastDay: 10, sprintLengthDays: 10, paneWidth: 1040 })).toBeNull()
  })

  it('honours the caller’s order, the first tolerable offer winning', () => {
    const reversed = [...OFFERS].reverse()
    expect(bestFit(reversed, { lastDay: 16, sprintLengthDays: 10, paneWidth: 1040 })?.rung).toBe('epic')
  })
})

describe('rangeFor reaches today, so the marker is never drawn off the canvas', () => {
  it('extends past the last bar to cover a today that comes after it', () => {
    const { toDay } = rangeFor({ ...QUERY, lastDay: 20, todayDay: 200, pxPerDay: 400 })
    expect(toDay).toBeGreaterThan(200)
  })

  it('leaves the axis alone for a today already inside it', () => {
    const wide = rangeFor({ ...QUERY, lastDay: 200, todayDay: 10, pxPerDay: 400 })
    const without = rangeFor({ ...QUERY, lastDay: 200, pxPerDay: 400 })
    expect(wide).toEqual(without)
  })

  // Day zero is the plan's first day by construction, so a plan that has not started has no "now" to
  // mark inside it and the axis stays where the work is.
  it('ignores a today before the plan’s own start rather than growing backwards', () => {
    const early = rangeFor({ ...QUERY, lastDay: 40, todayDay: -90, pxPerDay: 400 })
    expect(early.fromDay).toBe(0)
    expect(early).toEqual(rangeFor({ ...QUERY, lastDay: 40, pxPerDay: 400 }))
  })

  it('still lands on a sprint boundary once it has stretched to reach today', () => {
    expect(rangeFor({ ...QUERY, lastDay: 5, todayDay: 173, pxPerDay: 400 }).toDay % 10).toBe(0)
  })
})
