import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_2, ITEM_3 } from '../testing/plan-fixture'
import { addItem, changeItem, linkItem, placeItem, removeItem } from './item-edits'

const atlas = () => planScreenModel(atlasPlan())

const itemOf = (plan: ReturnType<typeof atlas>, id: string) => plan.items.find((one) => one.id === id)

const under = (plan: ReturnType<typeof atlas>, featureId: string) =>
  plan.items
    .filter((one) => one.featureId === featureId)
    .sort((left, right) => left.position - right.position)
    .map((one) => [one.id, one.position])

describe('changeItem sets the fields a change names and leaves the rest', () => {
  it('renames as the API stores a name, and keeps the old one for an empty name', () => {
    expect(itemOf(changeItem(atlas(), ITEM_1, { name: ' Log  in ' }), ITEM_1)?.name).toBe('Log in')
    expect(itemOf(changeItem(atlas(), ITEM_1, { name: '' }), ITEM_1)?.name).toBe('Sessions')
  })

  it('re-estimates, and clears an estimate with null', () => {
    expect(itemOf(changeItem(atlas(), ITEM_1, { estimateDays: 0.5 }), ITEM_1)?.estimateDays).toBe(0.5)
    expect(itemOf(changeItem(atlas(), ITEM_1, { estimateDays: null }), ITEM_1)?.estimateDays).toBeNull()
  })

  it('hands back the plan itself for an item it does not hold', () => {
    const plan = atlas()
    expect(changeItem(plan, 'nope', { estimateDays: 1 })).toBe(plan)
  })
})

describe('placeItem moves an item inside its feature or under another, renumbering both', () => {
  it('reorders inside a feature', () => {
    expect(under(placeItem(atlas(), ITEM_2, { featureId: FEATURE_1, position: 0 }), FEATURE_1)).toEqual([
      [ITEM_2, 0],
      [ITEM_1, 1],
    ])
  })

  it('moves an item under another feature, closing the gap it leaves', () => {
    const moved = placeItem(atlas(), ITEM_1, { featureId: FEATURE_2, position: 1 })
    expect(under(moved, FEATURE_1)).toEqual([[ITEM_2, 0]])
    expect(under(moved, FEATURE_2)).toEqual([
      [ITEM_3, 0],
      [ITEM_1, 1],
    ])
  })

  it('leaves the plan alone for a feature it does not hold', () => {
    const plan = atlas()
    expect(placeItem(plan, ITEM_1, { featureId: 'nope', position: 0 })).toBe(plan)
  })
})

describe('removeItem, addItem, linkItem', () => {
  it('removes an item and renumbers what is left under its feature', () => {
    expect(under(removeItem(atlas(), ITEM_1), FEATURE_1)).toEqual([[ITEM_2, 0]])
  })

  it('appends a created item at the end of its feature, with the defaults the API gives', () => {
    const added = addItem(atlas(), { featureId: FEATURE_1, name: 'New item', estimateDays: 1 }, 'pending:2')
    expect(added.items.at(-1)).toMatchObject({
      id: 'pending:2',
      featureId: FEATURE_1,
      name: 'New item',
      position: 2,
      estimateDays: 1,
      linkedTaskId: null,
    })
  })

  it('creates nothing under a feature the plan does not hold', () => {
    const plan = atlas()
    expect(addItem(plan, { featureId: 'nope', name: 'x' }, 'pending:3')).toBe(plan)
  })

  it('adds nothing under an id the plan already holds, so a create re-applied over its own answer draws once', () => {
    const plan = atlas()
    expect(addItem(plan, { featureId: FEATURE_1, name: 'New item' }, ITEM_1)).toBe(plan)
  })

  it('links an item to a task, and unlinks it with null', () => {
    expect(itemOf(linkItem(atlas(), ITEM_1, 'task-1'), ITEM_1)?.linkedTaskId).toBe('task-1')
    expect(itemOf(linkItem(linkItem(atlas(), ITEM_1, 'task-1'), ITEM_1, null), ITEM_1)?.linkedTaskId).toBeNull()
  })
})
