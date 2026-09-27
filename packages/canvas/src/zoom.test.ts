import { describe, expect, it } from 'vitest'
import { quarterBands, sprintTicks } from './bands.js'
import { rungFor } from './rungs.js'
import type { Rung } from './rungs.js'
import { scaleFor, widthOfDays } from './scale.js'
import { ZOOM_STOPS, rungParam } from './zoom.js'

const RUNGS: readonly Rung[] = ['epic', 'feature', 'item']

const GUTTER = 160

const AXIS_CEILING = 1000

describe('ZOOM_STOPS is three views, one per rung of design 5', () => {
  it('lands each stop on the rung it is filed under, which is the invariant that keeps it honest', () => {
    RUNGS.forEach((rung) => {
      expect(rungFor(ZOOM_STOPS[rung].range)).toBe(rung)
    })
  })

  it('offers exactly the three rungs and nothing else, so no view is unreachable', () => {
    expect(Object.keys(ZOOM_STOPS).sort()).toEqual(['epic', 'feature', 'item'])
  })

  it('widens strictly from item to epic, so the three are an ordering and not a set', () => {
    const days = RUNGS.map((rung) => ZOOM_STOPS[rung].range.toDay - ZOOM_STOPS[rung].range.fromDay)
    expect(days).toEqual([...days].sort((left, right) => right - left))
    expect(new Set(days).size).toBe(3)
  })

  it('falls in px per day as it widens, so the axis stays about one width at every stop', () => {
    RUNGS.forEach((rung) => {
      const stop = ZOOM_STOPS[rung]
      const axis = widthOfDays(stop.range.toDay - stop.range.fromDay, scaleFor({ pxPerDay: stop.pxPerDay, gutter: GUTTER }))
      expect(axis).toBeLessThanOrEqual(AXIS_CEILING)
    })
  })

  it('starts every stop at the plan first working day, since panning is not what this is', () => {
    RUNGS.forEach((rung) => {
      expect(ZOOM_STOPS[rung].range.fromDay).toBe(0)
    })
  })

  it('gives every stop real chrome, so no zoom draws an axis with nothing on it', () => {
    const plan = { startDate: '2026-01-05', sprintLengthDays: 10, timezone: 'UTC' }
    RUNGS.forEach((rung) => {
      const stop = ZOOM_STOPS[rung]
      const scale = scaleFor({ pxPerDay: stop.pxPerDay, gutter: GUTTER })
      expect(quarterBands(plan, scale, stop.range).length).toBeGreaterThan(0)
      expect(sprintTicks(plan, scale, stop.range).length).toBeGreaterThan(0)
    })
  })
})

describe('rungParam reads a rung off a search param and refuses to guess', () => {
  it('accepts the three spellings the product links to', () => {
    expect(rungParam('epic')).toBe('epic')
    expect(rungParam('feature')).toBe('feature')
    expect(rungParam('item')).toBe('item')
  })

  it('answers null for an absent param, leaving the default to the page', () => {
    expect(rungParam(null)).toBeNull()
    expect(rungParam(undefined)).toBeNull()
  })

  it('answers null for junk rather than falling back to a rung nobody asked for', () => {
    expect(rungParam('')).toBeNull()
    expect(rungParam('EPIC')).toBeNull()
    expect(rungParam('quarter')).toBeNull()
  })
})
