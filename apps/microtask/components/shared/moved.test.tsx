import { describe, expect, it } from 'vitest'
import { moved } from './moved'

describe('moved', () => {
  it('swaps an item one step toward the start', () => {
    expect(moved(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
  })

  it('swaps an item one step toward the end', () => {
    expect(moved(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
  })

  it('answers null at either edge, where there is nowhere to go', () => {
    expect(moved(['a', 'b'], 'a', -1)).toBeNull()
    expect(moved(['a', 'b'], 'b', 1)).toBeNull()
  })

  it('answers null for an id that is not in the list', () => {
    expect(moved(['a', 'b'], 'z', 1)).toBeNull()
    expect(moved(['a', 'b'], 'z', -1)).toBeNull()
  })

  it('always answers a full permutation of what it was given', () => {
    const order = moved(['a', 'b', 'c', 'd'], 'c', -1) ?? []
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the list it was given untouched', () => {
    const ids = ['a', 'b']
    moved(ids, 'b', -1)
    expect(ids).toEqual(['a', 'b'])
  })
})
