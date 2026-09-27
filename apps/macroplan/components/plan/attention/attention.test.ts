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

describe('attentionOf rolls unsized items up onto their feature', () => {
  it('marks the item itself, so its own row can carry the badge', () => {
    const plan = planOf({ unscheduled: [{ id: 'i1', reason: 'no-estimate' }] })
    expect(kinds(plan, 'i1')).toEqual(['no-estimate'])
  })

  it('marks the feature that owns it, so the timeline row shows there is something under it', () => {
    const plan = planOf({ unscheduled: [{ id: 'i1', reason: 'no-estimate' }] })
    expect(kinds(plan, 'f1')).toEqual(['items-unsized'])
  })

  it('counts the items of one feature into a single badge, which is what empties the old wall', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'i1', reason: 'no-estimate' },
        { id: 'i2', reason: 'no-estimate' },
      ],
    })
    expect(attentionOf(plan).get('f1')?.[0]?.detail).toBe('2 items need an estimate')
  })

  it('writes the singular for one item rather than "1 items"', () => {
    const plan = planOf({ unscheduled: [{ id: 'i3', reason: 'no-estimate' }] })
    expect(attentionOf(plan).get('f2')?.[0]?.detail).toBe('1 item needs an estimate')
  })

  it('keeps one feature’s items off another feature’s badge', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'i1', reason: 'no-estimate' },
        { id: 'i3', reason: 'no-estimate' },
      ],
    })
    expect(attentionOf(plan).get('f1')?.[0]?.detail).toBe('1 item needs an estimate')
    expect(attentionOf(plan).get('f2')?.[0]?.detail).toBe('1 item needs an estimate')
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
    expect(kinds(plan, 'f1').sort()).toEqual(['edge-ignored', 'items-unsized', 'no-estimate'])
  })
})

describe('attentionCount counts the features a reader can act on', () => {
  it('counts a plan with nothing wrong as zero', () => {
    expect(attentionCount(planOf({}), attentionOf(planOf({})))).toBe(0)
  })

  it('counts a feature with three problems once, so the header agrees with the page', () => {
    const plan = planOf({
      unscheduled: [{ id: 'f1', reason: 'no-estimate' }, { id: 'i1', reason: 'no-estimate' }],
      ignoredEdges: [{ featureId: 'f1', dependsOnId: 'f2' }],
    })
    expect(attentionCount(plan, attentionOf(plan))).toBe(1)
  })

  // Counting items too made the header say 19 over a page showing four marks: every unsized item
  // counted on its own account and again inside its feature's rollup.
  it('leaves rolled-up items out, so the number matches the marks on screen', () => {
    const plan = planOf({
      unscheduled: [
        { id: 'i1', reason: 'no-estimate' },
        { id: 'i2', reason: 'no-estimate' },
        { id: 'i3', reason: 'no-estimate' },
      ],
    })
    expect(attentionOf(plan).size).toBe(5)
    expect(attentionCount(plan, attentionOf(plan))).toBe(2)
  })

  it('counts every distinct feature, not just the first', () => {
    const plan = planOf({ cycles: [{ featureIds: ['f1', 'f2', 'f3'] }] })
    expect(attentionCount(plan, attentionOf(plan))).toBe(3)
  })
})
