import { calendarBands } from '@repo/canvas'
import { dateToDay } from '@repo/schedule'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan } from '../testing/plan-fixture'
import { CANVAS_SCALE, canvasWidth, chromeRange } from '../canvas/view'
import { NAMEABLE, TimeHeader } from './time-header'

const plan = planScreenModel(atlasPlan())

const RANGE = { fromDay: 0, toDay: 60 }

const draw = () => {
  cleanup()
  const width = canvasWidth(CANVAS_SCALE, RANGE)
  render(<TimeHeader plan={plan} range={RANGE} scale={CANVAS_SCALE} width={width} />)
}

const cells = (slot: string): readonly HTMLElement[] => {
  draw()
  return [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)]
}

const left = (cell: HTMLElement): number => Number.parseFloat(cell.style.left)

const wide = (cell: HTMLElement): number => Number.parseFloat(cell.style.width)

describe('the quarters the header names, now that they are the calendar’s own', () => {
  it('names a real year quarter, so a plan starting in September is not drawing Q1 over October', () => {
    expect(cells('quarter-head').map((cell) => cell.textContent)).toEqual([
      '',
      'Q4 2026',
      'Q1 2027',
      'Q2 2027',
    ])
  })

  // The first band is Q3 2026 and is unnamed only because this plan's four days of it leave a cell too
  // narrow to carry the words; the band is still that quarter, which is what the key says.
  it('keys the unnamed first cell on the quarter it is, a missing label being about width alone', () => {
    expect(cells('quarter-head')[0]?.dataset['quarter']).toBe('2026-3')
  })

  it('keys each cell on the year as well as the quarter, two Q1s being two different bands', () => {
    const keys = cells('quarter-head').map((cell) => cell.dataset['quarter'])
    expect(keys).toEqual(['2026-3', '2026-4', '2027-1', '2027-2'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('the band that opens before the plan does, which a calendar quarter now can', () => {
  it('starts Q3 2026 before day zero, this plan opening on 2026-09-28 and the quarter on 2026-07-01', () => {
    expect(calendarBands(plan, CANVAS_SCALE, RANGE)[0]?.startDay).toBe(
      dateToDay('2026-07-01', plan),
    )
    expect(calendarBands(plan, CANVAS_SCALE, RANGE)[0]?.startDay).toBeLessThan(0)
  })

  it('clamps that cell to the left edge rather than positioning it off screen with its label', () => {
    expect(left(cells('quarter-head')[0] as HTMLElement)).toBe(0)
  })

  it('takes the clamped pixels off the cell’s width, so it still ends where its band does', () => {
    const [first, second] = cells('quarter-head')
    expect(wide(first as HTMLElement)).toBe(left(second as HTMLElement))
  })

  it('leaves a band that starts inside the range alone, clamping being for the first one only', () => {
    const [, second] = cells('quarter-head')
    const band = calendarBands(plan, CANVAS_SCALE, RANGE)[1]
    expect(left(second as HTMLElement)).toBe(band?.x)
    expect(wide(second as HTMLElement)).toBe(band?.width)
  })
})

describe('the chrome drawn past the range, so the grid reaches the edge of any pane', () => {
  it('bleeds the header past the days the canvas draws marks for', () => {
    const last = cells('week-head').at(-1)
    expect(Number(last?.dataset['sprint'])).toBeGreaterThan(RANGE.toDay / plan.sprintLengthDays)
  })

  it('bleeds by a fixed number of days rather than by a share of the range', () => {
    expect(chromeRange({ fromDay: 0, toDay: 10 }).toDay - 10).toBe(
      chromeRange(RANGE).toDay - RANGE.toDay,
    )
  })

  it('bleeds only to the right, day zero being the plan’s own first day', () => {
    expect(chromeRange(RANGE).fromDay).toBe(RANGE.fromDay)
  })
})

// A calendar quarter can be almost entirely behind day zero — this plan opens four working days
// before Q4 2026, so Q3's cell is clamped to the left edge and a handful of pixels wide. Its label is
// not that wide, and without clipping it overflowed its own cell and printed on top of the next
// band's name: two quarter headings overlapping in the corner of the page.
describe('a cell narrower than the words in it', () => {
  it('clips each heading to its own band, so a sliver of a quarter cannot print over the next one', () => {
    for (const cell of cells('quarter-head')) {
      expect(cell.className).toContain('overflow-hidden')
    }
  })

  it('clips a week heading too, the bled ones at the right running past the canvas by design', () => {
    for (const cell of cells('week-head')) {
      expect(cell.className).toContain('overflow-hidden')
    }
  })
})

// Clipping a label to its cell stops two headings printing over each other, and leaves a new way to
// look broken: this plan opens four working days before Q4 2026, so Q3's clamped cell is a few pixels
// wide and showed a lone "Q" in the corner. A quarter too narrow to name is not named.
describe('a band too narrow to carry its own name', () => {
  it('draws the cell and no label, a single clipped letter reading as a fault rather than a quarter', () => {
    const [first, second] = cells('quarter-head')

    expect(wide(first as HTMLElement)).toBeLessThan(NAMEABLE)
    expect(first?.textContent).toBe('')
    expect(second?.textContent).toBe('Q4 2026')
  })

  it('still draws the band itself, so the grid is unbroken where the name is absent', () => {
    expect(cells('quarter-head')).toHaveLength(4)
  })
})
