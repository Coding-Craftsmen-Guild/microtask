import { calendarBands } from '@repo/canvas'
import type { Rung } from '@repo/canvas'
import { dateToDay } from '@repo/schedule'
import { cleanup, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan } from '../testing/plan-fixture'
import { CANVAS_SCALE, canvasWidth, chromeRange } from '../canvas/view'
import { ZOOM_VIEW } from '../canvas/zoom-view'
import { NAMEABLE, NAMEABLE_SHORT } from './header-cells'
import { TimeHeader } from './time-header'

const plan = planScreenModel(atlasPlan())

const RANGE = { fromDay: 0, toDay: 60 }

// A fixed instant, so the TODAY tag is somewhere it can be asserted and nowhere it can drift. It is a
// prop for the reason `TodayMark` takes one: a component that read the clock would answer differently
// one midnight to the next, and the header draws the tag from the same `todayLine` the canvas does.
const AT = new Date('2026-10-05T09:00:00.000Z')

const draw = () => {
  cleanup()
  const width = canvasWidth(CANVAS_SCALE, RANGE)
  render(<TimeHeader at={AT} plan={plan} range={RANGE} rung="feature" scale={CANVAS_SCALE} width={width} />)
}

const cells = (slot: string): readonly HTMLElement[] => {
  draw()
  return [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)]
}

/** The header as one zoom stop actually draws it, scale and range both taken from that stop. */
const atRung = (rung: Rung, slot: string): readonly HTMLElement[] => {
  cleanup()
  const { scale, rangeFor } = ZOOM_VIEW[rung]
  const range = rangeFor(plan)
  render(
    <TimeHeader
      at={AT}
      plan={plan}
      range={range}
      rung={rung}
      scale={scale}
      width={canvasWidth(scale, range)}
    />,
  )
  return [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)]
}

const left = (cell: HTMLElement): number => Number.parseFloat(cell.style.left)

const wide = (cell: HTMLElement): number => Number.parseFloat(cell.style.width)

describe('the quarters the header names, now that they are the calendar’s own', () => {
  it('names a real year quarter, so a plan starting in September is not drawing Q1 over October', () => {
    expect(cells('quarter-head').map((cell) => cell.textContent)).toEqual([
      'Q3',
      'Q4 2026',
      'Q1 2027',
      'Q2 2027',
    ])
  })

  // The first cell is a stub: this plan opens four working days before Q4, so two thirds of Q3 is
  // behind day zero. It says so twice — the short name, and a shade — because a cell reading
  // "Q3 2026" beside "Q4 2026" would be claiming to be a whole quarter at a tenth of the width.
  it('names a clamped leading quarter short and shades it, it being a stub of a quarter', () => {
    const first = cells('quarter-head')[0]
    expect(first?.textContent).toBe('Q3')
    expect(first?.dataset['part']).toBe('')
    expect(first?.className).toContain('bg-sprint-alt')
  })

  it('leaves a whole quarter unshaded and named in full, which is what the stub is told apart from', () => {
    const second = cells('quarter-head')[1]
    expect(second?.textContent).toBe('Q4 2026')
    expect(second?.dataset['part']).toBeUndefined()
    expect(second?.className).not.toContain('bg-sprint-alt')
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
  // The budget is the name's own: "Q4 2026" needs 48px and "Q3" needs 24, so a clamped cell keeps its
  // short name at widths where the full one would have been dropped. This plan's first cell is between
  // the two, which is exactly the case the two thresholds exist for.
  it('spends each name against its own width, a clipped letter reading as a fault rather than a quarter', () => {
    const [first, second] = cells('quarter-head')

    expect(wide(first as HTMLElement)).toBeLessThan(NAMEABLE)
    expect(wide(first as HTMLElement)).toBeGreaterThanOrEqual(NAMEABLE_SHORT)
    expect(first?.textContent).toBe('Q3')
    expect(second?.textContent).toBe('Q4 2026')
  })

  it('still draws the band itself, so the grid is unbroken where the name is absent', () => {
    expect(cells('quarter-head')).toHaveLength(4)
  })
})

describe('the bottom tier, which is sprints at every stop and says as much as each has room for', () => {
  it('draws sprints at every stop, that being the unit the plan is actually scheduled against', () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      expect(atRung(rung, 'week-head').length, rung).toBeGreaterThan(0)
    }
  })

  // The row carried **months** at the Year stop, because a sprint cell is forty pixels there and
  // W40–41 is not. What changed is that a cell is no longer handed one string to clip: each stop is
  // told what it has room for, so the row can stay in the plan's own unit at every zoom.
  it('draws no month cells anywhere, the row no longer changing unit to stay legible', () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      expect(atRung(rung, 'month-head'), rung).toEqual([])
    }
  })

  it('counts sprints from one, S0 being the only thing on the page that would count from zero', () => {
    expect(atRung('item', 'week-head')[0]?.textContent).toContain('Sprint 1')
    expect(atRung('epic', 'week-head')[0]?.textContent).toBe('S1')
  })

  it('spells out the sprint and its dates where a cell is wide enough to hold them', () => {
    const first = atRung('item', 'week-head')[0]
    expect(first?.textContent).toMatch(/^Sprint 1W\d+(–\d+)? · \w{3} \d+ – \w{3} \d+$/)
  })

  it('drops to the start date alone at Quarter, and to the name alone at Year', () => {
    expect(atRung('feature', 'week-head')[0]?.textContent).toMatch(/^S1\w{3} \d+$/)
    expect(atRung('epic', 'week-head')[0]?.textContent).toBe('S1')
  })

  it('keeps the whole dates in a title at every stop, which is what a forty-pixel cell has instead', () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      expect(atRung(rung, 'week-head')[0]?.title, rung).toMatch(
        /^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/,
      )
    }
  })
})

// The tier that was missing. A plan running into January showed Q1 with nothing saying which
// year's, and the TODAY tag had no row of its own and so nowhere to be but over a quarter's name.
describe('the year tier over the quarters', () => {
  it('spans each year across its own quarters, folded from the bands under it', () => {
    const years = cells('year-head')
    expect(years.map((cell) => cell.textContent)).toEqual(['2026', '2027'])
    expect(years.map((cell) => cell.dataset['year'])).toEqual(['2026', '2027'])
  })

  it('opens each year where its first quarter opens and ends where its last one ends', () => {
    const [first, second] = cells('year-head')
    const quarters = cells('quarter-head')
    expect(left(first as HTMLElement)).toBe(left(quarters[0] as HTMLElement))
    expect(left(first as HTMLElement) + wide(first as HTMLElement)).toBe(left(second as HTMLElement))
  })

  // One render, read twice: `cells` draws afresh each call, so comparing an element from one call to
  // an element from another compares two nodes from two trees and can only ever fail.
  it('puts the TODAY tag in that row, at the day the canvas draws its line on', () => {
    draw()
    const tag = document.querySelector<HTMLElement>('[data-slot="today-tag"]')
    const year = document.querySelector<HTMLElement>('[data-slot="year-head"]')
    expect(tag?.textContent).toBe('TODAY')
    expect(tag?.parentElement).toBe(year?.parentElement)
    expect(Number.parseFloat(tag?.style.left ?? '')).toBeGreaterThan(0)
  })
})

// The header and the canvas have to be exactly the same width or the two scroll apart, and neither
// can be told what that width is: a Server Component cannot measure the pane. Both say the same thing
// in CSS instead — fill the pane, and never be narrower than the plan's own days — which resolves to
// one number because `min-width` beats a percentage that came out smaller. `happy-dom` lays nothing
// out, so what is asserted here is that both say it, not what a browser then does with it.
describe('how wide the header is, which has to be exactly how wide the canvas is', () => {
  const header = (): HTMLElement => {
    draw()
    const found = document.querySelector<HTMLElement>('[data-slot="time-header"]')
    if (found === null) throw new Error('no header')
    return found
  }

  it('floors itself at the plan width and fills a wider pane, rather than fixing its own width', () => {
    expect(header().style.minWidth).toBe(`${String(canvasWidth(CANVAS_SCALE, RANGE))}px`)
    expect(header().style.width).toBe('')
    expect(header().className).toContain('flex-1')
  })

  it('clips all three rows, so the bled cells cannot scroll a pane the plan already fits in', () => {
    for (const slot of ['year-head', 'quarter-head', 'week-head']) {
      const row = cells(slot)[0]?.parentElement
      expect(row?.className, slot).toContain('overflow-hidden')
    }
  })
})
