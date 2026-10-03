import { describe, expect, it } from 'vitest'
import { flatSchedule } from './flat.js'
import { schedule } from './forward-pass.js'
import type { PlanStructure, ScheduleFeature, ScheduleItem } from './structure.js'

const feature = (
  id: string,
  [epicId, position]: readonly [string, number],
  estimateDays: number | null,
  dependsOn: readonly string[] = [],
): ScheduleFeature => ({ id, epicId, position, estimateDays, pinSprint: null, dependsOn })

const item = (id: string, featureId: string, position: number, estimateDays: number | null): ScheduleItem => ({
  id,
  featureId,
  position,
  estimateDays,
})

const plan = (parts: Partial<PlanStructure>): PlanStructure => ({
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [
    { id: 'rail-b', railOrder: 0 },
    { id: 'rail-a', railOrder: 1 },
  ],
  features: [],
  items: [],
  ...parts,
})

describe('flatSchedule turns the forward pass into the shape a response carries', () => {
  const structure = plan({
    features: [
      feature('f-zeta', ['rail-b', 0], 4),
      feature('f-alpha', ['rail-a', 0], 2),
      feature('f-late', ['rail-a', 1], 3, ['f-zeta']),
      feature('f-none', ['rail-a', 2], null),
    ],
    items: [item('i-1', 'f-alpha', 0, 1), item('i-2', 'f-alpha', 1, null)],
  })
  const flat = flatSchedule(structure)

  it('names every span by its id and gives the span the pass computed for it', () => {
    const days = schedule(structure).days
    expect(flat.spans).toHaveLength(days.size)
    for (const span of flat.spans) expect(days.get(span.id)).toEqual({ startDay: span.startDay, endDay: span.endDay })
  })

  it('orders spans by start day, breaking a tie on the same day by ascending id', () => {
    expect(flat.spans.map((span) => span.id)).toEqual(['f-alpha', 'f-zeta', 'i-1', 'f-late'])
  })

  it('orders the unscheduled entries by id', () => {
    expect(flat.unscheduled.map((entry) => entry.id)).toEqual(['f-none', 'i-2'])
  })

  it('passes the cycles and the dropped edges through exactly as the pass found them', () => {
    const tangled = plan({
      features: [feature('x', ['rail-a', 0], 1, ['y']), feature('y', ['rail-a', 1], 1, ['x'])],
    })
    const result = schedule(tangled)
    expect(flatSchedule(tangled).cycles).toEqual(result.cycles)
    expect(flatSchedule(tangled).ignoredEdges).toEqual(result.ignoredEdges)
  })
})
