import type { Plan } from '@repo/api-client'
import { dayToX, railLayout, rungFor, sprintTicks } from '@repo/canvas'
import type { DayRange } from '@repo/canvas'
import { LIMITS } from '@repo/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, ITEM_1, ITEM_2, ITEM_3 } from '../testing/plan-fixture'
import { PlanCanvas } from './plan-canvas'
import { CANVAS_RANGE, CANVAS_SCALE, DRAWS, insideRail, LAYOUT, stubX, type RailFrame } from './view'

const ORANGE = '#ff8833'

const AT = new Date('2026-10-05T09:00:00.000Z')

const UNRESOLVABLE_ZONE = 'Mars/Phobos'

const ONE_QUARTER_BAND = 1

const CHROME_ALLOWANCE = 100

const all = (selector: string): readonly Element[] => [...document.querySelectorAll(selector)]

const only = (selector: string): Element => {
  const found = document.querySelector(selector)
  if (found === null) throw new Error(`nothing matched ${selector}`)
  return found
}

const slot = (name: string): readonly Element[] => all(`[data-slot="${name}"]`)

const barFor = (featureId: string): Element =>
  only(`[data-slot="feature-bar"][data-feature-id="${featureId}"]`)

const markFor = (itemId: string): Element => only(`[data-slot="item-mark"][data-item-id="${itemId}"]`)

const numberOf = (element: Element, attribute: string): number =>
  Number(element.getAttribute(attribute))

const styleOf = (element: Element): string => element.getAttribute('style') ?? ''

const nth = (list: readonly Element[], index: number): Element => {
  const found = list[index]
  if (found === undefined) throw new Error(`no element at index ${String(index)}`)
  return found
}

const hued = (hue: string): Plan => {
  const plan = atlasPlan()
  return { ...plan, epics: plan.epics.map((epic) => ({ ...epic, colour: hue })) }
}

const withoutFeatureTwo = (reason: 'no-estimate' | 'in-cycle'): Plan => {
  const plan = hued(ORANGE)
  return {
    ...plan,
    features: plan.features.map((one) =>
      one.id === FEATURE_2 ? { ...one, estimateDays: null } : one,
    ),
    schedule: {
      ...plan.schedule,
      spans: plan.schedule.spans.filter((one) => one.id !== FEATURE_2 && one.id !== ITEM_3),
      unscheduled: [
        { id: FEATURE_2, reason },
        { id: ITEM_3, reason },
      ],
    },
  }
}

const stamps = { createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }

const ITEMS_PER_FEATURE = LIMITS.itemsPerPlan / LIMITS.featuresPerPlan

const cappedFeatures = () =>
  Array.from({ length: LIMITS.featuresPerPlan }, (_, index) => ({
    id: `f-${String(index)}`,
    epicId: EPIC_1,
    name: `Feature ${String(index)}`,
    position: index,
    estimateDays: ITEMS_PER_FEATURE,
    pinSprint: null,
    dependsOn: [],
    ...stamps,
  }))

const cappedItems = () =>
  Array.from({ length: LIMITS.itemsPerPlan }, (_, index) => ({
    id: `i-${String(index)}`,
    featureId: `f-${String(Math.floor(index / ITEMS_PER_FEATURE))}`,
    name: `Item ${String(index)}`,
    position: index % ITEMS_PER_FEATURE,
    estimateDays: 1,
    linkedTaskId: null,
    ...stamps,
  }))

const cappedSpans = () => [
  ...cappedFeatures().map((one, index) => ({
    id: one.id,
    startDay: index * ITEMS_PER_FEATURE,
    endDay: (index + 1) * ITEMS_PER_FEATURE,
  })),
  ...cappedItems().map((one, index) => ({ id: one.id, startDay: index, endDay: index + 1 })),
]

const planAtCap = (): Plan => {
  const plan = hued(ORANGE)
  return {
    ...plan,
    features: cappedFeatures(),
    items: cappedItems(),
    schedule: { ...plan.schedule, spans: cappedSpans() },
  }
}

describe('the range the admin canvas draws', () => {
  it('is one quarter, and is the feature rung — an epic-rung canvas draws no bars at all', () => {
    expect(CANVAS_RANGE.toDay - CANVAS_RANGE.fromDay).toBe(60)
    expect(rungFor(CANVAS_RANGE)).toBe('feature')
    expect(DRAWS[rungFor(CANVAS_RANGE)]).toEqual({ bars: true, items: true })
  })

  it('is a constant and never a measurement, because a server component has no viewport', () => {
    expect(CANVAS_RANGE).toEqual({ fromDay: 0, toDay: 60 })
    expect(CANVAS_SCALE).toEqual({ pxPerDay: 14, gutter: 160 })
  })
})

describe('the geometry the components are kept thin by', () => {
  const frame: RailFrame = {
    marks: new Map(),
    treatments: new Map(),
    draws: DRAWS.feature,
    labelX: 0,
    axisX: dayToX(0, CANVAS_SCALE),
  }

  it('stacks each off-axis stub leftward by its own width plus a gap, so none overlaps a neighbour', () => {
    const step = LAYOUT.stubWidth + LAYOUT.stubGap
    expect([0, 1, 2].map((index) => frame.axisX - stubX(frame, index))).toEqual(
      [1, 2, 3].map((place) => LAYOUT.labelInset + place * step),
    )
    expect(step).toBeGreaterThan(LAYOUT.stubWidth)
  })

  it('puts a rail’s label above its bars and its marks below them, all inside one band', () => {
    expect(insideRail(0, 'label')).toBeLessThan(insideRail(0, 'bar'))
    expect(insideRail(0, 'bar')).toBeLessThan(insideRail(0, 'mark'))
    expect(insideRail(0, 'mark') + LAYOUT.markHeight).toBeLessThanOrEqual(LAYOUT.railHeight)
    expect(insideRail(0, 'bar') + LAYOUT.barHeight).toBeLessThanOrEqual(LAYOUT.railHeight)
  })

  it('measures every part from the rail’s own top, so a second rail is the first one shifted', () => {
    for (const part of ['label', 'bar', 'mark'] as const) {
      expect(insideRail(LAYOUT.railHeight, part), part).toBe(LAYOUT.railHeight + insideRail(0, part))
    }
  })
})

describe('PlanCanvas', () => {
  it('is one img-role graphic named for its plan, which is all a screen reader is told', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(slot('plan-canvas')).toHaveLength(1)
  })

  it('sizes its viewBox from the gutter, the range and the rails, not from anything measured', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const canvas = only('[data-slot="plan-canvas"]')
    expect(canvas.getAttribute('viewBox')).toBe('0 0 1000 104')
    expect(canvas.getAttribute('width')).toBe('1000')
    expect(canvas.getAttribute('height')).toBe('104')
  })

  it('draws one rail group per rail, in the order railLayout gave them', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} plan={plan} />)
    const drawn = slot('rail').map((rail) => rail.getAttribute('data-epic-id'))
    expect(drawn).toEqual(railLayout(plan, plan.schedule, CANVAS_SCALE).map((rail) => rail.epicId))
    expect(drawn).toEqual([EPIC_1])
  })

  it('joins each rail back to the plan for its name, which a RailBox does not carry', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(screen.queryByText('Unclaimed rail')).toBeNull()
  })

  it('says so, rather than guessing, for a rail whose epicId names no epic in the plan', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} plan={{ ...plan, epics: [] }} />)
    expect(screen.getByText('Unclaimed rail')).toBeTruthy()
    expect(styleOf(barFor(FEATURE_1))).toBe('')
    expect(barFor(FEATURE_1).getAttribute('class')).toContain('fill-muted-foreground')
  })

  it('takes each bar hue from its epic colour, which the API validated and the canvas never chooses', () => {
    render(<PlanCanvas at={AT} plan={hued(ORANGE)} />)
    expect(barFor(FEATURE_1).getAttribute('style')).toContain(ORANGE)
    expect(barFor(FEATURE_2).getAttribute('style')).toContain(ORANGE)
    expect(markFor(ITEM_1).getAttribute('style')).toContain(ORANGE)
  })

  it('puts the hue in a style and the treatment in a class, because only one of them is a closed set', () => {
    render(<PlanCanvas at={AT} plan={hued(ORANGE)} />)
    expect(styleOf(barFor(FEATURE_1))).toContain('fill')
    expect(styleOf(barFor(FEATURE_1))).not.toContain('stroke')
    expect(barFor(FEATURE_1).getAttribute('class')).toBe('fill-muted-foreground stroke-none')
    expect(barFor(FEATURE_1).getAttribute('class')).not.toContain(ORANGE)
  })

  it('places every bar at the x and width railLayout computed, and recomputes neither', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} plan={plan} />)
    for (const rail of railLayout(plan, plan.schedule, CANVAS_SCALE)) {
      for (const bar of rail.bars) {
        expect(numberOf(barFor(bar.id), 'x'), bar.id).toBe(bar.x)
        expect(numberOf(barFor(bar.id), 'width'), bar.id).toBe(bar.width)
      }
    }
    expect(numberOf(barFor(FEATURE_2), 'x')).toBe(dayToX(5, CANVAS_SCALE))
  })

  it('draws every placed item as one mark under its own feature bar', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(slot('item-mark').map((mark) => mark.getAttribute('data-item-id'))).toEqual([
      ITEM_1,
      ITEM_2,
      ITEM_3,
    ])
    expect(numberOf(markFor(ITEM_2), 'x')).toBe(dayToX(3, CANVAS_SCALE))
    expect(numberOf(markFor(ITEM_2), 'y')).toBeGreaterThan(numberOf(barFor(FEATURE_1), 'y'))
  })

  it('draws a no-estimate feature hollow, so an unsized bar is not a zero-length one', () => {
    render(<PlanCanvas at={AT} plan={withoutFeatureTwo('no-estimate')} />)
    const unsized = barFor(FEATURE_2)
    expect(unsized.getAttribute('data-treatment')).toBe('hollow')
    expect(numberOf(unsized, 'width')).toBeGreaterThan(0)
    expect(unsized.getAttribute('class')).toBe('fill-none stroke-muted-foreground stroke-2')
    expect(styleOf(unsized)).toContain('stroke')
    expect(styleOf(unsized)).toContain(ORANGE)
  })

  it('keeps an unsized feature off the axis, because it has no day to be drawn at', () => {
    render(<PlanCanvas at={AT} plan={withoutFeatureTwo('no-estimate')} />)
    expect(barFor(FEATURE_2).getAttribute('data-placed')).toBe('false')
    expect(barFor(FEATURE_1).getAttribute('data-placed')).toBeNull()
    expect(numberOf(barFor(FEATURE_2), 'x')).toBeLessThan(dayToX(CANVAS_RANGE.fromDay, CANVAS_SCALE))
  })

  it('draws a feature caught in a cycle as §5’s dashed red outline, not as an unsized one', () => {
    render(<PlanCanvas at={AT} plan={withoutFeatureTwo('in-cycle')} />)
    const contradicted = barFor(FEATURE_2)
    expect(contradicted.getAttribute('data-treatment')).toBe('contradicted')
    expect(contradicted.getAttribute('class')).toContain('stroke-destructive')
    expect(contradicted.getAttribute('class')).toContain('[stroke-dasharray:5_3]')
    expect(contradicted.getAttribute('style')).toContain(ORANGE)
  })

  it('draws no mark for an item the forward pass never placed', () => {
    render(<PlanCanvas at={AT} plan={withoutFeatureTwo('no-estimate')} />)
    expect(document.querySelector(`[data-item-id="${ITEM_3}"]`)).toBeNull()
    expect(slot('item-mark')).toHaveLength(2)
  })
})

describe('the chrome the canvas draws around its rails', () => {
  it('labels each quarter band with the ordinal quarterBands gave it, never a month', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    expect(slot('quarter-band').map((band) => band.textContent)).toEqual(['Q1'])
  })

  it('clamps a band label into the viewport, because the viewBox clips a rect and not a text', () => {
    const scrolled: DayRange = { fromDay: 30, toDay: 90 }
    render(<PlanCanvas at={AT} plan={atlasPlan()} range={scrolled} />)
    const labels = all('[data-slot="quarter-band"] text')
    expect(labels.map((label) => label.textContent)).toEqual(['Q1', 'Q2'])
    expect(numberOf(nth(labels, 0), 'x')).toBe(dayToX(30, CANVAS_SCALE) + LAYOUT.labelInset)
    expect(numberOf(nth(labels, 1), 'x')).toBe(dayToX(84, CANVAS_SCALE) + LAYOUT.labelInset)
  })

  it('labels sprint ticks in weeks and puts no calendar date on the permanent chrome', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const ticks = slot('sprint-tick')
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks[0]?.textContent).toBe('W1–3')
    const drawn = all('[data-slot="plan-canvas"] text')
    expect(drawn.length).toBeGreaterThan(ticks.length)
    for (const text of drawn) expect(text.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it('draws today in the plan’s own zone, at the instant it was handed', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} />)
    const today = only('[data-slot="today"]')
    expect(today.getAttribute('data-date')).toBe('2026-10-05')
    expect(today.getAttribute('data-day')).toBe('5')
    expect(numberOf(only('[data-slot="today"] line'), 'x1')).toBe(dayToX(5, CANVAS_SCALE))
  })

  it('rounds a weekend onto Monday’s offset, so three dates share one x and only the date differs', () => {
    const seen = ['2026-10-03', '2026-10-04', '2026-10-05'].map((date) => {
      render(<PlanCanvas at={new Date(`${date}T09:00:00.000Z`)} plan={atlasPlan()} />)
      const today = only('[data-slot="today"]')
      const read = {
        date: today.getAttribute('data-date'),
        day: today.getAttribute('data-day'),
        x: numberOf(only('[data-slot="today"] line'), 'x1'),
      }
      cleanup()
      return read
    })
    expect(seen.map((one) => one.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05'])
    expect(seen.map((one) => one.day)).toEqual(['5', '5', '5'])
    expect(seen.map((one) => one.x)).toEqual([5, 5, 5].map((day) => dayToX(day, CANVAS_SCALE)))
  })

  it('draws the plan and no today line at all when this runtime cannot resolve its zone', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan({ timezone: UNRESOLVABLE_ZONE })} />)
    expect(slot('today')).toHaveLength(0)
    expect(slot('rail')).toHaveLength(1)
    expect(slot('feature-bar')).toHaveLength(2)
  })
})

describe('the rung the canvas is drawing at', () => {
  it('draws rails and their names at the epic rung, and no bars — §5 puts nodes and arcs there', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} range={{ fromDay: 0, toDay: 61 }} />)
    expect(rungFor({ fromDay: 0, toDay: 61 })).toBe('epic')
    expect(slot('rail')).toHaveLength(1)
    expect(screen.getByText('Platform')).toBeTruthy()
    expect(slot('feature-bar')).toHaveLength(0)
    expect(slot('item-mark')).toHaveLength(0)
  })

  it('draws bars and marks at the item rung, as it does at the feature rung', () => {
    render(<PlanCanvas at={AT} plan={atlasPlan()} range={{ fromDay: 0, toDay: 20 }} />)
    expect(rungFor({ fromDay: 0, toDay: 20 })).toBe('item')
    expect(slot('feature-bar')).toHaveLength(2)
    expect(slot('item-mark')).toHaveLength(3)
  })
})

describe('the canvas at this product’s own cap', () => {
  it('renders at the 2 000-item cap without exceeding one element per item', () => {
    render(<PlanCanvas at={AT} plan={planAtCap()} />)
    const marks = slot('item-mark')
    expect(marks).toHaveLength(LIMITS.itemsPerPlan)
    for (const mark of marks) expect(mark.children).toHaveLength(0)
    expect(slot('feature-bar')).toHaveLength(LIMITS.featuresPerPlan)
  })

  it('draws no wrapper around a mark either, which a count of marks alone would not notice', () => {
    render(<PlanCanvas at={AT} plan={planAtCap()} />)
    const canvas = only('[data-slot="plan-canvas"]')
    const hoverTargets = sprintTicks(planAtCap(), CANVAS_SCALE, CANVAS_RANGE).length
    expect(hoverTargets).toBeGreaterThan(1)
    expect(canvas.querySelectorAll('rect')).toHaveLength(
      LIMITS.itemsPerPlan + LIMITS.featuresPerPlan + ONE_QUARTER_BAND + hoverTargets,
    )
    expect(canvas.querySelectorAll('*').length).toBeLessThan(
      LIMITS.itemsPerPlan + LIMITS.featuresPerPlan + CHROME_ALLOWANCE,
    )
  })

  it('still draws one rail, because 2 000 items on one rail are still one rail', () => {
    render(<PlanCanvas at={AT} plan={planAtCap()} />)
    expect(slot('rail')).toHaveLength(1)
    expect(only('[data-slot="plan-canvas"]').getAttribute('viewBox')).toBe('0 0 1000 104')
  })
})
