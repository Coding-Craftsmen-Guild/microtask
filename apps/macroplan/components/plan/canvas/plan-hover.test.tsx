import type { Plan } from '@repo/api-client'
import { sprintTicks } from '@repo/canvas'
import { dateToDay, dayToDate } from '@repo/schedule'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TimeHeader } from '../board/time-header'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan } from '../testing/plan-fixture'
import { detailsOf, splitDetail } from './detail-lines'
import { todayHover } from './hover'
import { PlanCanvas } from './plan-canvas'
import { canvasWidth, CANVAS_RANGE, CANVAS_SCALE, chromeRange } from './view'

// The reveal itself — a browser painting a tooltip after a pointer rests on something — is not
// something happy-dom does, and nothing here pretends otherwise: every assertion below is about
// what the markup *carries*, which is the half that can be wrong in a way a person would not see.
//
// Two things used to carry a date and now the second one is not on the canvas at all. The per-sprint
// hover targets went with `SprintTickLayer`: a full-height transparent `<rect>` per sprint was one
// invisible pointer target per sprint lying over every bar, and `TimeGrid` records why that was a
// worse thing to drag through than it was a good thing to point at. A sprint's two dates are still
// revealed — on the `title` of its own HTML week heading in the row above the canvas — so the second
// block below renders `TimeHeader`, which is where that sentence now lives. What went with the rects
// is the Chromium measurement of *which painted surfaces* reached the old tooltip, and the layer
// order that measurement was taken against: there is no full-height target under the bars for a
// filled bar to absorb the pointer from.
//
// Inside the SVG only the today line reveals anything, and it is now the only node on the canvas
// with a `<title>` at all. Its case is unchanged and is the one worth the words: the sentence is
// built from the date the line *carried*, never from the working-day offset it was drawn at.
//
// The `aria-hidden` assertions are the exception that matters. They exist because the first version
// of this feature argued in prose that `role="img"` pruned its own subtree — advisory in WAI-ARIA,
// declined by Chromium, and false where it counted. An attribute is observable here, so the
// guarantee is now pinned rather than reasoned about.

const AT = new Date('2026-10-05T09:00:00.000Z')

const SATURDAY = '2026-10-03'

const SUNDAY = '2026-10-04'

const MONDAY = '2026-10-05'

const ISO_DATE = /\d{4}-\d{2}-\d{2}/

const WEEKEND_NOTE = 'not a working day, so the line sits at the next one'

const FIRST_SPRINT_DATES = '2026-09-28 to 2026-10-15'

const all = (selector: string): readonly Element[] => [...document.querySelectorAll(selector)]

const only = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const titleOf = (selector: string): string | null =>
  document.querySelector(`${selector} title`)?.textContent ?? null

const numberOf = (element: Element, attribute: string): number =>
  Number(element.getAttribute(attribute))

const styleOf = (element: Element): string => element.getAttribute('style') ?? ''

const nth = <T,>(list: readonly T[], index: number): T => {
  const found = list[index]
  if (found === undefined) throw new Error(`no entry at index ${String(index)}`)
  return found
}

const ticksOf = () => sprintTicks(atlasPlan(), CANVAS_SCALE, chromeRange(CANVAS_RANGE))

const todayAt = (date: string) => {
  render(<PlanCanvas at={new Date(`${date}T09:00:00.000Z`)} place={null} plan={planScreenModel(atlasPlan())} />)
  const group = only('[data-slot="today"]')
  const read = {
    title: titleOf('[data-slot="today"]'),
    date: group.getAttribute('data-date'),
    day: group.getAttribute('data-day'),
    x: numberOf(only('[data-slot="today"] line'), 'x1'),
  }
  cleanup()
  return read
}

/** The week headings above the canvas, which is where a sprint's own dates are revealed now. */
const headingsOf = (plan: Plan = atlasPlan()): readonly Element[] => {
  render(
    <TimeHeader
      at={new Date('2026-10-05T09:00:00.000Z')}
      plan={planScreenModel(plan)}
      range={CANVAS_RANGE}
      rung="feature"
      scale={CANVAS_SCALE}
      width={canvasWidth(CANVAS_SCALE, CANVAS_RANGE)}
    />,
  )
  return all('[data-slot="week-head"]')
}

describe('the today line’s own hover, and the weekend it has no offset for', () => {
  it('names today’s date in the plan’s zone, from the date the line carried and not from its offset', () => {
    const working = todayAt(MONDAY)
    expect(working.title).toBe(`Today · ${MONDAY}`)
    expect(working.date).toBe(MONDAY)
    expect(working.day).toBe('5')
  })

  it('names Saturday for a Saturday, though the line is drawn at Monday’s edge', () => {
    const plan = atlasPlan()
    expect(dayToDate(dateToDay(SATURDAY, plan), plan)).toBe(MONDAY)
    const weekend = todayAt(SATURDAY)
    expect(weekend.title).toBe(`Today · ${SATURDAY} · ${WEEKEND_NOTE}`)
    expect(weekend.title).not.toContain(MONDAY)
    expect(weekend.day).toBe('5')
  })

  it('keeps one date per instant while the three share one offset and one x', () => {
    const seen = [SATURDAY, SUNDAY, MONDAY].map(todayAt)
    expect(seen.map((one) => one.title)).toEqual([
      `Today · ${SATURDAY} · ${WEEKEND_NOTE}`,
      `Today · ${SUNDAY} · ${WEEKEND_NOTE}`,
      `Today · ${MONDAY}`,
    ])
    expect(seen.map((one) => one.day)).toEqual(['5', '5', '5'])
    expect(new Set(seen.map((one) => one.x)).size).toBe(1)
  })

  it('says why the line is elsewhere without naming Monday, which holidays would make a lie', () => {
    expect(todayHover(SATURDAY)).toContain(WEEKEND_NOTE)
    expect(todayHover(SATURDAY)).not.toContain('Monday')
    expect(todayHover(MONDAY)).not.toContain(WEEKEND_NOTE)
  })
})

describe('the sprint dates the week headings reveal, now that the canvas has no target for them', () => {
  it('gives every heading a title naming the two dates sprintTicks carried, and recomputes neither', () => {
    const ticks = ticksOf()
    const headings = headingsOf()
    expect(headings).toHaveLength(ticks.length)
    expect(headings.length).toBeGreaterThan(1)
    expect(headings.map((heading) => heading.getAttribute('title'))).toEqual(
      ticks.map((tick) => `${tick.from} to ${tick.to}`),
    )
  })

  it('reads `to` as the sprint’s own last working day, never as the next sprint’s first', () => {
    const plan = atlasPlan()
    const first = nth(ticksOf(), 0)
    const second = nth(ticksOf(), 1)
    expect(nth(headingsOf(), 0).getAttribute('title')).toBe(FIRST_SPRINT_DATES)
    expect(first.to).not.toBe(second.from)
    expect(dateToDay(first.to, plan)).toBe(first.endDay - 1)
    expect(dateToDay(second.from, plan)).toBe(first.endDay)
  })

  // The cell says "S1 Sep 28" at the Quarter stop these headings are drawn at — the week label is the
  // Sprint stop's, where there is room for it (`../board/time-bands.ts`). What the title owes is
  // unchanged: the two stored dates, joined by a word, so the en dash in a week label cannot be read
  // as the separator between them.
  it('joins the two dates with a word and no dash at all, since the en dash is a label’s own', () => {
    const heading = nth(headingsOf(), 0)
    expect(heading.getAttribute('title')).toContain(' to ')
    expect(heading.getAttribute('title')).not.toContain('–')
  })

  it('keeps the visible text out of the title, which would otherwise read the cell back', () => {
    const heading = nth(headingsOf(), 0)
    expect(heading.getAttribute('title')).not.toContain(heading.textContent ?? '')
    expect(heading.textContent).not.toMatch(ISO_DATE)
  })

  it('sizes each heading to its own sprint’s column, so the target is the column and not a gridline', () => {
    const ticks = ticksOf()
    const headings = headingsOf()
    for (const [index, tick] of ticks.entries()) {
      const heading = nth(headings, index)
      expect(styleOf(heading), tick.label).toContain(`left: ${String(tick.x)}px`)
      expect(styleOf(heading), tick.label).toContain(`width: ${String(tick.width)}px`)
    }
    const first = nth(ticks, 0)
    expect(styleOf(nth(headings, 1))).toContain(`left: ${String(first.x + first.width)}px`)
  })

  it('still names both dates for a plan whose zone this runtime cannot resolve, being day arithmetic', () => {
    const headings = headingsOf(atlasPlan({ timezone: 'Mars/Phobos' }))
    expect(nth(headings, 0).getAttribute('title')).toBe(FIRST_SPRINT_DATES)
    expect(headings).toHaveLength(ticksOf().length)
  })
})

describe('what the canvas still does not draw, and still does not name', () => {
  // §5's condition is that no real calendar date is permanent chrome. The canvas satisfied it the
  // strongest way available for a phase — it drew no text of any kind — and writes a mark's own name
  // again now that there is room for one (`canvas/mark-label.ts`). The condition is unchanged and is
  // asserted as itself: the only node on the canvas holding a date is a `<title>`, which draws
  // nothing until it is pointed at.
  it('writes no calendar date outside a title, which is what §5 reserves a hover for', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    const leaves = all('[data-slot="plan-canvas"] *').filter((node) => node.children.length === 0)
    const dated = leaves.filter((node) => (node.textContent ?? '').match(ISO_DATE) !== null)
    expect(dated.map((node) => node.tagName)).toEqual(['title'])
  })

  it('leaves the today line the only node on the canvas a pointer can name, the rects being gone', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    const titles = all('[data-slot="plan-canvas"] title')
    expect(titles).toHaveLength(1)
    expect(nth(titles, 0).closest('[data-slot="today"]')).toBeTruthy()
  })

  it('leaves the grid holding bands and rules only, so nothing per-sprint lies over the bars', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    const grid = [...only('[data-slot="time-grid"]').children]
    const bands = grid.filter((child) => child.getAttribute('data-slot') === 'sprint-band')
    const rules = grid.filter((child) => child.getAttribute('data-slot') === 'sprint-tick')
    expect(bands.length + rules.length).toBe(grid.length)
    expect(bands.length).toBeGreaterThan(0)
    expect(rules).toHaveLength(ticksOf().length)
    expect(grid.filter((child) => child.tagName.toLowerCase() === 'rect')).toEqual(bands)
    for (const child of grid) expect(child.querySelector('title')).toBeNull()
  })

  it('paints the grid first and today last, so the one target left is over every bar and band', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    const slotsInOrder = [...only('[data-slot="plan-canvas"]').children].map((child) =>
      child.getAttribute('data-slot'),
    )
    expect(slotsInOrder.indexOf('time-grid')).toBe(0)
    expect(slotsInOrder.indexOf('rail')).toBeGreaterThan(slotsInOrder.indexOf('time-grid'))
    expect(nth(slotsInOrder, slotsInOrder.length - 1)).toBe('today')
  })

  it('names no feature bar, item mark or quarter band, because one title per mark is one node per mark', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    expect(all('[data-slot="feature-bar"] title')).toHaveLength(0)
    expect(all('[data-slot="item-mark"] title')).toHaveLength(0)
    expect(all('[data-slot="quarter-band"] title')).toHaveLength(0)
    for (const mark of all('[data-slot="item-mark"]')) expect(mark.children).toHaveLength(0)
  })

  it('leaves the canvas’s own accessible name to its aria-label, which outranks any descendant title', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(only('[data-slot="plan-canvas"]').querySelector(':scope > title')).toBeNull()
  })

  it('hides every titled group explicitly, because role=img prunes a subtree only as a SHOULD NOT', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} />)
    expect(only('[data-slot="today"]').getAttribute('aria-hidden')).toBe('true')
    for (const title of all('[data-slot="plan-canvas"] title')) {
      expect(title.closest('[aria-hidden="true"]'), title.textContent ?? '').toBeTruthy()
    }
  })

  it('reveals nothing at all when this runtime cannot resolve the plan’s zone, and draws the rest', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan({ timezone: 'Mars/Phobos' }))} />)
    expect(all('[data-slot="today"]')).toHaveLength(0)
    expect(all('[data-slot="plan-canvas"] title')).toHaveLength(0)
    expect(all('[data-slot="sprint-tick"]').length).toBeGreaterThan(1)
    expect(all('[data-slot="feature-bar"]').length).toBeGreaterThan(0)
  })
})

describe('the detail each mark carries, which is what the hover card reads', () => {
  const detailsFor = (plan: Plan = atlasPlan()) => detailsOf(planScreenModel(plan))

  const drawn = (rung: 'epic' | 'feature' | 'item') => {
    render(
      <PlanCanvas
        at={AT}
        place={null}
        plan={planScreenModel(atlasPlan())}
        rung={rung}
      />,
    )
  }

  it('carries the feature’s own card on every bar, joined exactly as detailsOf joined it', () => {
    drawn('item')
    const bars = all('[data-slot="feature-bar"]')
    expect(bars.length).toBeGreaterThan(0)
    for (const bar of bars) {
      const id = bar.getAttribute('data-feature-id') ?? ''
      expect(bar.getAttribute('data-detail'), id).toBe(detailsFor().get(id))
    }
  })

  it('carries one on every item mark too, titled with the item and not with its feature', () => {
    drawn('item')
    const marks = all('[data-slot="item-mark"]')
    expect(marks.length).toBeGreaterThan(0)
    for (const mark of marks) {
      const id = mark.getAttribute('data-item-id') ?? ''
      expect(mark.getAttribute('data-detail'), id).toBe(detailsFor().get(id))
    }
    expect(splitDetail(nth(marks, 0).getAttribute('data-detail') ?? '').title).toBe('Sessions')
  })

  it('carries it at the point rungs as well, where a feature is a dot and has no label to read', () => {
    drawn('epic')
    const points = all('[data-slot="feature-bar"]')
    expect(points.length).toBeGreaterThan(0)
    for (const point of points) {
      const id = point.getAttribute('data-feature-id') ?? ''
      expect(point.getAttribute('data-detail'), id).toBe(detailsFor().get(id))
    }
  })

  it('adds no title element, so the browser’s own tooltip does not race the card', () => {
    drawn('item')
    for (const title of all('[data-slot="plan-canvas"] title')) {
      expect(title.closest('[data-slot="feature-bar"],[data-slot="item-mark"]')).toBeNull()
    }
  })
})
