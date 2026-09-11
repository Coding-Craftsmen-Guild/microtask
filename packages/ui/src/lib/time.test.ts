import { describe, expect, it } from 'vitest'
import { relativeTime } from './time'

const NOW = Date.parse('2026-09-11T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('relativeTime', () => {
  it('returns the empty string for a missing timestamp, so a row with no date renders nothing', () => {
    expect(relativeTime(undefined, NOW)).toBe('')
    expect(relativeTime(null, NOW)).toBe('')
    expect(relativeTime('', NOW)).toBe('')
  })

  it('reads the instant from its second argument and never from the clock', () => {
    const from = ago(5 * MINUTE)
    expect(relativeTime(from, NOW)).toBe('5m ago')
    expect(relativeTime(from, NOW + 55 * MINUTE)).toBe('1h ago')
    expect(relativeTime(from, new Date(NOW))).toBe('5m ago')
  })

  it('says "just now" below the rounded one-minute boundary, which legacy put at 30s not 60s', () => {
    expect(relativeTime(ago(0), NOW)).toBe('just now')
    expect(relativeTime(ago(29_999), NOW)).toBe('just now')
    expect(relativeTime(ago(30_000), NOW)).toBe('1m ago')
  })

  it('rounds minutes to nearest, so 90s reads 2m ago and not 1m ago', () => {
    expect(relativeTime(ago(90_000), NOW)).toBe('2m ago')
  })

  it('counts minutes up to the rounded hour boundary at 59.5 minutes', () => {
    expect(relativeTime(ago(59 * MINUTE), NOW)).toBe('59m ago')
    expect(relativeTime(ago(59 * MINUTE + 29_000), NOW)).toBe('59m ago')
    expect(relativeTime(ago(59 * MINUTE + 30_000), NOW)).toBe('1h ago')
    expect(relativeTime(ago(HOUR), NOW)).toBe('1h ago')
  })

  it('counts hours up to the rounded day boundary at 23.5 hours', () => {
    expect(relativeTime(ago(23 * HOUR), NOW)).toBe('23h ago')
    expect(relativeTime(ago(23 * HOUR + 29 * MINUTE), NOW)).toBe('23h ago')
    expect(relativeTime(ago(23 * HOUR + 30 * MINUTE), NOW)).toBe('1d ago')
    expect(relativeTime(ago(DAY), NOW)).toBe('1d ago')
  })

  it('counts days up to the rounded 30-day boundary at 29.5 days, then falls back to a date', () => {
    expect(relativeTime(ago(29 * DAY), NOW)).toBe('29d ago')
    expect(relativeTime(ago(29 * DAY + 11 * HOUR), NOW)).toBe('29d ago')
    const thirty = ago(29 * DAY + 12 * HOUR)
    expect(relativeTime(thirty, NOW)).toBe(new Date(thirty).toLocaleDateString())
    const older = ago(200 * DAY)
    expect(relativeTime(older, NOW)).toBe(new Date(older).toLocaleDateString())
  })

  it('reads a future timestamp as "just now" rather than as a negative count', () => {
    expect(relativeTime(ago(-5 * MINUTE), NOW)).toBe('just now')
    expect(relativeTime(ago(-400 * DAY), NOW)).toBe('just now')
  })

  it('falls through to the locale date for an unparseable timestamp', () => {
    expect(relativeTime('not-a-date', NOW)).toBe(new Date('not-a-date').toLocaleDateString())
  })
})
