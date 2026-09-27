import { describe, expect, it } from 'vitest'
import { DIAMOND_RADIUS, diamondPoints, isMilestone } from './milestones.js'
import type { FeatureBar } from './rails.js'

const bar = (startDay: number, endDay: number, x: number, width: number): FeatureBar => ({
  id: 'feature-1',
  startDay,
  endDay,
  x,
  width,
})

describe('isMilestone reads a milestone off the width the layout already computed', () => {
  it('calls a zero-width bar a milestone, which is a real position taking no time', () => {
    expect(isMilestone(bar(3, 3, 144, 0))).toBe(true)
  })

  it('calls a bar with any width an ordinary feature', () => {
    expect(isMilestone(bar(3, 4, 144, 8))).toBe(false)
  })

  it('reads the width and not the days, so a scale cannot disagree with the answer', () => {
    expect(isMilestone(bar(3, 3, 0, 0))).toBe(true)
  })
})

describe('diamondPoints puts four corners round a centre', () => {
  it('runs clockwise from the top, so the string reads top, right, bottom, left', () => {
    expect(diamondPoints(100, 50, 10)).toBe('100,40 110,50 100,60 90,50')
  })

  it('defaults to the shipped radius, so a caller sizing nothing gets the canvas diamond', () => {
    expect(diamondPoints(100, 50)).toBe(diamondPoints(100, 50, DIAMOND_RADIUS))
  })

  it('stays centred on the point it was given, which is the whole reason it is a polygon', () => {
    const points = diamondPoints(0, 0, 4).split(' ').map((pair) => pair.split(',').map(Number))
    expect(points.map((pair) => pair[0])).toEqual([0, 4, 0, -4])
    expect(points.map((pair) => pair[1])).toEqual([-4, 0, 4, 0])
  })
})
