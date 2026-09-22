import { describe, expect, it } from 'vitest'
import type { PlanStructure, ScheduleFeature, ScheduleItem, ScheduleResult } from './structure.js'
import { schedule } from './forward-pass.js'

interface Draft {
  readonly id: string
  readonly epicId?: string
  readonly position?: number
  readonly estimateDays?: number | null
  readonly pinSprint?: number | null
  readonly dependsOn?: readonly string[]
}

const feature = (draft: Draft): ScheduleFeature => ({
  id: draft.id,
  epicId: draft.epicId ?? 'alpha',
  position: draft.position ?? 0,
  estimateDays: draft.estimateDays === undefined ? null : draft.estimateDays,
  pinSprint: draft.pinSprint === undefined ? null : draft.pinSprint,
  dependsOn: draft.dependsOn ?? [],
})

const item = (
  id: string,
  featureId: string,
  position: number,
  estimateDays: number | null,
): ScheduleItem => ({ id, featureId, position, estimateDays })

const plan = (parts: Partial<PlanStructure>): PlanStructure => ({
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'Europe/Belgrade',
  epics: [{ id: 'alpha', railOrder: 0 }],
  features: [],
  items: [],
  ...parts,
})

const spanOf = (result: ScheduleResult, id: string): unknown => result.days.get(id)

const span = (startDay: number, endDay: number): unknown => ({ startDay, endDay })

describe('a single rail lays its features head to tail', () => {
  const result = schedule(
    plan({
      features: [
        feature({ id: 'f1', position: 0, estimateDays: 4 }),
        feature({ id: 'f2', position: 1, estimateDays: 3 }),
        feature({ id: 'f3', position: 2, estimateDays: 5 }),
      ],
    }),
  )

  it('starts the first feature on day 0 and ends it on the exclusive day 4', () => {
    expect(spanOf(result, 'f1')).toEqual(span(0, 4))
  })

  it('starts each later feature exactly where its rail predecessor ended', () => {
    expect(spanOf(result, 'f2')).toEqual(span(4, 7))
    expect(spanOf(result, 'f3')).toEqual(span(7, 12))
  })

  it('derives that order from position and not from the order the features arrived in', () => {
    const reversed = schedule(
      plan({
        features: [
          feature({ id: 'f3', position: 2, estimateDays: 5 }),
          feature({ id: 'f2', position: 1, estimateDays: 3 }),
          feature({ id: 'f1', position: 0, estimateDays: 4 }),
        ],
      }),
    )
    expect(reversed.days).toEqual(result.days)
  })

  it('leaves nothing unscheduled and finds no cycle', () => {
    expect(result.unscheduled).toEqual([])
    expect(result.cycles).toEqual([])
  })
})

describe('three epics are three teams, so the plan is its critical path and not its total work', () => {
  const result = schedule(
    plan({
      epics: [
        { id: 'checkout', railOrder: 0 },
        { id: 'billing', railOrder: 1 },
        { id: 'search', railOrder: 2 },
      ],
      features: [
        feature({ id: 'f1', epicId: 'checkout', estimateDays: 10 }),
        feature({ id: 'g1', epicId: 'billing', estimateDays: 10 }),
        feature({ id: 'h1', epicId: 'search', estimateDays: 10 }),
      ],
    }),
  )

  it('starts all three rails on day 0, because nothing couples them', () => {
    expect(spanOf(result, 'f1')).toEqual(span(0, 10))
    expect(spanOf(result, 'g1')).toEqual(span(0, 10))
    expect(spanOf(result, 'h1')).toEqual(span(0, 10))
  })

  it('makes the plan 10 days long rather than 30', () => {
    const ends = [...result.days.values()].map((at) => at.endDay)
    expect(Math.max(...ends)).toBe(10)
  })
})

describe('a dependency is the only thing that couples one rail to another', () => {
  const across = plan({
    epics: [
      { id: 'checkout', railOrder: 0 },
      { id: 'billing', railOrder: 1 },
    ],
    features: [
      feature({ id: 'f1', epicId: 'checkout', estimateDays: 4 }),
      feature({ id: 'g1', epicId: 'billing', estimateDays: 3, dependsOn: ['f1'] }),
    ],
  })

  it('pushes the first feature of the billing rail to day 4, behind the feature it waits on', () => {
    const result = schedule(across)
    expect(spanOf(result, 'f1')).toEqual(span(0, 4))
    expect(spanOf(result, 'g1')).toEqual(span(4, 7))
  })

  it('still couples the two rails when the rail that waits is the one drawn first', () => {
    const result = schedule({
      ...across,
      epics: [
        { id: 'billing', railOrder: 0 },
        { id: 'checkout', railOrder: 1 },
      ],
    })
    expect(spanOf(result, 'g1')).toEqual(span(4, 7))
  })

  it('moves nothing when rail order already satisfies the dependency', () => {
    const result = schedule(
      plan({
        features: [
          feature({ id: 'f1', position: 0, estimateDays: 4 }),
          feature({ id: 'f2', position: 1, estimateDays: 3, dependsOn: ['f1'] }),
        ],
      }),
    )
    expect(spanOf(result, 'f2')).toEqual(span(4, 7))
  })

  it('ignores an edge naming a feature that does not exist', () => {
    const result = schedule(
      plan({ features: [feature({ id: 'f1', estimateDays: 4, dependsOn: ['ghost'] })] }),
    )
    expect(spanOf(result, 'f1')).toEqual(span(0, 4))
  })
})

describe('a pin is a lower bound and never an upper one', () => {
  it('holds a feature back to the start of sprint 2 while its rail cursor sits at day 3', () => {
    const result = schedule(
      plan({
        features: [
          feature({ id: 'f1', position: 0, estimateDays: 3 }),
          feature({ id: 'f2', position: 1, estimateDays: 5, pinSprint: 2 }),
          feature({ id: 'f3', position: 2, estimateDays: 2 }),
        ],
      }),
    )
    expect(spanOf(result, 'f1')).toEqual(span(0, 3))
    expect(spanOf(result, 'f2')).toEqual(span(20, 25))
    expect(spanOf(result, 'f3')).toEqual(span(25, 27))
  })

  it('changes nothing when the rail has already run past the pinned sprint', () => {
    const result = schedule(
      plan({
        features: [
          feature({ id: 'f1', position: 0, estimateDays: 30 }),
          feature({ id: 'f2', position: 1, estimateDays: 5, pinSprint: 0 }),
        ],
      }),
    )
    expect(spanOf(result, 'f2')).toEqual(span(30, 35))
  })
})

describe('an estimate of zero is a milestone, not a missing estimate', () => {
  const result = schedule(
    plan({
      features: [
        feature({ id: 'f1', position: 0, estimateDays: 4 }),
        feature({ id: 'gate', position: 1, estimateDays: 0 }),
        feature({ id: 'f2', position: 2, estimateDays: 3 }),
      ],
    }),
  )

  it('places it as a point in time, its start equal to its exclusive end', () => {
    expect(spanOf(result, 'gate')).toEqual(span(4, 4))
  })

  it('keeps it out of unscheduled, because zero days is a real estimate', () => {
    expect(result.unscheduled).toEqual([])
  })

  it('does not advance the rail cursor past it', () => {
    expect(spanOf(result, 'f2')).toEqual(span(4, 7))
  })
})

describe('items flow head to tail inside their feature', () => {
  it('spans the feature across the sum of its items, each item abutting the last', () => {
    const result = schedule(
      plan({
        features: [feature({ id: 'f1', estimateDays: 99 })],
        items: [item('i1', 'f1', 0, 2), item('i2', 'f1', 1, 3), item('i3', 'f1', 2, 4)],
      }),
    )
    expect(spanOf(result, 'f1')).toEqual(span(0, 9))
    expect(spanOf(result, 'i1')).toEqual(span(0, 2))
    expect(spanOf(result, 'i2')).toEqual(span(2, 5))
    expect(spanOf(result, 'i3')).toEqual(span(5, 9))
  })

  it('flows past an unestimated item without leaving a gap where it would have been', () => {
    const result = schedule(
      plan({
        features: [feature({ id: 'f1', estimateDays: 99 })],
        items: [item('i1', 'f1', 0, 2), item('i2', 'f1', 1, null), item('i3', 'f1', 2, 4)],
      }),
    )
    expect(spanOf(result, 'f1')).toEqual(span(0, 6))
    expect(spanOf(result, 'i1')).toEqual(span(0, 2))
    expect(spanOf(result, 'i3')).toEqual(span(2, 6))
    expect(result.days.has('i2')).toBe(false)
    expect(result.unscheduled).toEqual([{ id: 'i2', reason: 'no-estimate' }])
  })
})

describe('a feature with nothing to place is left off the axis without breaking its rail', () => {
  const result = schedule(
    plan({
      features: [
        feature({ id: 'f1', position: 0, estimateDays: 4 }),
        feature({ id: 'unsized', position: 1, estimateDays: null }),
        feature({ id: 'f2', position: 2, estimateDays: 3 }),
      ],
    }),
  )

  it('reports it as unscheduled for want of an estimate', () => {
    expect(result.unscheduled).toEqual([{ id: 'unsized', reason: 'no-estimate' }])
  })

  it('chains its neighbours to each other, so the rail is not cut in two', () => {
    expect(spanOf(result, 'f2')).toEqual(span(4, 7))
  })
})

describe('a cycle takes its features off the axis and leaves the rest of the plan standing', () => {
  const result = schedule(
    plan({
      features: [
        feature({ id: 'a', position: 0, estimateDays: 4, dependsOn: ['b'] }),
        feature({ id: 'b', position: 1, estimateDays: 3, dependsOn: ['a'] }),
        feature({ id: 'c', position: 2, estimateDays: 5 }),
      ],
      items: [item('i1', 'a', 0, 2), item('i2', 'b', 0, 3)],
    }),
  )

  it('names both features in one cycle', () => {
    expect(result.cycles).toEqual([{ featureIds: ['a', 'b'] }])
  })

  it('leaves both features and every one of their items unscheduled as in-cycle', () => {
    expect(result.unscheduled).toEqual([
      { id: 'a', reason: 'in-cycle' },
      { id: 'b', reason: 'in-cycle' },
      { id: 'i1', reason: 'in-cycle' },
      { id: 'i2', reason: 'in-cycle' },
    ])
  })

  it('still places the feature outside the cycle, at the head of its rail', () => {
    expect(spanOf(result, 'c')).toEqual(span(0, 5))
  })

  it('schedules a feature that depends on a cycle member, ignoring that edge', () => {
    const waiting = schedule(
      plan({
        epics: [
          { id: 'alpha', railOrder: 0 },
          { id: 'beta', railOrder: 1 },
        ],
        features: [
          feature({ id: 'a', estimateDays: 4, dependsOn: ['b'] }),
          feature({ id: 'b', position: 1, estimateDays: 3, dependsOn: ['a'] }),
          feature({ id: 'g1', epicId: 'beta', estimateDays: 6, dependsOn: ['a'] }),
        ],
      }),
    )
    expect(spanOf(waiting, 'g1')).toEqual(span(0, 6))
  })
})

describe('a plan that contradicts itself still comes back whole', () => {
  it('keeps rail order when a feature depends on one that sits later on its own rail', () => {
    const result = schedule(
      plan({
        features: [
          feature({ id: 'f1', position: 0, estimateDays: 4, dependsOn: ['f2'] }),
          feature({ id: 'f2', position: 1, estimateDays: 3 }),
        ],
      }),
    )
    expect(spanOf(result, 'f1')).toEqual(span(0, 4))
    expect(spanOf(result, 'f2')).toEqual(span(4, 7))
    expect(result.unscheduled).toEqual([])
  })

  it('places every feature of a deadlock that rail order and dependencies form together', () => {
    const result = schedule(
      plan({
        epics: [
          { id: 'alpha', railOrder: 0 },
          { id: 'beta', railOrder: 1 },
        ],
        features: [
          feature({ id: 'a0', position: 0, estimateDays: 4, dependsOn: ['b0'] }),
          feature({ id: 'a1', position: 1, estimateDays: 3 }),
          feature({ id: 'b0', epicId: 'beta', estimateDays: 5, dependsOn: ['a1'] }),
        ],
      }),
    )
    expect(spanOf(result, 'a0')).toEqual(span(0, 4))
    expect(spanOf(result, 'a1')).toEqual(span(4, 7))
    expect(spanOf(result, 'b0')).toEqual(span(7, 12))
    expect(result.unscheduled).toEqual([])
  })
})

describe('a plan with nothing in it', () => {
  const result = schedule(plan({ epics: [], features: [], items: [] }))

  it('comes back empty rather than throwing', () => {
    expect(result.days.size).toBe(0)
    expect(result.cycles).toEqual([])
    expect(result.unscheduled).toEqual([])
  })
})
