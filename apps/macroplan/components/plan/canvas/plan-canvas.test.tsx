import type { Plan } from '@repo/api-client'
import { calendarBands, dayToX, railLayout, rungFor, sprintTicks } from '@repo/canvas'
import type { DayRange } from '@repo/canvas'
import { LIMITS } from '@repo/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  LABEL_1,
  ITEM_2,
  ITEM_3,
  unplacedPlan,
} from '../testing/plan-fixture'
import { PlanCanvas } from './plan-canvas'
import {
  BAR_GAP,
  CANVAS_RANGE,
  CANVAS_SCALE,
  canvasWidth,
  chromeRange,
  insideRail,
  LAYOUT,
} from './view'
import { DRAWS } from './rung-view'

const ORANGE = '#ff8833'

const AT = new Date('2026-10-05T09:00:00.000Z')

const UNRESOLVABLE_ZONE = 'Mars/Phobos'

/** `Platform`'s own hue in the fixture, which every rail in it is painted with. */
const PLATFORM_BLUE = '#3b82f6'

/** What a placed feature nothing has started is drawn as, spelled out so a widening is visible. */
const SOLID = 'fill-chart-3/20 stroke-chart-3 stroke-[1.25]'

/** Only the even quarters carry a wash, so a 60-day view of a 14-day-sprint plan has exactly one. */
const ONE_QUARTER_BAND = 1

/** Each rail paints one transparent band rect to hang its own hairline off. */
const ONE_RAIL_BAND = 1

/** And that hairline, at the bottom of the band. */
const ONE_RAIL_RULE = 1

const ONE_TODAY_LINE = 1

/**
 * What one bar costs the canvas now: its group's `<g>`, and the mark.
 *
 * It was three, the third being the `<text>` beside each bar. Nothing on this canvas is text any
 * more, so the element count grows two per feature and one per item.
 */
const ELEMENTS_PER_BAR = 2

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

/** The same plan with every feature taken out of its group, so only the rail hue is left to take. */
const ungrouped = (hue: string): Plan => {
  const plan = hued(hue)
  return { ...plan, features: plan.features.map((feature) => ({ ...feature, labelId: null })) }
}

/** `Phase 1`'s own colour in the fixture, which `FEATURE_1` is in and `FEATURE_2` is not. */
const PHASE_1 = '#7c3aed'

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
    labelId: null,
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
  // Bars are the Sprint rung's alone now. A bar is a claim about duration, and at fourteen pixels a
  // day most features come out under sixty pixels wide — too narrow to hold a name and too alike to
  // compare — so Quarter says the one thing it can say honestly and draws each feature as a point.
  it('is one quarter, and is the feature rung — which draws points and leaves bars to Sprint', () => {
    expect(CANVAS_RANGE.toDay - CANVAS_RANGE.fromDay).toBe(60)
    expect(rungFor(CANVAS_RANGE)).toBe('feature')
    expect(DRAWS[rungFor(CANVAS_RANGE)]).toEqual({ bars: false, items: false, nodes: true })
    expect(DRAWS.item).toEqual({ bars: true, items: true, nodes: false })
  })

  it('carries no gutter, because the rail names are HTML beside the canvas and not text inside it', () => {
    expect(CANVAS_RANGE).toEqual({ fromDay: 0, toDay: 60 })
    expect(CANVAS_SCALE).toEqual({ pxPerDay: 14, gutter: 0 })
  })

  it('starts the first rail at the very top, since the dates are an HTML row above the canvas', () => {
    expect(LAYOUT.chromeHeight).toBe(0)
  })
})

describe('the geometry the components are kept thin by', () => {
  it('puts a rail’s bar above its marks, both inside one band', () => {
    expect(insideRail(0, 'bar')).toBeLessThan(insideRail(0, 'mark'))
    expect(insideRail(0, 'mark') + LAYOUT.markHeight).toBeLessThanOrEqual(LAYOUT.railHeight)
    expect(insideRail(0, 'bar') + LAYOUT.barHeight).toBeLessThanOrEqual(LAYOUT.railHeight)
  })

  it('measures every part from the rail’s own top, so a second rail is the first one shifted', () => {
    for (const part of ['bar', 'mark'] as const) {
      expect(insideRail(LAYOUT.railHeight, part), part).toBe(LAYOUT.railHeight + insideRail(0, part))
    }
  })

})

describe('PlanCanvas', () => {
  it('is one img-role graphic named for its plan, which is all a screen reader is told', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(slot('plan-canvas')).toHaveLength(1)
  })

  it('sizes itself from the range and its rails alone, not from anything measured', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]')
    expect(numberOf(canvas, 'width')).toBe(dayToX(CANVAS_RANGE.toDay, CANVAS_SCALE))
    expect(numberOf(canvas, 'height')).toBe(LAYOUT.railHeight)
  })

  it('carries no viewBox, so a user unit is a CSS pixel and nothing it draws is ever scaled', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(only('[data-slot="plan-canvas"]').getAttribute('viewBox')).toBeNull()
  })

  it('fills the pane it is laid out in, floored at the width its own range needs', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]') as SVGElement
    expect(canvas.getAttribute('class')).toContain('w-full')
    expect(canvas.style.minWidth).toBe(`${String(canvasWidth(CANVAS_SCALE, CANVAS_RANGE))}px`)
  })

  it('bleeds its grid past the range, so the chrome reaches the edge of a pane nobody measured', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const drawn = sprintTicks(planScreenModel(atlasPlan()), CANVAS_SCALE, CANVAS_RANGE).length
    expect(slot('sprint-tick').length).toBeGreaterThan(drawn)
  })

  it('bleeds no mark, a bar past the range being a bar the plan does not have', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const past = slot('feature-bar').filter(
      (bar) => Number(bar.getAttribute('data-x')) >= canvasWidth(CANVAS_SCALE, CANVAS_RANGE),
    )
    expect(past).toHaveLength(0)
  })

  it('draws one rail group per rail, in the order railLayout gave them', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />)
    const drawn = slot('rail').map((rail) => rail.getAttribute('data-epic-id'))
    expect(drawn).toEqual(railLayout(plan, plan.schedule, CANVAS_SCALE).map((rail) => rail.epicId))
    expect(drawn).toEqual([EPIC_1])
  })

  it('names no rail inside the SVG, and carries the id and hue the HTML column joins by', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    // `RailNames` draws `Platform` beside the canvas; the rail group here is geometry and two keys.
    expect(screen.queryByText('Platform')).toBeNull()
    expect(all('[data-slot="plan-canvas"] text')).toHaveLength(0)
    expect(only('[data-slot="rail"]').getAttribute('data-epic-id')).toBe(EPIC_1)
    expect(only('[data-slot="rail"]').getAttribute('data-colour')).toBe(PLATFORM_BLUE)
  })

  it('leaves a rail whose epicId names no epic unhued, rather than guessing a colour for it', () => {
    const plan = atlasPlan()
    const bare = { ...plan, epics: [], features: plan.features.map((one) => ({ ...one, labelId: null })) }
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(bare)} rung="item" />)
    // `Unclaimed rail` is the names column's sentence now. The canvas answers by painting nothing.
    expect(screen.queryByText('Unclaimed rail')).toBeNull()
    expect(only('[data-slot="rail"]').getAttribute('data-colour')).toBeNull()
    expect(styleOf(barFor(FEATURE_1))).toBe('')
    expect(barFor(FEATURE_1).getAttribute('class')).toBe(SOLID)
  })

  // The fallback is the rail's and not the only source, so an unclaimed rail does not strip the hue
  // off a feature that has one of its own. Both halves of `hueOf` are exercised by one plan here.
  it('still hues a grouped feature on an unclaimed rail, the group being the hue a plan chose', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel({ ...plan, epics: [] })} rung="item" />)
    expect(only('[data-slot="rail"]').getAttribute('data-colour')).toBeNull()
    expect(styleOf(barFor(FEATURE_1))).toContain(PHASE_1)
    expect(styleOf(barFor(FEATURE_2))).toBe('')
  })

  it('takes a bar hue from its epic colour where the feature is in no group at all', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(ungrouped(ORANGE))} rung="item" />)
    expect(barFor(FEATURE_1).getAttribute('style')).toContain(ORANGE)
    expect(barFor(FEATURE_2).getAttribute('style')).toContain(ORANGE)
    expect(markFor(ITEM_1).getAttribute('style')).toContain(ORANGE)
  })

  // The product owner reassigned the hue channel: a group's colour used to be a swatch and never a
  // fill (ADR 0064), because an epic owned hue. A grouped feature now takes its group's colour and an
  // ungrouped one keeps its rail's, which keeps hue single-valued while letting a phase be the thing
  // the eye picks out — a group cutting across rails being exactly what no other channel can say.
  it('takes a bar hue from its group where the feature is in one, the rail being the fallback', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(hued(ORANGE))} rung="item" />)
    expect(barFor(FEATURE_1).getAttribute('data-label-id')).toBe(LABEL_1)
    expect(barFor(FEATURE_1).getAttribute('style')).toContain(PHASE_1)
    expect(barFor(FEATURE_1).getAttribute('style')).not.toContain(ORANGE)
  })

  it('leaves a feature in no group on its rail hue, so the fallback is not a colour nobody chose', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(hued(ORANGE))} rung="item" />)
    expect(barFor(FEATURE_2).getAttribute('data-label-id')).toBeNull()
    expect(barFor(FEATURE_2).getAttribute('style')).toContain(ORANGE)
  })

  it('hues an item mark by its own feature’s group, so a tick matches the bar it sits under', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(hued(ORANGE))} rung="item" />)
    expect(markFor(ITEM_1).getAttribute('style')).toContain(PHASE_1)
  })

  it('draws a node at the rollup rungs in its group hue too, a point being a bar with no width', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(hued(ORANGE))} rung="epic" />)
    expect(barFor(FEATURE_1).getAttribute('style')).toContain(PHASE_1)
  })

  // A bar is a wash inside an outline now, and both are the rail's hue — so the style carries the
  // stroke as well as the fill. What has not changed is the split: every *colour* is inline, because
  // it comes from the plan and Tailwind emits nothing for a class assembled at runtime, and every
  // *treatment* is a class, because those are a closed set.
  it('puts every hue in a style and the treatment in a class, only one of them being a closed set', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(hued(ORANGE))} rung="item" />)
    expect(styleOf(barFor(FEATURE_1))).toContain('fill')
    expect(styleOf(barFor(FEATURE_1))).toContain('stroke')
    expect(styleOf(barFor(FEATURE_1))).toContain('fill-opacity')
    expect(barFor(FEATURE_1).getAttribute('class')).toBe(SOLID)
    expect(barFor(FEATURE_1).getAttribute('class')).not.toContain(ORANGE)
  })

  // The drawn edge is pulled in by a pixel at each end so a run of back-to-back features does not
  // paint as one block. The *geometry* is untouched: `data-x` and `data-width` still carry exactly
  // what `railLayout` computed, because that is what `selection.ts` measures a drag against — a drag
  // answered against the drawn edge would be off by the gap on every drop.
  it('carries the x and width railLayout computed on the data, and recomputes neither', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />)
    for (const rail of railLayout(plan, plan.schedule, CANVAS_SCALE)) {
      for (const bar of rail.bars) {
        expect(numberOf(barFor(bar.id), 'data-x'), bar.id).toBe(bar.x)
        expect(numberOf(barFor(bar.id), 'data-width'), bar.id).toBe(bar.width)
      }
    }
    expect(numberOf(barFor(FEATURE_2), 'data-x')).toBe(dayToX(5, CANVAS_SCALE))
  })

  it('insets the drawn edge by the gap at both ends, so two neighbours never share a boundary', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />)
    for (const rail of railLayout(plan, plan.schedule, CANVAS_SCALE)) {
      for (const bar of rail.bars) {
        expect(numberOf(barFor(bar.id), 'x'), bar.id).toBe(bar.x + BAR_GAP)
        expect(numberOf(barFor(bar.id), 'width'), bar.id).toBe(bar.width - BAR_GAP * 2)
      }
    }
  })

  it('draws every placed item as one mark under its own feature bar', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(slot('item-mark').map((mark) => mark.getAttribute('data-item-id'))).toEqual([
      ITEM_1,
      ITEM_2,
      ITEM_3,
    ])
    expect(numberOf(markFor(ITEM_2), 'y')).toBeGreaterThan(numberOf(barFor(FEATURE_1), 'y'))
  })

  // `endDay` is exclusive and a mark's x comes from its `startDay`, so two consecutive items share a
  // boundary exactly and at their true widths they abut: a feature's four items rendered as one
  // unbroken strip. Each tick is pulled in by a fraction of a pixel at both ends so four read as four.
  it('insets each tick inside its own span, so consecutive items do not read as one strip', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const at = numberOf(markFor(ITEM_2), 'x')
    expect(at).toBeGreaterThan(dayToX(3, CANVAS_SCALE))
    expect(at).toBeLessThan(dayToX(4, CANVAS_SCALE))
  })

  it('leaves real air between one tick and the next, which is what makes them countable', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const placed = slot('item-mark')
      .map((mark) => ({ x: numberOf(mark, 'x'), width: numberOf(mark, 'width') }))
      .sort((left, right) => left.x - right.x)
    for (const mark of placed) expect(mark.width).toBeGreaterThan(0)
    for (const [index, mark] of placed.entries()) {
      const next = placed[index + 1]
      if (next === undefined) continue
      expect(mark.x + mark.width, `tick ${String(index)} touches the next`).toBeLessThan(next.x)
    }
  })
})

describe('a feature the forward pass left off the axis', () => {
  it('gets no mark whatever, for either reason, because its sentence is the tray under the board', () => {
    for (const reason of ['no-estimate', 'in-cycle'] as const) {
      render(<PlanCanvas at={AT} place={null} plan={planScreenModel(unplacedPlan(reason))} rung="item" />)
      expect(document.querySelector(`[data-feature-id="${FEATURE_2}"]`), reason).toBeNull()
      expect(slot('feature-bar'), reason).toHaveLength(1)
      expect(barFor(FEATURE_1), reason).toBeTruthy()
      cleanup()
    }
  })

  it('is not stacked off-axis either, there being no gutter left of day zero to stack it in', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(unplacedPlan('no-estimate'))} rung="item" />)
    expect(all('[data-placed]')).toHaveLength(0)
    expect(slot('unplaced-features')).toHaveLength(0)
    for (const bar of slot('feature-bar')) {
      expect(numberOf(bar, 'x')).toBeGreaterThanOrEqual(dayToX(CANVAS_RANGE.fromDay, CANVAS_SCALE))
    }
  })

  it('leaves no hollow and no dashed mark on the canvas, the two treatments having no bar to land on', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(unplacedPlan('in-cycle'))} rung="item" />)
    const drawn = [...slot('feature-bar'), ...slot('item-mark')].map((one) =>
      one.getAttribute('data-treatment'),
    )
    expect(drawn).toEqual(['solid', 'solid', 'solid'])
  })

  it('drags its own items off with it, so an unplaced item draws no mark either', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(unplacedPlan('no-estimate'))} rung="item" />)
    expect(document.querySelector(`[data-item-id="${ITEM_3}"]`)).toBeNull()
    expect(slot('item-mark')).toHaveLength(2)
  })
})

describe('the chrome the canvas draws around its rails', () => {
  it('washes a quarter band and labels none, the ordinals being an HTML row above the canvas', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const bands = slot('quarter-band')
    expect(bands.length).toBeGreaterThanOrEqual(ONE_QUARTER_BAND)
    expect(nth(bands, 0).tagName).toBe('rect')
    expect(nth(bands, 0).getAttribute('data-quarter')).toBe('2026-4')
    expect(nth(bands, 0).textContent).toBe('')
    expect(numberOf(nth(bands, 0), 'height')).toBe(
      numberOf(only('[data-slot="plan-canvas"]'), 'height'),
    )
  })

  it('washes only every other quarter, so a band edge is visible where nothing is written', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const drawn = calendarBands(atlasPlan(), CANVAS_SCALE, chromeRange(CANVAS_RANGE))
    const keys = drawn.map((band) => `${String(band.year)}-${String(band.quarter)}`)
    const washed = slot('quarter-band').map((band) => band.getAttribute('data-quarter'))
    expect(keys.length).toBeGreaterThan(washed.length)
    expect(keys.filter((_key, index) => index % 2 === 0)).not.toEqual(washed)
    expect(keys.filter((_key, index) => index % 2 === 1)).toEqual(washed)
  })

  it('keeps the wash alternating across a new year, Q4 and the Q1 after it being consecutive', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const washed = slot('quarter-band').map((band) => band.getAttribute('data-quarter'))
    expect(washed).toEqual(['2026-4', '2027-2'])
  })

  it('rules each sprint boundary the full height of the canvas, with no week label and no hover target', () => {
    const plan = atlasPlan()
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />)
    const ticks = slot('sprint-tick')
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.map((tick) => tick.tagName)).toEqual(ticks.map(() => 'line'))
    expect(numberOf(nth(ticks, 1), 'x1')).toBe(dayToX(plan.sprintLengthDays, CANVAS_SCALE))
    expect(numberOf(nth(ticks, 1), 'x1')).toBe(numberOf(nth(ticks, 1), 'x2'))
    expect(numberOf(nth(ticks, 1), 'y1')).toBe(0)
    expect(numberOf(nth(ticks, 1), 'y2')).toBe(
      numberOf(only('[data-slot="plan-canvas"]'), 'height'),
    )
    for (const tick of ticks) expect(tick.querySelector('title')).toBeNull()
  })

  it('writes no calendar date into the permanent chrome, which is what §5 reserves a hover for', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(all('[data-slot="plan-canvas"] text')).toEqual([])
    // Today's `<title>` is the one date in the SVG, and a title draws nothing until it is pointed at.
    expect(all('[data-slot="plan-canvas"] title')).toHaveLength(1)
    expect(only('[data-slot="today"] title').textContent).toContain('2026-10-05')
  })

  it('draws today in the plan’s own zone, at the instant it was handed', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const today = only('[data-slot="today"]')
    expect(today.getAttribute('data-date')).toBe('2026-10-05')
    expect(today.getAttribute('data-day')).toBe('5')
    expect(numberOf(only('[data-slot="today"] line'), 'x1')).toBe(dayToX(5, CANVAS_SCALE))
  })

  it('rounds a weekend onto Monday’s offset, so three dates share one x and only the date differs', () => {
    const seen = ['2026-10-03', '2026-10-04', '2026-10-05'].map((date) => {
      render(<PlanCanvas at={new Date(`${date}T09:00:00.000Z`)} place={null} plan={planScreenModel(atlasPlan())} />)
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
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan({ timezone: UNRESOLVABLE_ZONE }))} rung="item" />)
    expect(slot('today')).toHaveLength(0)
    expect(slot('rail')).toHaveLength(1)
    expect(slot('feature-bar')).toHaveLength(2)
  })
})

describe('the rung the canvas is drawing at', () => {
  it('draws each feature as a node at the epic rung, and no bars and no item marks — §5 row one', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="epic" />)
    expect(DRAWS.epic).toEqual({ bars: false, items: false, nodes: true })
    expect(slot('rail')).toHaveLength(1)
    expect(slot('item-mark')).toHaveLength(0)
    // The nodes keep `data-slot="feature-bar"`, so `selection.ts` rebuilds a layout from the epic rung's
    // markup without being told which rung drew it. What changes is the element: never a `<rect>`.
    expect(slot('feature-bar')).toHaveLength(2)
    expect(slot('feature-bar').map((mark) => mark.tagName)).toEqual(['circle', 'circle'])
  })

  it('carries the same drag geometry on a node as on a bar, so a drag works at every rung', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="epic" />)
    for (const node of slot('feature-bar')) {
      expect(node.getAttribute('data-x')).not.toBeNull()
      expect(node.getAttribute('data-y')).not.toBeNull()
      expect(node.getAttribute('data-width')).not.toBeNull()
      expect(Number(node.getAttribute('data-x'))).not.toBeNaN()
    }
  })

  it('draws bars and marks at the item rung, as it does at the feature rung', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} range={{ fromDay: 0, toDay: 20 }} rung="item" />)
    expect(slot('feature-bar')).toHaveLength(2)
    expect(slot('item-mark')).toHaveLength(3)
  })

  it('draws the rung it is told and never the one its range implies, so a short plan still rolls up', () => {
    // `rangeFor` follows the plan's own span now, so a twelve-day plan at Year zoom yields a range
    // `rungFor` calls `item`. Reading the rung back off the range would draw bars where the reader
    // asked for a rollup, which is why `PlanCanvas` takes the rung as a prop and derives nothing.
    const short: DayRange = { fromDay: 0, toDay: 20 }
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} range={short} rung="epic" />)
    expect(rungFor(short)).toBe('item')
    expect(slot('feature-bar').map((mark) => mark.tagName)).toEqual(['circle', 'circle'])
    expect(slot('item-mark')).toHaveLength(0)
  })
})

// Each test below renders 2 000 item marks through happy-dom, which is intrinsically slow, and
// vitest's 5s default is not calibrated for it: the table's equivalent passes in isolation and timed
// out under `turbo run … --force`, where a dozen packages transform and build at once on one
// machine. The allowance is scoped to this block so a hang anywhere else still fails fast.
const CAP_RENDER_MS = 60_000

describe('the canvas at this product’s own cap', { timeout: CAP_RENDER_MS }, () => {
  it('renders at the 2 000-item cap without exceeding one element per item', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(planAtCap())} rung="item" />)
    const marks = slot('item-mark')
    expect(marks).toHaveLength(LIMITS.itemsPerPlan)
    for (const mark of marks) expect(mark.children).toHaveLength(0)
    expect(slot('feature-bar')).toHaveLength(LIMITS.featuresPerPlan)
  })

  it('draws no wrapper around a mark either, which a count of marks alone would not notice', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(planAtCap())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]')
    const washed = slot('quarter-band').length
    expect(canvas.querySelectorAll('rect')).toHaveLength(
      LIMITS.itemsPerPlan + LIMITS.featuresPerPlan + washed + ONE_RAIL_BAND,
    )
    expect(canvas.querySelectorAll('*').length).toBeLessThan(
      LIMITS.itemsPerPlan + LIMITS.featuresPerPlan * ELEMENTS_PER_BAR + CHROME_ALLOWANCE,
    )
  })

  it('draws all 200 bars and pays no text for any of them, which is 200 elements it used to', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(planAtCap())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]')
    expect(canvas.querySelectorAll('text')).toHaveLength(0)
    expect(slot('feature-group')).toHaveLength(LIMITS.featuresPerPlan)
  })

  it('rules every sprint once and nothing else per sprint, the hover rects having gone with the labels', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(planAtCap())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]')
    const rules = sprintTicks(planAtCap(), CANVAS_SCALE, chromeRange(CANVAS_RANGE)).length
    expect(rules).toBeGreaterThan(1)
    expect(canvas.querySelectorAll('line')).toHaveLength(rules + ONE_RAIL_RULE + ONE_TODAY_LINE)
  })

  it('still draws one rail, because 2 000 items on one rail are still one rail', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(planAtCap())} rung="item" />)
    expect(slot('rail')).toHaveLength(1)
    expect(numberOf(only('[data-slot="plan-canvas"]'), 'width')).toBe(840)
  })
})

describe('what the grid rules at each stop, which follows what the header counts in', () => {
  it('rules month boundaries at the Year stop and draws no sprint rule at all', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="epic" />)
    expect(slot('month-rule').length).toBeGreaterThan(1)
    expect(slot('sprint-tick')).toEqual([])
  })

  it('rules sprint boundaries at the Quarter stop and draws no month rule', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="feature" />)
    expect(slot('sprint-tick').length).toBeGreaterThan(1)
    expect(slot('month-rule')).toEqual([])
  })

  it('rules sprint boundaries at the Sprint stop too', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(slot('sprint-tick').length).toBeGreaterThan(1)
    expect(slot('month-rule')).toEqual([])
  })

  it('puts a month rule on every quarter band edge, so the wash and the rules cannot disagree', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="epic" />)
    const ruled = new Set(slot('month-rule').map((rule) => rule.getAttribute('x1')))
    const bands = calendarBands(atlasPlan(), CANVAS_SCALE, chromeRange(CANVAS_RANGE))
    expect(bands.length).toBeGreaterThan(1)
    for (const band of bands.slice(1)) expect(ruled.has(String(band.x))).toBe(true)
  })

  it('draws each month rule the full height of the canvas, as a sprint rule is drawn', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="epic" />)
    const rules = slot('month-rule')
    expect(rules.map((rule) => rule.tagName)).toEqual(rules.map(() => 'line'))
    expect(numberOf(nth(rules, 1), 'x1')).toBe(numberOf(nth(rules, 1), 'x2'))
    expect(numberOf(nth(rules, 1), 'y1')).toBe(0)
    expect(numberOf(nth(rules, 1), 'y2')).toBe(
      numberOf(only('[data-slot="plan-canvas"]'), 'height'),
    )
  })
})

describe('what the canvas draws, now that it draws no words at all', () => {
  it('draws no text at any stop, every name being in the sidebar, the table or the hover card', () => {
    for (const rung of ['epic', 'feature', 'item'] as const) {
      cleanup()
      render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung={rung} />)
      expect(only('[data-slot="plan-canvas"]').querySelectorAll('text')).toHaveLength(0)
    }
  })

  it('draws no bar label, the slot having gone rather than merely been emptied', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(slot('bar-label')).toEqual([])
  })

  it('still draws a mark for every placed feature, the words going and the geometry staying', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    expect(slot('feature-bar').length).toBeGreaterThan(0)
  })
})

// The canvas must reach the right edge of a pane it was never told the width of, and so must every
// layer in it. The grid was already bled; the rail bands and the hairlines under them were not, so
// each row's structure stopped at the plan's own last day and left the chrome running on past it.
// None of this is about what a browser lays out — `happy-dom` has no layout at all — it is about one
// number reaching every layer, which is what these read.
describe('how far across the pane each layer is drawn', () => {
  it('draws a rail band and its hairline to the bled width, as the grid beside them is drawn', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const bled = canvasWidth(CANVAS_SCALE, chromeRange(CANVAS_RANGE))
    const band = only('[data-slot="rail"] rect')
    const rule = only('[data-slot="rail"] line')
    expect(numberOf(band, 'width')).toBe(bled)
    expect(numberOf(rule, 'x2')).toBe(bled)
  })

  it('bleeds that width past the range, so it is wider than the days the marks use', () => {
    expect(canvasWidth(CANVAS_SCALE, chromeRange(CANVAS_RANGE))).toBeGreaterThan(
      canvasWidth(CANVAS_SCALE, CANVAS_RANGE),
    )
  })

  it('still floors the element at the unbled width, a short plan scrolling no further than it runs', () => {
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung="item" />)
    const canvas = only('[data-slot="plan-canvas"]') as unknown as SVGElement
    expect(canvas.style.minWidth).toBe(`${String(canvasWidth(CANVAS_SCALE, CANVAS_RANGE))}px`)
    expect(canvas.getAttribute('class')).toContain('w-full')
  })
})
