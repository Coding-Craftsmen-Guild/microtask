import { describe, expect, it } from 'vitest'
import { SPRINTS_PER_QUARTER } from './bands.js'
import type { Rung } from './rungs.js'
import { FEATURE_RUNG_MIN_PX_PER_DAY, ITEM_RUNG_MIN_PX_PER_DAY, rungFor } from './rungs.js'
import { scaleFor } from './scale.js'

const SPRINT_DAYS = 10
const WORKING_DAYS_PER_YEAR = 260
const WIDTH = 900

const at = (pxPerDay: number): Rung => rungFor(scaleFor({ pxPerDay, gutter: 120 }))

const showing = (days: number): Rung => at(Math.round(WIDTH / days))

describe('rungFor derives the detail level from the scale, as spec §5 requires', () => {
  it('puts §5\'s "~1–2 sprints" view on the item rung, at both ends of that row', () => {
    expect(showing(SPRINT_DAYS)).toBe('item')
    expect(showing(2 * SPRINT_DAYS)).toBe('item')
  })

  it('puts §5\'s "~1 quarter" view on the feature rung', () => {
    expect(showing(SPRINTS_PER_QUARTER * SPRINT_DAYS)).toBe('feature')
  })

  it('puts §5\'s "~1–2 years" view on the epic rung, at both ends of that row', () => {
    expect(showing(WORKING_DAYS_PER_YEAR)).toBe('epic')
    expect(showing(2 * WORKING_DAYS_PER_YEAR)).toBe('epic')
  })

  it('reaches the item rung at exactly 45px per day, which is 900px over two ten-day sprints', () => {
    expect(ITEM_RUNG_MIN_PX_PER_DAY).toBe(45)
    expect(ITEM_RUNG_MIN_PX_PER_DAY * 2 * SPRINT_DAYS).toBe(WIDTH)
  })

  it('reaches the feature rung at exactly 15px per day, which is 900px over a quarter of sprints', () => {
    expect(FEATURE_RUNG_MIN_PX_PER_DAY).toBe(15)
    expect(FEATURE_RUNG_MIN_PX_PER_DAY * SPRINTS_PER_QUARTER * SPRINT_DAYS).toBe(WIDTH)
  })

  it('measures a quarter the way bands.ts does, in sprints, not as three calendar months', () => {
    expect(WIDTH / FEATURE_RUNG_MIN_PX_PER_DAY).toBe(SPRINTS_PER_QUARTER * SPRINT_DAYS)
    expect(WIDTH / FEATURE_RUNG_MIN_PX_PER_DAY).not.toBe(Math.round(WORKING_DAYS_PER_YEAR / 4))
  })

  it('treats the item threshold as inclusive: 45 is the item rung and 44 is the feature rung', () => {
    expect(at(ITEM_RUNG_MIN_PX_PER_DAY)).toBe('item')
    expect(at(ITEM_RUNG_MIN_PX_PER_DAY - 1)).toBe('feature')
  })

  it('treats the feature threshold as inclusive: 15 is the feature rung and 14 is the epic rung', () => {
    expect(at(FEATURE_RUNG_MIN_PX_PER_DAY)).toBe('feature')
    expect(at(FEATURE_RUNG_MIN_PX_PER_DAY - 1)).toBe('epic')
  })

  it('answers a rung for every whole pxPerDay from 1 to 400, so no zoom level renders nothing', () => {
    const rungs = new Set(Array.from({ length: 400 }, (_, step) => at(step + 1)))
    expect([...rungs].sort()).toEqual(['epic', 'feature', 'item'])
  })

  it('answers the item rung however far a caller zooms in past the last threshold', () => {
    expect(at(1_000)).toBe('item')
    expect(at(Number.MAX_SAFE_INTEGER)).toBe('item')
  })

  it('answers the epic rung at the smallest whole pxPerDay the scale allows', () => {
    expect(at(1)).toBe('epic')
  })

  it('gives the band between a quarter and a year to the epic rung, which §5 leaves unassigned', () => {
    expect(showing(5 * 21)).toBe('epic')
    expect(at(8)).toBe('epic')
  })

  it('ignores the gutter, so widening a rail label cannot move the rung', () => {
    expect(rungFor(scaleFor({ pxPerDay: 15, gutter: 0 }))).toBe('feature')
    expect(rungFor(scaleFor({ pxPerDay: 15, gutter: 880 }))).toBe('feature')
  })

  it('takes the scale and nothing else, because there is no rung prop to pass in', () => {
    expect(rungFor.length).toBe(1)
  })
})
