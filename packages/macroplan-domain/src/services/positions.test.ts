import { describe, expect, it } from 'vitest'
import { densified, placeAmong } from './positions.js'

interface Entry {
  readonly id: string
  readonly position: number
}

const group = (...ids: readonly string[]): readonly Entry[] =>
  ids.map((id, position) => ({ id, position }))

const order = (entries: readonly Entry[]): readonly string[] => entries.map((entry) => entry.id)

const positions = (entries: readonly Entry[]): readonly number[] =>
  entries.map((entry) => entry.position)

describe('placeAmong renumbers the group densely from zero', () => {
  it('numbers every sibling 0..n-1 after a move', () => {
    expect(positions(placeAmong(group('a', 'b', 'c'), 'a', 2))).toEqual([0, 1, 2])
  })

  it('closes a gap the group arrived with, so a stale position cannot survive', () => {
    const sparse: readonly Entry[] = [
      { id: 'a', position: 0 },
      { id: 'b', position: 7 },
      { id: 'c', position: 9 },
    ]
    expect(positions(placeAmong(sparse, 'c', 1))).toEqual([0, 1, 2])
    expect(order(placeAmong(sparse, 'c', 1))).toEqual(['a', 'c', 'b'])
  })

  it('reads the order from the positions it was given, not from array order', () => {
    const shuffled: readonly Entry[] = [
      { id: 'c', position: 2 },
      { id: 'a', position: 0 },
      { id: 'b', position: 1 },
    ]
    expect(order(placeAmong(shuffled, 'b', 0))).toEqual(['b', 'a', 'c'])
  })
})

describe('placeAmong moves the one id it is given', () => {
  it('moves an id forward', () => {
    expect(order(placeAmong(group('a', 'b', 'c', 'd'), 'a', 2))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an id backward', () => {
    expect(order(placeAmong(group('a', 'b', 'c', 'd'), 'd', 1))).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves an id to 0', () => {
    expect(order(placeAmong(group('a', 'b', 'c'), 'c', 0))).toEqual(['c', 'a', 'b'])
  })

  it('moves an id to the end', () => {
    expect(order(placeAmong(group('a', 'b', 'c'), 'a', 2))).toEqual(['b', 'c', 'a'])
  })

  it('clamps a position past the end to the end', () => {
    expect(order(placeAmong(group('a', 'b', 'c'), 'a', 99))).toEqual(['b', 'c', 'a'])
    expect(positions(placeAmong(group('a', 'b', 'c'), 'a', 99))).toEqual([0, 1, 2])
  })

  it('clamps a negative position to 0', () => {
    expect(order(placeAmong(group('a', 'b', 'c'), 'c', -5))).toEqual(['c', 'a', 'b'])
  })

  it('changes no id and no position when the id is already there', () => {
    expect(placeAmong(group('a', 'b', 'c'), 'b', 1)).toEqual(group('a', 'b', 'c'))
  })

  it('leaves every other id where it was, on every move', () => {
    const moved = placeAmong(group('a', 'b', 'c', 'd', 'e'), 'b', 3)
    expect(order(moved).filter((id) => id !== 'b')).toEqual(['a', 'c', 'd', 'e'])
  })
})

describe('placeAmong is pure and total', () => {
  it('leaves the array it was given untouched', () => {
    const before = group('a', 'b', 'c')
    placeAmong(before, 'a', 2)
    expect(before).toEqual(group('a', 'b', 'c'))
  })

  it('leaves an entry that did not move as the same object, so nothing is rewritten', () => {
    const before = group('a', 'b', 'c')
    const after = placeAmong(before, 'c', 2)
    expect(after[0]).toBe(before[0])
  })

  it('densifies without reinserting when no sibling carries the id', () => {
    const sparse: readonly Entry[] = [
      { id: 'a', position: 3 },
      { id: 'b', position: 8 },
    ]
    expect(placeAmong(sparse, 'z', 0)).toEqual(group('a', 'b'))
  })

  it('answers an empty group for an empty group', () => {
    expect(placeAmong([], 'a', 0)).toEqual([])
  })
})

describe('densified renumbers in place, moving nothing', () => {
  it('closes the gap a removal left, keeping the relative order', () => {
    const left: readonly Entry[] = [
      { id: 'a', position: 0 },
      { id: 'c', position: 2 },
      { id: 'd', position: 3 },
    ]
    expect(densified(left)).toEqual(group('a', 'c', 'd'))
  })

  it('leaves an already dense group byte-identical, entry objects included', () => {
    const dense = group('a', 'b', 'c')
    const after = densified(dense)
    expect(after).toEqual(dense)
    expect(after[1]).toBe(dense[1])
  })
})
