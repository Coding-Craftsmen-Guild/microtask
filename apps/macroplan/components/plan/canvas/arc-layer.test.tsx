import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlanCanvas } from './plan-canvas'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  beaconPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_4,
  ITEM_3,
  railedPlan,
  tangledPlan,
} from '../testing/plan-fixture'

const AT = new Date('2026-10-05T09:00:00.000Z')

afterEach(cleanup)

const draw = (plan: ReturnType<typeof atlasPlan>): HTMLElement =>
  render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />).container

const arcs = (container: HTMLElement): readonly Element[] => [
  ...container.querySelectorAll('[data-slot="arc"]'),
]

const edgeOf = (arc: Element): string =>
  `${arc.getAttribute('data-arc-from') ?? '?'}>${arc.getAttribute('data-arc-to') ?? '?'}`

function arcNamed(container: HTMLElement, edge: string): Element {
  const found = arcs(container).find((one) => edgeOf(one) === edge)
  if (found === undefined) throw new Error(`no arc ${edge}; drew [${arcs(container).map(edgeOf).join(', ')}]`)
  return found
}

// One rail, and its second feature waits on its first: exactly one arc, and a same-rail one.
describe('the canvas draws a dependency as an arc', () => {
  it('draws one arc per edge whose both ends are placed', () => {
    expect(arcs(draw(atlasPlan())).map(edgeOf)).toEqual([`${FEATURE_1}>${FEATURE_2}`])
  })

  it('runs it out of what must finish first and into what waits, not the other way round', () => {
    const [arc] = arcs(draw(atlasPlan()))
    expect(arc?.getAttribute('data-arc-from')).toBe(FEATURE_1)
    expect(arc?.getAttribute('data-arc-to')).toBe(FEATURE_2)
  })

  it('gives it a path and an arrowhead, so the direction is visible and not only in the markup', () => {
    const [arc] = arcs(draw(atlasPlan()))
    expect(arc?.getAttribute('d')).toMatch(/^M [\d.]+ [\d.]+ C /)
    expect(arc?.getAttribute('marker-end')).toBe('url(#mp-arrow-same)')
  })

  it('draws the layer under the rails, so bars and nodes sit on top of the lines joining them', () => {
    const container = draw(atlasPlan())
    const slots = [...container.querySelectorAll('[data-slot]')].map((node) =>
      node.getAttribute('data-slot'),
    )
    expect(slots).toContain('arc-layer')
    expect(slots).toContain('rail')
    expect(slots.indexOf('arc-layer')).toBeLessThan(slots.indexOf('rail'))
  })

  it('emits no layer and no arrowhead defs at all for a plan that depends on nothing', () => {
    const container = draw(beaconPlan())
    expect(arcs(container)).toHaveLength(0)
    expect(container.querySelectorAll('[data-slot="arc-layer"]')).toHaveLength(0)
    expect(container.querySelectorAll('defs')).toHaveLength(0)
  })
})

describe('the three kinds an arc is drawn as', () => {
  it('draws a same-rail arc faintly, since rail order already implies most of them', () => {
    const [arc] = arcs(draw(atlasPlan()))
    expect(arc?.getAttribute('data-arc-kind')).toBe('same')
    expect(arc?.getAttribute('class')).toContain('stroke-muted-foreground/40')
  })

  it('draws a cross-rail arc at full weight, which design 3.1 makes the git-graph shape', () => {
    const crossed = railedPlan()
    const container = draw({
      ...crossed,
      features: crossed.features.map((one) =>
        one.id === FEATURE_3 ? { ...one, dependsOn: [FEATURE_1] } : one,
      ),
    })
    const arc = arcNamed(container, `${FEATURE_1}>${FEATURE_3}`)
    expect(arc.getAttribute('data-arc-kind')).toBe('cross')
    expect(arc.getAttribute('marker-end')).toBe('url(#mp-arrow-cross)')
    expect(arc.getAttribute('class')).toContain('stroke-[1.5]')
  })

  it('draws an edge the pass dropped in destructive red and dashed, as a contradiction is drawn', () => {
    const arc = arcNamed(draw(tangledPlan()), `${FEATURE_4}>${FEATURE_3}`)
    expect(arc.getAttribute('data-arc-kind')).toBe('ignored')
    expect(arc.getAttribute('class')).toContain('stroke-destructive')
    expect(arc.getAttribute('class')).toContain('stroke-dasharray:5_3')
    expect(arc.getAttribute('marker-end')).toBe('url(#mp-arrow-ignored)')
  })

  it('omits the two edges of a cycle, whose members the pass gave no span to point at', () => {
    // `tangledPlan`'s Auth rewrite and Billing wait on each other and are both unscheduled, so
    // neither has a bar an arc could reach. The one arc left is the edge rail order set aside.
    expect(arcs(draw(tangledPlan())).map(edgeOf)).toEqual([`${FEATURE_4}>${FEATURE_3}`])
  })

  it('carries no data-label-id, since an arc has two ends that may be in different groups', () => {
    for (const arc of arcs(draw(atlasPlan()))) {
      expect(arc.getAttribute('data-label-id')).toBeNull()
    }
  })
})

describe('a feature that takes no time draws as a diamond', () => {
  const milestonePlan = () => {
    const base = atlasPlan()
    return atlasPlan({
      features: base.features.map((one) =>
        one.id === FEATURE_2 ? { ...one, estimateDays: 0 } : one,
      ),
      items: base.items.filter((one) => one.featureId !== FEATURE_2),
      schedule: {
        ...base.schedule,
        spans: base.schedule.spans
          .filter((one) => one.id !== ITEM_3)
          .map((one) => (one.id === FEATURE_2 ? { ...one, endDay: 5 } : one)),
      },
    })
  }

  it('draws a polygon and never a rect of no width, which is to say never nothing', () => {
    const container = draw(milestonePlan())
    const mark = container.querySelector(`[data-feature-id="${FEATURE_2}"]`)
    expect(mark?.tagName).toBe('polygon')
    expect(mark?.getAttribute('data-milestone')).toBe('true')
    expect(mark?.getAttribute('points')?.split(' ')).toHaveLength(4)
  })

  it('leaves an ordinary feature on the same rail a rect, so the shape is the feature and not the rung', () => {
    const container = draw(milestonePlan())
    expect(container.querySelector(`[data-feature-id="${FEATURE_1}"]`)?.tagName).toBe('rect')
  })

  it('still carries the drag geometry, so a milestone can be dragged like any other mark', () => {
    const container = draw(milestonePlan())
    const mark = container.querySelector(`[data-feature-id="${FEATURE_2}"]`)
    expect(Number(mark?.getAttribute('data-width'))).toBe(0)
    expect(Number(mark?.getAttribute('data-x'))).toBeGreaterThan(0)
    expect(Number(mark?.getAttribute('data-y'))).toBeGreaterThan(0)
  })

  it('lands an arc on the diamond centre, the same y a bar on that rail would have used', () => {
    const container = draw(milestonePlan())
    const arc = arcNamed(container, `${FEATURE_1}>${FEATURE_2}`)
    const mark = container.querySelector(`[data-feature-id="${FEATURE_2}"]`)
    const arrivesAt = Number(arc.getAttribute('d')?.split(' ').at(-1))
    const diamondCentre = Number(mark?.getAttribute('points')?.split(' ')[1]?.split(',')[1])
    // Both read as real numbers first: `toBe(NaN)` passes, so comparing two absent attributes would
    // pass without either value existing.
    expect(arrivesAt).toBeGreaterThan(0)
    expect(diamondCentre).toBeGreaterThan(0)
    expect(arrivesAt).toBe(diamondCentre)
  })

  it('keeps the rail it is on claimed, so the diamond takes its epic hue like a bar', () => {
    const container = draw(milestonePlan())
    expect(container.querySelector(`[data-epic-id="${EPIC_1}"]`)).toBeTruthy()
    expect(
      container.querySelector(`[data-feature-id="${FEATURE_2}"]`)?.getAttribute('style'),
    ).toContain('fill')
  })
})
