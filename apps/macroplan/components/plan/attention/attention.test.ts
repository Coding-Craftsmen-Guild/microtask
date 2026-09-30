import type { CanvasScheduleWithConflicts } from '@repo/canvas'
import { describe, expect, it } from 'vitest'
import { attentionCount, attentionOf } from './attention'
import type { AttentionPlan } from './attention'

const EMPTY: CanvasScheduleWithConflicts = {
  spans: [],
  cycles: [],
  unscheduled: [],
  ignoredEdges: [],
}

const planOf = (schedule: Partial<CanvasScheduleWithConflicts>): AttentionPlan => ({
  features: [
    { id: 'f1', name: 'Establish the state' },
    { id: 'f2', name: 'EuroWIN roles' },
    { id: 'f3', name: 'Second-audience wiring' },
  ],
  items: [
    { id: 'i1', featureId: 'f1' },
    { id: 'i2', featureId: 'f1' },
    { id: 'i3', featureId: 'f2' },
  ],
  schedule: { ...EMPTY, ...schedule },
})

const kinds = (plan: AttentionPlan, id: string) =>
  (attentionOf(plan).get(id) ?? []).map((each) => each.kind)

describe('attentionOf files an unplaced feature under the feature', () => {
  it('marks a feature with no estimate, which is why it has no bar', () => {
    const plan = planOf({ unscheduled: [{ id: 'f1', reason: 'no-estimate' }] })
    expect(kinds(plan, 'f1')).toEqual(['no-estimate'])
  })

  it('marks a feature the pass could not place for a cycle', () => {
    const plan = planOf({ unscheduled: [{ id: 'f1', reason: 'in-cycle' }] })
    expect(kinds(plan, 'f1')).toEqual(['in-cycle'])
  })

  it('names the badge as a noun phrase, since the row it sits on already names the subject', () => {
    const plan = planOf({ unscheduled: [{ id: 'f1', reason: 'no-estimate' }] })
    expect(attentionOf(plan).get('f1')?.[0]?.detail).toBe('Needs an estimate')
  })
})

describe('attentionOf files nothing under an item', () => {
  // An item takes its timing from the feature it is under, so an item nobody sized is not a thing
  // left undone — it is the ordinary case, and a plan is allowed to be broken down only as far as
  // anyone found useful.
  it('says nothing about an item with no estimate, which is not a problem but the ordinary case', () => {
    const plan = planOf({ unscheduled: [{ id: 'i1', reason: 'no-estimate' }] })
    expect(attentionOf(plan).has('i1')).toBe(false)
  })

  it('says nothing about its feature either, the feature having an estimate of its own', () => {
    const plan = planOf({ unscheduled: [{ id: 'i1', reason: 'no-estimate' }] })
    expect(attentionOf(plan).has('f1')).toBe(false)
  })

  it('stays silent however many of a feature’s items are unsized', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'i1', reason: 'no-estimate' },
        { id: 'i2', reason: 'no-estimate' },
        { id: 'i3', reason: 'no-estimate' },
      ],
    })
    expect(attentionOf(plan).size).toBe(0)
  })

  // An item is reported in-cycle because its *feature* is, and that feature carries the badge.
  // Repeating it on each item would multiply one fact by however finely somebody broke the work down.
  it('leaves an item its feature’s cycle stranded unmarked, the feature already saying so', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'f1', reason: 'in-cycle' },
        { id: 'i1', reason: 'in-cycle' },
        { id: 'i2', reason: 'in-cycle' },
      ],
    })
    expect(kinds(plan, 'f1')).toEqual(['in-cycle'])
    expect(attentionOf(plan).has('i1')).toBe(false)
  })
})

describe('attentionOf files a cycle on every feature in it', () => {
  it('marks each member, so the reader finds it wherever they are looking', () => {
    const plan = planOf({ cycles: [{ featureIds: ['f1', 'f2'] }] })
    expect(kinds(plan, 'f1')).toEqual(['in-cycle'])
    expect(kinds(plan, 'f2')).toEqual(['in-cycle'])
  })

  it('marks a feature once when the pass reports it both unplaced and in a cycle', () => {
    const plan = planOf({
      unscheduled: [{ id: 'f1', reason: 'in-cycle' }],
      cycles: [{ featureIds: ['f1', 'f2'] }],
    })
    expect(kinds(plan, 'f1')).toEqual(['in-cycle'])
  })
})

describe('attentionOf files a dropped edge on the feature that was placed anyway', () => {
  it('names the dependency, because that is the fact the badge is carrying', () => {
    const plan = planOf({ ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }] })
    expect(attentionOf(plan).get('f1')?.[0]?.detail).toBe('Dependency on EuroWIN roles set aside')
  })

  it('files it on the waiting feature and not on the one depended upon', () => {
    const plan = planOf({ ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }] })
    expect(attentionOf(plan).has('f2')).toBe(false)
  })

  it('falls back to the bare phrase when the plan does not hold the named dependency', () => {
    const plan = planOf({ ignoredEdges: [{ featureId: 'f1', dependsOnId: 'gone' }] })
    expect(attentionOf(plan).get('f1')?.[0]?.detail).toBe('Dependency set aside')
  })
})

describe('attentionOf gathers several kinds on one entity', () => {
  it('keeps every distinct kind, since they are different things to do about it', () => {
    const plan = planOf({
      unscheduled: [{ id: 'f1', reason: 'no-estimate' }, { id: 'i1', reason: 'no-estimate' }],
      ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }],
    })
    expect(kinds(plan, 'f1').sort()).toEqual(['edge-ignored', 'no-estimate'])
  })
})

describe('attentionCount counts the features a reader can act on', () => {
  it('counts a plan with nothing wrong as zero', () => {
    expect(attentionCount(planOf({}), attentionOf(planOf({})))).toBe(0)
  })

  it('counts a feature with two problems once, so the header agrees with the page', () => {
    const plan = planOf({
      unscheduled: [{ id: 'f1', reason: 'no-estimate' }],
      ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }],
    })
    expect(attentionCount(plan, attentionOf(plan))).toBe(1)
  })

  it('counts nothing for a plan whose only unsized things are items', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'i1', reason: 'no-estimate' },
        { id: 'i3', reason: 'no-estimate' },
      ],
    })
    expect(attentionCount(plan, attentionOf(plan))).toBe(0)
  })

  it('counts every distinct feature, not just the first', () => {
    const plan = planOf({ cycles: [{ featureIds: ['f1', 'f2', 'f3'] }] })
    expect(attentionCount(plan, attentionOf(plan))).toBe(3)
  })
})
