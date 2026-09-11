import { CAPABILITY_ACTIONS } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { ADMIN_CAPABILITIES } from './admin-capabilities'

describe('ADMIN_CAPABILITIES', () => {
  it('clears every action the projection answers for, and names no other', () => {
    expect(Object.keys(ADMIN_CAPABILITIES).sort()).toEqual([...CAPABILITY_ACTIONS].sort())
    expect(Object.values(ADMIN_CAPABILITIES).every((cleared) => cleared)).toBe(true)
  })
})
