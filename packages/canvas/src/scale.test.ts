import { describe, expect, it } from 'vitest'
import { dayToX, scaleFor, widthOfDays, xToDay } from './scale.js'

describe('a PlanScale turns a working-day offset into an x, and back', () => {
  it('places day zero at the left inset, not at x=0, so a rail label has somewhere to sit', () => {
    expect(dayToX(0, scaleFor({ pxPerDay: 8, gutter: 120 }))).toBe(120)
  })

  it('advances by exactly pxPerDay, so a bar of n days is n * pxPerDay wide', () => {
    const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
    expect(dayToX(10, scale) - dayToX(0, scale)).toBe(80)
    expect(widthOfDays(10, scale)).toBe(80)
  })

  it('handles a negative offset, because a today line before startDate is a real position', () => {
    expect(dayToX(-5, scaleFor({ pxPerDay: 8, gutter: 120 }))).toBe(80)
  })

  it('round-trips a day through x and back, so a hover can name the day it is over', () => {
    const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
    for (const day of [-13, -1, 0, 7, 200, 2_000]) expect(xToDay(dayToX(day, scale), scale)).toBe(day)
  })

  it('floors a fractional x rather than rounding, so every pixel of a bar names that bar day', () => {
    const scale = scaleFor({ pxPerDay: 8, gutter: 120 })
    expect(xToDay(dayToX(3, scale) + 7, scale)).toBe(3)
  })
})
