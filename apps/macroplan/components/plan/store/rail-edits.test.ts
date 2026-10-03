import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { EPIC_1, EPIC_2, EPIC_3, FEATURE_1, FEATURE_3, FEATURE_6, LABEL_1, atlasPlan, railedPlan } from '../testing/plan-fixture'
import { addGroup, changeGroup, removeGroup } from './group-edits'
import { retimePlan } from './plan-edits'
import { addRail, changeRail, removeRail, reorderRail } from './rail-edits'

const railed = () => planScreenModel(railedPlan())

const atlas = () => planScreenModel(atlasPlan())

const order = (plan: ReturnType<typeof railed>) =>
  [...plan.epics].sort((left, right) => left.railOrder - right.railOrder).map((one) => [one.id, one.railOrder])

describe('rail edits mirror EpicService', () => {
  it('renames and recolours a rail, leaving what the change does not name', () => {
    const changed = changeRail(railed(), EPIC_2, { name: ' Pay  ', colour: '#123456' })
    expect(changed.epics.find((one) => one.id === EPIC_2)).toMatchObject({ name: 'Pay', colour: '#123456' })
    expect(changeRail(railed(), EPIC_2, { colour: '#abcdef' }).epics.find((one) => one.id === EPIC_2)?.name).toBe('Payments')
  })

  it('reorders the rails, renumbering every railOrder', () => {
    expect(order(reorderRail(railed(), EPIC_3, 0))).toEqual([
      [EPIC_3, 0],
      [EPIC_1, 1],
      [EPIC_2, 2],
    ])
  })

  it('removes a rail with its features and their items, and closes the gap in the order', () => {
    const removed = removeRail(railed(), EPIC_2)
    expect(order(removed)).toEqual([
      [EPIC_1, 0],
      [EPIC_3, 1],
    ])
    expect(removed.features.some((one) => one.id === FEATURE_3 || one.id === FEATURE_6)).toBe(false)
  })

  it('adds a rail last, unbound, with the colour the API defaults to when none is sent', () => {
    const added = addRail(railed(), { name: 'Ops' }, 'pending:4')
    expect(added.epics.at(-1)).toMatchObject({ id: 'pending:4', name: 'Ops', railOrder: 3, colour: '#3355ff', binding: null })
  })
})

describe('group edits mirror LabelService', () => {
  it('renames and recolours a group', () => {
    expect(changeGroup(atlas(), LABEL_1, { name: 'Phase one' }).labels.find((one) => one.id === LABEL_1)?.name).toBe('Phase one')
  })

  it('removes a group and takes every feature out of it', () => {
    const removed = removeGroup(atlas(), LABEL_1)
    expect(removed.labels.some((one) => one.id === LABEL_1)).toBe(false)
    expect(removed.features.find((one) => one.id === FEATURE_1)?.labelId).toBeNull()
  })

  it('adds a group last, with the colour the API defaults to when none is sent', () => {
    expect(addGroup(atlas(), { name: 'Phase 3' }, 'pending:5').labels.at(-1)).toMatchObject({
      id: 'pending:5',
      name: 'Phase 3',
      colour: '#7c3aed',
    })
  })
})

describe('retimePlan mirrors PlanService.update', () => {
  it('moves the calendar and leaves what the change does not name', () => {
    const moved = retimePlan(atlas(), { startDate: '2026-11-02', sprintLengthDays: 10 })
    expect([moved.startDate, moved.sprintLengthDays, moved.timezone, moved.name]).toEqual([
      '2026-11-02',
      10,
      'Europe/Belgrade',
      'Atlas rollout',
    ])
  })

  it('renames the plan the way the API stores a name', () => {
    expect(retimePlan(atlas(), { name: '  Atlas  2 ' }).name).toBe('Atlas 2')
  })
})
