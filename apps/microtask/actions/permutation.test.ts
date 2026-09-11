import { describe, expect, it } from 'vitest'
import { isPermutationOf } from './permutation'

describe('isPermutationOf', () => {
  it('accepts every item exactly once, in any order', () => {
    expect(isPermutationOf(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
    expect(isPermutationOf(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
    expect(isPermutationOf([], [])).toBe(true)
  })

  it('refuses a partial list, which would silently drop what it left out', () => {
    expect(isPermutationOf(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
  })

  it('refuses a duplicated list of the right length', () => {
    expect(isPermutationOf(['a', 'b', 'c'], ['a', 'a', 'b'])).toBe(false)
  })

  it('refuses a list naming something that is not there', () => {
    expect(isPermutationOf(['a', 'b'], ['a', 'z'])).toBe(false)
  })

  it('refuses a list longer than the set', () => {
    expect(isPermutationOf(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
  })

  it('refuses whatever a hostile browser sends instead of a list of ids', () => {
    expect(isPermutationOf(['a'], 'a' as unknown as string[])).toBe(false)
    expect(isPermutationOf(['1'], [1] as unknown as string[])).toBe(false)
    expect(isPermutationOf(['a'], null as unknown as string[])).toBe(false)
  })
})
