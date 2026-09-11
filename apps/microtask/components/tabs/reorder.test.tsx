import { describe, expect, it } from 'vitest'
import { movedOrder } from './reorder'

const IDS = ['a', 'b', 'c', 'd'] as const

describe('movedOrder turns a relative move into the full permutation tabs.reorder takes', () => {
  it('swaps a tab with its left neighbour and keeps every other tab where it was', () => {
    expect(movedOrder(IDS, 'c', 'left')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('swaps a tab with its right neighbour and keeps every other tab where it was', () => {
    expect(movedOrder(IDS, 'b', 'right')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves the second tab to the front', () => {
    expect(movedOrder(IDS, 'b', 'left')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves the second-last tab to the end', () => {
    expect(movedOrder(IDS, 'c', 'right')).toEqual(['a', 'b', 'd', 'c'])
  })

  it('answers null for moving the first tab left, where legacy disabled the item', () => {
    expect(movedOrder(IDS, 'a', 'left')).toBeNull()
  })

  it('answers null for moving the last tab right, where legacy disabled the item', () => {
    expect(movedOrder(IDS, 'd', 'right')).toBeNull()
  })

  it('answers null for a tab the list does not hold, rather than inventing a position', () => {
    expect(movedOrder(IDS, 'z', 'left')).toBeNull()
    expect(movedOrder(IDS, 'z', 'right')).toBeNull()
  })

  it('names every tab exactly once for every legal move, which is what the API requires', () => {
    for (const id of IDS) {
      for (const direction of ['left', 'right'] as const) {
        const order = movedOrder(IDS, id, direction)
        if (order === null) continue
        expect(order).toHaveLength(IDS.length)
        expect([...order].sort()).toEqual([...IDS])
      }
    }
  })

  it('leaves the list it was given untouched', () => {
    const ids = ['a', 'b']
    movedOrder(ids, 'b', 'left')
    expect(ids).toEqual(['a', 'b'])
  })
})
