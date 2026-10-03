import { describe, expect, it } from 'vitest'
import type { Draft } from '../canvas/extend-view'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, LABEL_2, railedPlan, EPIC_3 } from '../testing/plan-fixture'
import { drawEdit, railDropEdit, type DrawMay } from './draw-edits'

const atlas = () => planScreenModel(atlasPlan())

const IDS = { feature: 'pending:f', item: 'pending:i' } as const

const ALL: DrawMay = { placeFeature: true, placeItem: true, labelFeature: true, createItem: true, setDependencies: true }

const NONE: DrawMay = { placeFeature: false, placeItem: false, labelFeature: false, createItem: false, setDependencies: false }

const draft = (over: Partial<Draft>): Draft => ({
  kind: 'feature',
  featureId: FEATURE_1,
  epicId: EPIC_1,
  position: 1,
  days: 3,
  labelId: '',
  sprint: 2,
  edge: 'none',
  ...over,
})

describe('drawEdit puts a whole drawn feature on the plan at once', () => {
  it('creates the feature where it was drawn, sized and pinned as drawn, with its first item under it', () => {
    const plan = drawEdit(atlas(), draft({}), IDS, ALL)
    expect(plan.features.find((one) => one.id === IDS.feature)).toMatchObject({
      epicId: EPIC_1,
      position: 1,
      estimateDays: 3,
      pinSprint: 2,
      name: 'New feature',
    })
    expect(plan.features.find((one) => one.id === FEATURE_2)?.position).toBe(2)
    expect(plan.items.find((one) => one.id === IDS.item)).toMatchObject({ featureId: IDS.feature, estimateDays: 3 })
  })

  it('puts it in the group the draw started in', () => {
    expect(drawEdit(atlas(), draft({ labelId: LABEL_2 }), IDS, ALL).features.find((one) => one.id === IDS.feature)?.labelId).toBe(LABEL_2)
  })

  it('makes the new feature wait on the one it was drawn from, or the other way round', () => {
    const waiting = drawEdit(atlas(), draft({ edge: 'new-waits' }), IDS, ALL)
    expect(waiting.features.find((one) => one.id === IDS.feature)?.dependsOn).toEqual([FEATURE_1])
    const waited = drawEdit(atlas(), draft({ featureId: FEATURE_2, edge: 'source-waits' }), IDS, ALL)
    expect(waited.features.find((one) => one.id === FEATURE_2)?.dependsOn).toEqual([FEATURE_1, IDS.feature])
  })

  it('does only what the surface may do: no place, no group, no item, no edge', () => {
    const plan = drawEdit(atlas(), draft({ labelId: LABEL_2, edge: 'new-waits' }), IDS, NONE)
    expect(plan.features.find((one) => one.id === IDS.feature)).toMatchObject({ position: 2, labelId: null, dependsOn: [] })
    expect(plan.items.some((one) => one.id === IDS.item)).toBe(false)
  })
})

describe('drawEdit puts a drawn item where it was drawn', () => {
  it('creates it under its feature, at the place drawn', () => {
    const plan = drawEdit(atlas(), draft({ kind: 'item', position: 0, days: 1.5 }), IDS, ALL)
    expect(plan.items.find((one) => one.id === IDS.item)).toMatchObject({ featureId: FEATURE_1, position: 0, estimateDays: 1.5 })
  })

  it('leaves it last when the surface may not place an item', () => {
    const plan = drawEdit(atlas(), draft({ kind: 'item', position: 0 }), IDS, NONE)
    expect(plan.items.find((one) => one.id === IDS.item)?.position).toBe(2)
  })
})

describe('railDropEdit adds a rail where it was dropped', () => {
  it('creates it and moves it to the gap it landed in', () => {
    const plan = railDropEdit(planScreenModel(railedPlan()), { name: 'New epic', colour: '#112233' }, 1, 'pending:r')
    const order = [...plan.epics].sort((left, right) => left.railOrder - right.railOrder).map((one) => one.id)
    expect(order).toEqual([EPIC_1, 'pending:r', expect.any(String), EPIC_3])
  })

  it('leaves it last when it may not be reordered', () => {
    const plan = railDropEdit(planScreenModel(railedPlan()), { name: 'New epic' }, null, 'pending:r')
    expect(plan.epics.find((one) => one.id === 'pending:r')?.railOrder).toBe(3)
  })
})
