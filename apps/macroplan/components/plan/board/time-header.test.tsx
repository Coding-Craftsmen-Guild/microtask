import { calendarBands } from '@repo/canvas'
import { dateToDay } from '@repo/schedule'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan } from '../testing/plan-fixture'
import { CANVAS_SCALE, canvasWidth, chromeRange } from '../canvas/view'
import { TimeHeader } from './time-header'

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
      'Q3 2026',
      'Q4 2026',
      'Q1 2027',
      'Q2 2027',
    ])
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
