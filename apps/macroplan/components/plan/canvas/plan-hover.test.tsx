import { sprintTicks } from '@repo/canvas'
import { dateToDay, dayToDate } from '@repo/schedule'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { atlasPlan } from '../testing/plan-fixture'
import { sprintHover, todayHover } from './hover'
import { PlanCanvas } from './plan-canvas'
import { CANVAS_RANGE, CANVAS_SCALE } from './view'

// The reveal itself — a browser painting a `<title>` after a pointer rests on a shape — is not
// something happy-dom does, and nothing here pretends otherwise: every assertion below is about
// what the canvas *carries*, which is the half that can be wrong in a way a person would not see.
// Which surfaces reach the tooltip was measured in Chromium instead, and `SprintTickLayer` records
// the result; the layer-order test below pins the paint order that measurement was taken against,
// and deliberately does not claim the coverage the order alone does not buy.
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

const nth = <T,>(list: readonly T[], index: number): T => {
  const found = list[index]
  if (found === undefined) throw new Error(`no entry at index ${String(index)}`)
  return found
}

const ticksOf = () => sprintTicks(atlasPlan(), CANVAS_SCALE, CANVAS_RANGE)

const todayAt = (date: string) => {
  render(<PlanCanvas at={new Date(`${date}T09:00:00.000Z`)} plan={atlasPlan()} />)
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

describe('the calendar dates a hover reveals', () => {
  it('gives every sprint a target naming the two dates sprintTicks carried, and recomputes neither', () => {
    const ticks = ticksOf()
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const targets = all('[data-slot="sprint-date"]')
    expect(targets).toHaveLength(ticks.length)
    expect(targets.length).toBeGreaterThan(1)
    expect(targets.map((target) => target.querySelector('title')?.textContent)).toEqual(
      ticks.map(sprintHover),
    )
    expect(targets.map((target) => target.getAttribute('data-from'))).toEqual(
      ticks.map((tick) => tick.from),
    )
    expect(targets.map((target) => target.getAttribute('data-to'))).toEqual(
      ticks.map((tick) => tick.to),
    )
  })

  it('reads `to` as the sprint’s own last working day, never as the next sprint’s first', () => {
    const plan = atlasPlan()
    const first = nth(ticksOf(), 0)
    const second = nth(ticksOf(), 1)
    expect(sprintHover(first)).toBe('W1–3 · 2026-09-28 to 2026-10-15')
    expect(first.to).not.toBe(second.from)
    expect(dateToDay(first.to, plan)).toBe(first.endDay - 1)
    expect(dateToDay(second.from, plan)).toBe(first.endDay)
  })

  it('joins the two dates with a word rather than a dash, because the tick’s own label holds one', () => {
    const first = nth(ticksOf(), 0)
    expect(first.label).toContain('–')
    expect(sprintHover(first)).toContain(' to ')
    expect(sprintHover(first).match(/–/g)).toHaveLength(1)
  })

  it('covers each sprint’s whole column, so a one-px gridline is not the thing to point at', () => {
    const ticks = ticksOf()
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const canvasHeight = numberOf(only('[data-slot="plan-canvas"]'), 'height')
    const targets = all('[data-slot="sprint-date"]')
    for (const [index, tick] of ticks.entries()) {
      const target = nth(targets, index)
      expect(numberOf(target, 'x'), tick.label).toBe(tick.x)
      expect(numberOf(target, 'width'), tick.label).toBe(tick.width)
      expect(numberOf(target, 'height'), tick.label).toBe(canvasHeight)
    }
    expect(numberOf(nth(targets, 1), 'x')).toBe(nth(ticks, 0).x + nth(ticks, 0).width)
  })

  it('sits over the bands and under the rails, which is a paint order and not a hover guarantee', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const slotsInOrder = [...only('[data-slot="plan-canvas"]').children].map((child) =>
      child.getAttribute('data-slot'),
    )
    const bands = slotsInOrder.indexOf('quarter-bands')
    const targets = slotsInOrder.indexOf('sprint-ticks')
    const rails = slotsInOrder.indexOf('rail')
    expect(bands).toBeGreaterThanOrEqual(0)
    expect(targets).toBeGreaterThan(bands)
    expect(rails).toBeGreaterThan(targets)
  })

  it('is behind every mark, so a painted fill absorbs the pointer and no sentence is revealed', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const target = only('[data-slot="sprint-date"]')
    const bar = only('[data-slot="feature-bar"]')
    expect(target.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(bar.closest('[data-slot="sprint-dates"]')).toBeNull()
    expect(bar.querySelector('title')).toBeNull()
  })
})

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

describe('what the canvas still does not draw, and still does not name', () => {
  it('puts no calendar date in any text the canvas draws, which is §5’s whole condition', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const drawn = all('[data-slot="plan-canvas"] text')
    expect(drawn.length).toBeGreaterThan(1)
    for (const text of drawn) expect(text.textContent).not.toMatch(ISO_DATE)
    expect(all('[data-slot="plan-canvas"] title').length).toBeGreaterThan(1)
  })

  it('names no feature bar, item mark or quarter band, because one title per mark is one node per mark', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(all('[data-slot="feature-bar"] title')).toHaveLength(0)
    expect(all('[data-slot="item-mark"] title')).toHaveLength(0)
    expect(all('[data-slot="quarter-band"] title')).toHaveLength(0)
    for (const mark of all('[data-slot="item-mark"]')) expect(mark.children).toHaveLength(0)
  })

  it('leaves the canvas’s own accessible name to its aria-label, which outranks any descendant title', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(only('[data-slot="plan-canvas"]').querySelector(':scope > title')).toBeNull()
  })

  it('hides every titled group explicitly, because role=img prunes a subtree only as a SHOULD NOT', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(only('[data-slot="sprint-dates"]').getAttribute('aria-hidden')).toBe('true')
    expect(only('[data-slot="today"]').getAttribute('aria-hidden')).toBe('true')
    for (const title of all('[data-slot="plan-canvas"] title')) {
      expect(title.closest('[aria-hidden="true"]'), title.textContent ?? '').toBeTruthy()
    }
  })

  it('reveals nothing at all when this runtime cannot resolve the plan’s zone', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan({ timezone: 'Mars/Phobos' })} />)
    expect(all('[data-slot="today"]')).toHaveLength(0)
    expect(all('[data-slot="sprint-date"]').length).toBeGreaterThan(1)
  })
})
