import { describe, expect, it } from 'vitest'
import { RAIL_PALETTE, nextRailColour } from './rail-palette'

describe('the palette a new rail is proposed a colour from', () => {
  it('holds only colours the contract accepts, which is lowercase #rrggbb', () => {
    for (const colour of RAIL_PALETTE) expect(colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('holds no colour twice, a repeat being one pair of rails that cannot be told apart', () => {
    expect(new Set(RAIL_PALETTE).size).toBe(RAIL_PALETTE.length)
  })

  it('holds enough to tell a handful of rails apart, which is what a plan usually has', () => {
    expect(RAIL_PALETTE.length).toBeGreaterThanOrEqual(5)
  })
})

describe('nextRailColour hands them out in order', () => {
  it('gives the first rail the first colour', () => {
    expect(nextRailColour(0)).toBe(RAIL_PALETTE[0])
  })

  it('gives each of the first few rails a different one, which is the whole point', () => {
    const first = RAIL_PALETTE.map((_, index) => nextRailColour(index))
    expect(new Set(first).size).toBe(RAIL_PALETTE.length)
  })

  // Cycling means two distant rails may share a hue. That is a smaller problem than every rail
  // sharing one, and any rail can be recoloured by hand from its own drawer.
  it('cycles rather than running out, a plan being allowed more rails than there are colours', () => {
    expect(nextRailColour(RAIL_PALETTE.length)).toBe(RAIL_PALETTE[0])
    expect(nextRailColour(RAIL_PALETTE.length + 2)).toBe(RAIL_PALETTE[2])
  })

  it('answers a real colour for a count nobody should have passed, rather than undefined', () => {
    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(nextRailColour(count)).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
