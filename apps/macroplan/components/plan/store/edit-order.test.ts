import { describe, expect, it } from 'vitest'
import { densified, densifiedBy, placeAmong } from './edit-order'

const at = (id: string, position: number, parent = 'p') => ({ id, position, parent })

const ids = (list: readonly { readonly id: string }[]) => list.map((one) => one.id)

const positions = (list: readonly { readonly position: number }[]) => list.map((one) => one.position)

describe('densified renumbers a group 0..n-1 in the order its positions already gave it', () => {
  it('closes a gap and keeps the order', () => {
    const out = densified([at('b', 4), at('a', 1), at('c', 9)])
    expect(ids(out)).toEqual(['a', 'b', 'c'])
    expect(positions(out)).toEqual([0, 1, 2])
  })

  it('hands back the very object when its position is already right, as the domain does', () => {
    const first = at('a', 0)
    expect(densified([first, at('b', 7)])[0]).toBe(first)
  })
})

describe('placeAmong moves one sibling to a place and renumbers the rest around it', () => {
  const rail = [at('a', 0), at('b', 1), at('c', 2), at('d', 3)]

  it('moves a sibling forward', () => {
    expect(ids(placeAmong(rail, 'a', 2))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a sibling back', () => {
    expect(ids(placeAmong(rail, 'd', 0))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('clamps a place past the end to the end, and a negative one to the start', () => {
    expect(ids(placeAmong(rail, 'a', 99))).toEqual(['b', 'c', 'd', 'a'])
    expect(ids(placeAmong(rail, 'c', -3))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('truncates a fractional place rather than rounding it', () => {
    expect(ids(placeAmong(rail, 'a', 1.9))).toEqual(['b', 'a', 'c', 'd'])
  })

  it('renumbers densely whatever the positions were', () => {
    expect(positions(placeAmong([at('a', 3), at('b', 8)], 'b', 0))).toEqual([0, 1])
  })

  it('only renumbers when the id is not among the siblings', () => {
    expect(ids(placeAmong([at('b', 5), at('a', 2)], 'zz', 0))).toEqual(['a', 'b'])
  })
})

describe('densifiedBy renumbers every parent group without moving anything in the array', () => {
  it('keeps the array order and numbers each group from zero', () => {
    const all = [at('x', 4, 'one'), at('y', 2, 'two'), at('z', 1, 'one'), at('w', 9, 'two')]
    const out = densifiedBy(all, (one) => one.parent)
    expect(ids(out)).toEqual(['x', 'y', 'z', 'w'])
    expect(positions(out)).toEqual([1, 0, 0, 1])
  })
})
