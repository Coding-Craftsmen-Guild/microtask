import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  EPIC_2,
  FEATURE_1,
  FEATURE_2,
  FEATURE_3,
  FEATURE_6,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  LABEL_2,
  railedPlan,
} from '../testing/plan-fixture'
import {
  addFeature,
  changeFeature,
  dependFeature,
  labelFeature,
  placeFeature,
  removeFeature,
} from './feature-edits'

const atlas = () => planScreenModel(atlasPlan())

const railed = () => planScreenModel(railedPlan())

const featureOf = (plan: ReturnType<typeof atlas>, id: string) => plan.features.find((one) => one.id === id)

const rail = (plan: ReturnType<typeof atlas>, epicId: string) =>
  plan.features
    .filter((one) => one.epicId === epicId)
    .sort((left, right) => left.position - right.position)
    .map((one) => [one.id, one.position])

describe('changeFeature sets the fields a change names and leaves the rest', () => {
  it('stores a name the way the API will, collapsed and trimmed', () => {
    expect(featureOf(changeFeature(atlas(), FEATURE_1, { name: '  Auth   v2 ' }), FEATURE_1)?.name).toBe('Auth v2')
  })

  it('keeps the old name when the new one would be refused as empty', () => {
    expect(featureOf(changeFeature(atlas(), FEATURE_1, { name: '   ' }), FEATURE_1)?.name).toBe('Auth rewrite')
  })

  it('sets an estimate, clears one with null, and pins without touching the estimate', () => {
    expect(featureOf(changeFeature(atlas(), FEATURE_1, { estimateDays: 8 }), FEATURE_1)?.estimateDays).toBe(8)
    expect(featureOf(changeFeature(atlas(), FEATURE_1, { estimateDays: null }), FEATURE_1)?.estimateDays).toBeNull()
    const pinned = featureOf(changeFeature(atlas(), FEATURE_1, { pinSprint: 2 }), FEATURE_1)
    expect([pinned?.pinSprint, pinned?.estimateDays]).toEqual([2, 5])
  })

  it('hands back the plan itself for a feature the plan does not hold', () => {
    const plan = atlas()
    expect(changeFeature(plan, 'nope', { estimateDays: 1 })).toBe(plan)
  })
})

describe('placeFeature moves a feature on its rail or to another, renumbering both', () => {
  it('reorders within a rail', () => {
    expect(rail(placeFeature(atlas(), FEATURE_2, { epicId: EPIC_1, position: 0 }), EPIC_1)).toEqual([
      [FEATURE_2, 0],
      [FEATURE_1, 1],
    ])
  })

  it('moves across rails, closing the gap it leaves and opening one where it lands', () => {
    const moved = placeFeature(railed(), FEATURE_1, { epicId: EPIC_2, position: 1 })
    expect(rail(moved, EPIC_1)).toEqual([[FEATURE_2, 0]])
    expect(rail(moved, EPIC_2)).toEqual([
      [FEATURE_3, 0],
      [FEATURE_1, 1],
      [FEATURE_6, 2],
    ])
  })

  it('leaves the plan alone for a rail it does not hold, which the API refuses', () => {
    const plan = railed()
    expect(placeFeature(plan, FEATURE_1, { epicId: 'nope', position: 0 })).toBe(plan)
  })
})

describe('dependFeature, labelFeature', () => {
  it('replaces the edges, without repeating one', () => {
    expect(featureOf(dependFeature(atlas(), FEATURE_1, [FEATURE_2, FEATURE_2]), FEATURE_1)?.dependsOn).toEqual([FEATURE_2])
  })

  it('puts a feature in a group, and takes it out with null', () => {
    expect(featureOf(labelFeature(atlas(), FEATURE_2, LABEL_2), FEATURE_2)?.labelId).toBe(LABEL_2)
    expect(featureOf(labelFeature(atlas(), FEATURE_1, null), FEATURE_1)?.labelId).toBeNull()
  })
})

describe('removeFeature takes the feature, its items and every edge to it', () => {
  const after = removeFeature(atlas(), FEATURE_1)

  it('removes the feature and renumbers its rail', () => {
    expect(rail(after, EPIC_1)).toEqual([[FEATURE_2, 0]])
  })

  it('removes the items under it and keeps the others', () => {
    expect(after.items.map((one) => one.id)).toEqual([ITEM_3])
    expect(after.items.some((one) => one.id === ITEM_1 || one.id === ITEM_2)).toBe(false)
  })

  it('drops the edge another feature had to it', () => {
    expect(featureOf(after, FEATURE_2)?.dependsOn).toEqual([])
  })
})

describe('addFeature appends a feature at the end of its rail', () => {
  const added = addFeature(atlas(), { epicId: EPIC_1, name: ' New  feature ', estimateDays: 2 }, 'pending:1')

  it('appends it to the array, which is where the API puts a created feature', () => {
    expect(added.features.at(-1)?.id).toBe('pending:1')
  })

  it('gives it the next place on its rail and the defaults the API gives', () => {
    expect(featureOf(added, 'pending:1')).toMatchObject({
      epicId: EPIC_1,
      name: 'New feature',
      position: 2,
      estimateDays: 2,
      pinSprint: null,
      labelId: null,
      dependsOn: [],
    })
  })
})
