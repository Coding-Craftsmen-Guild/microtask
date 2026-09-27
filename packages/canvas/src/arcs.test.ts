import { schedule as forwardPass } from '@repo/schedule'
import { describe, expect, it } from 'vitest'
import { ARC_LIFT, ARC_MIN_REACH, arcLayout } from './arcs.js'
import type { ArcMetrics, DependencyArc } from './arcs.js'
import type { CanvasPlan, CanvasSchedule } from './plan.js'
import { railLayout } from './rails.js'
import { dayToX, scaleFor } from './scale.js'

const E1 = 'epic-1'
const E2 = 'epic-2'
const E3 = 'epic-3'
const E4 = 'epic-4'

const A = 'feature-a'
const B = 'feature-b'
const C = 'feature-c'
const MS = 'feature-milestone'
const D = 'feature-d'
const NOEST = 'feature-unestimated'
const P = 'feature-p-earlier'
const Q = 'feature-q-later'
const NOPE = 'feature-nobody-declared'

const SCALE = scaleFor({ pxPerDay: 8, gutter: 120 })

const METRICS: ArcMetrics = { chromeHeight: 46, railHeight: 58, barTop: 16, barHeight: 18 }

const CENTRE_OF_FIRST_RAIL = 71

const feature = (
  id: string,
  epicId: string,
  position: number,
  estimateDays: number | null,
): CanvasPlan['features'][number] => ({ id, epicId, position, estimateDays, pinSprint: null, dependsOn: [] })

const waiting = (
  on: readonly string[],
  base: CanvasPlan['features'][number],
): CanvasPlan['features'][number] => ({ ...base, dependsOn: on })

const PLAN: CanvasPlan = {
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [
    { id: E1, railOrder: 0, colour: '#ff8833' },
    { id: E2, railOrder: 1, colour: '#3388ff' },
    { id: E3, railOrder: 2, colour: '#33ff88' },
    { id: E4, railOrder: 3, colour: '#8833ff' },
  ],
  features: [
    waiting([A, NOPE], feature(C, E2, 0, 3)),
    waiting([A], feature(B, E1, 1, 2)),
    feature(A, E1, 0, 4),
    waiting([D], feature(MS, E3, 2, 0)),
    waiting([NOEST], feature(D, E3, 1, 2)),
    feature(NOEST, E3, 0, null),
    waiting([Q], feature(P, E4, 0, 2)),
    feature(Q, E4, 1, 2),
  ],
  items: [],
}

const PASS = forwardPass(PLAN)

const WIRE: CanvasSchedule = {
  spans: [...PASS.days].map(([id, span]) => ({ id, startDay: span.startDay, endDay: span.endDay })),
}

const arcs = (): readonly DependencyArc[] =>
  arcLayout({
    plan: PLAN,
    rails: railLayout(PLAN, WIRE, SCALE),
    metrics: METRICS,
    ignoredEdges: PASS.ignoredEdges,
  })

const edges = (): readonly string[] => arcs().map((arc) => `${arc.fromId}->${arc.toId}`)

function arcFor(fromId: string, toId: string): DependencyArc {
  const found = arcs().find((arc) => arc.fromId === fromId && arc.toId === toId)
  if (found === undefined) throw new Error(`no arc was laid out from ${fromId} to ${toId}`)
  return found
}

describe('arcLayout turns every dependency edge into a drawable curve', () => {
  it('runs an arc the way the work does: out of what must finish first, into what waits', () => {
    const arc = arcFor(A, C)
    expect(arc.fromId).toBe(A)
    expect(arc.toId).toBe(C)
  })

  it('leaves the end of the depended-on bar and arrives at the start of the one that waits', () => {
    const arc = arcFor(A, C)
    expect(arc.fromX).toBe(dayToX(4, SCALE))
    expect(arc.toX).toBe(dayToX(4, SCALE))
  })

  it('puts each end at the vertical middle of the bar on its own rail band', () => {
    expect(arcFor(A, C).fromY).toBe(CENTRE_OF_FIRST_RAIL)
    expect(arcFor(A, C).toY).toBe(CENTRE_OF_FIRST_RAIL + METRICS.railHeight)
    expect(arcFor(Q, P).fromY).toBe(CENTRE_OF_FIRST_RAIL + 3 * METRICS.railHeight)
  })

  it('flags an arc that couples two rails, which is the one design 3.1 calls the git-graph shape', () => {
    expect(arcFor(A, C).crossesRails).toBe(true)
  })

  it('leaves a same-rail arc unflagged, since rail order usually already implies it', () => {
    expect(arcFor(A, B).crossesRails).toBe(false)
    expect(arcFor(D, MS).crossesRails).toBe(false)
  })

  it('bows a same-rail arc above the bars, so it is not a flat line lying along the rail', () => {
    const arc = arcFor(A, B)
    expect(arc.fromY).toBe(arc.toY)
    expect(arc.path).toBe(`M 152 71 C 170 ${String(71 - ARC_LIFT)} 134 ${String(71 - ARC_LIFT)} 152 71`)
  })

  it('does not bow a cross-rail arc, whose two ends already differ in y', () => {
    expect(arcFor(A, C).path).toBe('M 152 71 C 170 71 134 129 152 129')
  })

  it('reaches sideways by the floor when two bars touch, so a zero-length curve is still a curve', () => {
    const arc = arcFor(D, MS)
    expect(arc.fromX).toBe(arc.toX)
    expect(arc.path).toContain(`C ${String(arc.fromX + ARC_MIN_REACH)} `)
  })

  it('still draws an arc into a milestone, which has a real position and no width', () => {
    const arc = arcFor(D, MS)
    expect(arc.toX).toBe(dayToX(2, SCALE))
  })

  it('omits an edge whose far end was never placed, rather than pointing an arc at nothing', () => {
    expect(edges()).not.toContain(`${NOEST}->${D}`)
  })

  it('omits an edge naming a feature the plan does not hold, with nothing written to check for it', () => {
    expect(edges()).not.toContain(`${NOPE}->${C}`)
  })

  it('flags the edge the pass dropped to break a rail-versus-dependency deadlock', () => {
    expect(PASS.ignoredEdges).toEqual([{ featureId: P, dependsOnId: Q }])
    expect(arcFor(Q, P).ignored).toBe(true)
  })

  it('leaves every honoured edge unflagged, so a cut edge is the only one drawn distinctly', () => {
    expect(arcs().filter((arc) => arc.ignored).map((arc) => arc.toId)).toEqual([P])
  })

  it('draws a dropped edge running backwards, which is the shape a cut cycle has', () => {
    const arc = arcFor(Q, P)
    expect(arc.toX).toBeLessThan(arc.fromX)
  })

  it('answers the edges in plan.features order and then dependsOn order', () => {
    expect(edges()).toEqual([`${A}->${C}`, `${A}->${B}`, `${D}->${MS}`, `${Q}->${P}`])
  })

  it('answers nothing for a plan with no dependencies at all', () => {
    const plain: CanvasPlan = { ...PLAN, features: [feature(A, E1, 0, 4)] }
    const wire: CanvasSchedule = { spans: [{ id: A, startDay: 0, endDay: 4 }] }
    expect(arcLayout({ plan: plain, rails: railLayout(plain, wire, SCALE), metrics: METRICS, ignoredEdges: [] })).toEqual([])
  })

  it('mutates neither the plan nor the rails it was handed', () => {
    const rails = railLayout(PLAN, WIRE, SCALE)
    const before = JSON.stringify({ plan: PLAN, rails })
    arcLayout({ plan: PLAN, rails, metrics: METRICS, ignoredEdges: PASS.ignoredEdges })
    expect(JSON.stringify({ plan: PLAN, rails })).toBe(before)
  })
})
