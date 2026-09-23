import { describe, expect, it } from 'vitest'
import type { DayRange } from './bands.js'
import { SPRINTS_PER_QUARTER } from './bands.js'
import type { Rung } from './rungs.js'
import { FEATURE_RUNG_MAX_DAYS, ITEM_RUNG_MAX_DAYS, rungFor } from './rungs.js'

const WORKING_DAYS_PER_YEAR = 260

const range = (fromDay: number, toDay: number): DayRange => ({ fromDay, toDay })

const showing = (days: number): Rung => rungFor(range(0, days))

describe('rungFor derives the detail level from the view, as spec §5 requires', () => {
  it('puts §5\'s "~1–2 sprints" view on the item rung, at both ends of that row', () => {
    expect(showing(10)).toBe('item')
    expect(showing(20)).toBe('item')
  })

  it('puts §5\'s "~1 quarter" view on the feature rung', () => {
    expect(showing(60)).toBe('feature')
  })

  it('puts §5\'s "~1–2 years" view on the epic rung, at both ends of that row', () => {
    expect(showing(WORKING_DAYS_PER_YEAR)).toBe('epic')
    expect(showing(2 * WORKING_DAYS_PER_YEAR)).toBe('epic')
  })

  it('bounds the item rung at two ten-day sprints, which is 20 working days', () => {
    expect(ITEM_RUNG_MAX_DAYS).toBe(20)
  })

  it('bounds the feature rung at a quarter of sprints, which is 60 working days', () => {
    expect(FEATURE_RUNG_MAX_DAYS).toBe(60)
    expect(FEATURE_RUNG_MAX_DAYS).toBe(SPRINTS_PER_QUARTER * 10)
  })

  it('measures a quarter the way bands.ts does, in sprints, not as three calendar months', () => {
    expect(FEATURE_RUNG_MAX_DAYS).not.toBe(Math.round(WORKING_DAYS_PER_YEAR / 4))
  })

  it('treats the item bound as inclusive: 20 days is the item rung and 21 is the feature rung', () => {
    expect(showing(ITEM_RUNG_MAX_DAYS)).toBe('item')
    expect(showing(ITEM_RUNG_MAX_DAYS + 1)).toBe('feature')
  })

  it('treats the feature bound as inclusive: 60 days is the feature rung and 61 is the epic rung', () => {
    expect(showing(FEATURE_RUNG_MAX_DAYS)).toBe('feature')
    expect(showing(FEATURE_RUNG_MAX_DAYS + 1)).toBe('epic')
  })

  it('answers a rung for every width from 1 to 400 days, so no viewport renders nothing', () => {
    const rungs = new Set(Array.from({ length: 400 }, (_, step) => showing(step + 1)))
    expect([...rungs].sort()).toEqual(['epic', 'feature', 'item'])
  })

  it('answers the epic rung however far a caller zooms out past the last bound', () => {
    expect(showing(100_000)).toBe('epic')
    expect(showing(Number.MAX_SAFE_INTEGER)).toBe('epic')
  })

  it('answers the item rung for a single working day, the narrowest real view', () => {
    expect(showing(1)).toBe('item')
  })

  it('reads the width and not the offsets, so a scrolled viewport keeps its rung', () => {
    expect(rungFor(range(0, 60))).toBe('feature')
    expect(rungFor(range(1_000, 1_060))).toBe('feature')
    expect(rungFor(range(-80, -20))).toBe('feature')
  })

  it('answers the item rung for a degenerate range, monotonically and with no special case', () => {
    expect(rungFor(range(0, 0))).toBe('item')
    expect(rungFor(range(40, 10))).toBe('item')
  })

  it('gives the band between a quarter and a year to the epic rung, which §5 leaves unassigned', () => {
    expect(showing(105)).toBe('epic')
    expect(showing(200)).toBe('epic')
  })

  it('takes the range and nothing else, because there is no rung prop to pass in', () => {
    expect(rungFor.length).toBe(1)
  })
})
