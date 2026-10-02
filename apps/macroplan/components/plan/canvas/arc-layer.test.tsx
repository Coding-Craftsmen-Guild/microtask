import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PlanCanvas } from './plan-canvas'
import { planScreenModel } from '../plan-screen-model'
import { NODE_RADIUS } from './mark-metrics'
import {
  atlasPlan,
  beaconPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_4,
  FEATURE_5,
  ITEM_3,
  railedPlan,
  tangledPlan,
} from '../testing/plan-fixture'

const AT = new Date('2026-10-05T09:00:00.000Z')

afterEach(cleanup)

const draw = (plan: ReturnType<typeof atlasPlan>): HTMLElement =>
  render(<PlanCanvas at={AT} place={null} plan={planScreenModel(plan)} rung="item" />).container

/** `railedPlan` with its third feature waiting on its first, which puts one arc across two rails. */
const crossRail = (): HTMLElement => {
  const crossed = railedPlan()
  return draw({
    ...crossed,
    features: crossed.features.map((one) =>
      one.id === FEATURE_3 ? { ...one, dependsOn: [FEATURE_1] } : one,
    ),
  })
}

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

  it('gives it a path and no arrowhead at all, the curve already running one way', () => {
    const [arc] = arcs(draw(atlasPlan()))
    expect(arc?.getAttribute('d')).toMatch(/^M [\d.]+ [\d.]+ C /)
    expect(arc?.getAttribute('marker-end')).toBeNull()
  })

  it('emits no marker and no defs anywhere, there being no arrowhead left to define', () => {
    const container = draw(atlasPlan())
    expect(container.querySelectorAll('marker')).toHaveLength(0)
    expect(container.querySelectorAll('defs')).toHaveLength(0)
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

  it('emits no layer at all for a plan that depends on nothing', () => {
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
    expect(arc?.getAttribute('class')).toContain('stroke-opacity:0.4')
  })

  it('quiets it with stroke alpha and never with element opacity, which a group selection claims', () => {
    const [arc] = arcs(draw(atlasPlan()))
    expect(arc?.getAttribute('class')).not.toContain('opacity-')
  })

  it('draws a cross-rail arc at full weight, which design 3.1 makes the git-graph shape', () => {
    const arc = arcNamed(crossRail(), `${FEATURE_1}>${FEATURE_3}`)
    expect(arc.getAttribute('data-arc-kind')).toBe('cross')
    expect(arc.getAttribute('class')).toContain('stroke-[1.5]')
  })

  it('draws an edge the pass dropped dashed, and no longer in red, hue now naming a track', () => {
    const arc = arcNamed(draw(tangledPlan()), `${FEATURE_4}>${FEATURE_3}`)
    expect(arc.getAttribute('data-arc-kind')).toBe('ignored')
    expect(arc.getAttribute('class')).toContain('stroke-dasharray:5_3')
    expect(arc.getAttribute('class')).not.toContain('stroke-destructive')
  })

  it('omits the two edges of a cycle, whose members the pass gave no span to point at', () => {
    // `tangledPlan`'s Auth rewrite and Billing wait on each other and are both unscheduled, so
    // neither has a bar an arc could reach. The one arc left is the edge rail order set aside.
    expect(arcs(draw(tangledPlan())).map(edgeOf)).toEqual([`${FEATURE_4}>${FEATURE_3}`])
  })

  it('carries the group of the feature it leaves, so a chosen group keeps its own outgoing arcs lit', () => {
    const plan = atlasPlan()
    const from = plan.features.find((one) => one.id === FEATURE_1)
    expect(from?.labelId).not.toBeNull()
    const [arc] = arcs(draw(plan))
    expect(arc?.getAttribute('data-arc-from')).toBe(FEATURE_1)
    expect(arc?.getAttribute('data-label-id')).toBe(from?.labelId)
  })

  it('carries no data-label-id for an arc leaving a feature in no group, rather than an empty one', () => {
    const plan = atlasPlan()
    const container = draw({
      ...plan,
      features: plan.features.map((one) => (one.id === FEATURE_1 ? { ...one, labelId: null } : one)),
    })
    expect(arcs(container)[0]?.getAttribute('data-label-id')).toBeNull()
  })
})

describe('the hue an arc takes, which is the track it leaves', () => {
  it('strokes in the rail colour of the feature it runs out of, so a thread is followable', () => {
    const hue = railedPlan().epics.find((epic) => epic.id === EPIC_1)?.colour
    expect(hue).toBeTruthy()
    const arc = arcNamed(crossRail(), `${FEATURE_1}>${FEATURE_3}`)
    expect((arc as SVGElement).style.stroke).toBe(hue)
  })

  it('takes the source rail and never the target, two ends being one arc and one colour', () => {
    const target = railedPlan().epics.find((epic) => epic.id !== EPIC_1)?.colour
    const arc = arcNamed(crossRail(), `${FEATURE_1}>${FEATURE_3}`)
    expect((arc as SVGElement).style.stroke).not.toBe(target)
  })

  // A stored epic always carries a colour, so `RailBox.colour` is `null` for exactly one reason: the
  // rail's `epicId` names no epic in the plan. `railedPlan` has such a rail, and `FEATURE_5` is on it,
  // so the fallback is reached by making something wait on that feature rather than by nulling a field
  // the wire type does not admit.
  it('falls back to the muted stroke for a rail no epic claims, rather than inventing a colour', () => {
    const unclaimed = railedPlan()
    const container = draw({
      ...unclaimed,
      features: unclaimed.features.map((one) =>
        one.id === FEATURE_3 ? { ...one, dependsOn: [FEATURE_5] } : one,
      ),
    })
    const arc = arcNamed(container, `${FEATURE_5}>${FEATURE_3}`)
    expect(arc.getAttribute('data-arc-from')).toBe(FEATURE_5)
    expect((arc as SVGElement).style.stroke).toBe('')
    expect(arc.getAttribute('class')).toContain('stroke-muted-foreground')
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

  // These are drawn at the Sprint stop, where a feature is a **rule between two diamonds**. A
  // milestone takes no time, so the rule has no length and the two diamonds land on one another: the
  // shape is a diamond, which is the thing this case has always been about, reached by the geometry
  // rather than by a branch. The mark is the group, because a line is four elements and none of them
  // is the mark — `canvas/line-css.ts` carries why the slot sits where it does.
  it('draws a diamond at each end and never a rule of no width, which is to say never nothing', () => {
    const container = draw(milestonePlan())
    const mark = container.querySelector(`[data-feature-id="${FEATURE_2}"]`)
    expect(mark?.tagName).toBe('g')
    expect(mark?.getAttribute('data-milestone')).toBe('true')
    const diamonds = [...(mark?.querySelectorAll('polygon') ?? [])]
    expect(diamonds).toHaveLength(2)
    for (const diamond of diamonds) {
      expect(diamond.getAttribute('points')?.split(' ')).toHaveLength(4)
    }
    expect(diamonds[0]?.getAttribute('points')).toBe(diamonds[1]?.getAttribute('points'))
  })

  it('leaves an ordinary feature on the same rail a rule with two ends apart', () => {
    const container = draw(milestonePlan())
    const mark = container.querySelector(`[data-feature-id="${FEATURE_1}"]`)
    expect(mark?.getAttribute('data-milestone')).toBeNull()
    const rule = mark?.querySelector('line')
    expect(Number(rule?.getAttribute('x2'))).toBeGreaterThan(Number(rule?.getAttribute('x1')))
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
    const diamondCentre = Number(
      mark?.querySelector('polygon')?.getAttribute('points')?.split(' ')[1]?.split(',')[1],
    )
    // Both read as real numbers first: `toBe(NaN)` passes, so comparing two absent attributes would
    // pass without either value existing.
    expect(arrivesAt).toBeGreaterThan(0)
    expect(diamondCentre).toBeGreaterThan(0)
    expect(arrivesAt).toBe(diamondCentre)
  })

  // The hue reaches a line through `--mark-hue` on the group rather than as an inline `fill`, because
  // a line is four shapes each wanting it in a different channel and an inline value would have to be
  // written onto each while the class beside it set the same property and won. It is still an inline
  // value and still never a class, which is the rule `treatments.ts` states.
  it('keeps the rail it is on claimed, so the diamond takes its epic hue like a bar', () => {
    const container = draw(milestonePlan())
    expect(container.querySelector(`[data-epic-id="${EPIC_1}"]`)).toBeTruthy()
    const style = container.querySelector(`[data-feature-id="${FEATURE_2}"]`)?.getAttribute('style')
    expect(style).toContain('--mark-hue')
    expect(style).toContain('#')
  })
})

// The defect this fixes, in the terms a reader saw it in: at Year and Quarter zoom every dependency
// *within* a rail was missing. `arcLayout` leaves a bar at `x + width` and arrives at the next one's
// `x`, and two features along one rail touch — one ends the day the next begins — so both ends of the
// curve were the same point. A cubic with one point for both ends is a small symmetric loop, and it
// is drawn in the layer *under* the marks, so it came out entirely hidden behind them.
describe('an arc between two features that touch, at the stops that draw a point', () => {
  const sameRail = (rung: 'epic' | 'feature' | 'item') =>
    render(<PlanCanvas at={AT} place={null} plan={planScreenModel(atlasPlan())} rung={rung} />).container

  const ends = (arc: Element): { readonly from: number; readonly to: number } => {
    const read = (arc.getAttribute('d') ?? '').split(' ')
    return { from: Number(read[1]), to: Number(read.at(-2)) }
  }

  it('leaves one point and arrives at the next, rather than leaving and arriving at one x', () => {
    for (const rung of ['epic', 'feature'] as const) {
      cleanup()
      const { from, to } = ends(arcNamed(sameRail(rung), `${FEATURE_1}>${FEATURE_2}`))
      expect(from, rung).toBeGreaterThan(0)
      expect(to, rung).toBeGreaterThan(from)
    }
  })

  // Anchored on the drawn mark and not on the span: the arc leaves the right edge of one dot and
  // arrives at the left edge of the other, so it touches both and overlaps neither.
  it('anchors on the edges of the two points it joins', () => {
    const container = sameRail('feature')
    const centreOf = (id: string): number =>
      Number(container.querySelector(`circle[data-feature-id="${id}"]`)?.getAttribute('cx'))
    const { from, to } = ends(arcNamed(container, `${FEATURE_1}>${FEATURE_2}`))
    expect(from).toBe(centreOf(FEATURE_1) + NODE_RADIUS)
    expect(to).toBe(centreOf(FEATURE_2) - NODE_RADIUS)
  })

  // The Sprint stop draws the span, so there the span is still what an arc is anchored on.
  it('still anchors on the span at the stop that draws one', () => {
    const container = sameRail('item')
    const line = container.querySelector(`[data-feature-id="${FEATURE_1}"]`)
    const { from } = ends(arcNamed(container, `${FEATURE_1}>${FEATURE_2}`))
    expect(from).toBe(Number(line?.getAttribute('data-x')) + Number(line?.getAttribute('data-width')))
  })
})
