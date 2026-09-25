import { describe, expect, it } from 'vitest'
import { ROLES, type Role } from './role.js'
import { effectiveBridgeRole } from './bridge-role.js'

// The nine ordered pairs, written out by name rather than generated from a rank comparison —
// generating them from ranks would just check the function agrees with itself.
const PAIRS: readonly (readonly [Role, Role, Role])[] = [
  ['view', 'view', 'view'],
  ['view', 'write', 'view'],
  ['view', 'manage', 'view'],
  ['write', 'view', 'view'],
  ['write', 'write', 'write'],
  ['write', 'manage', 'write'],
  ['manage', 'view', 'view'],
  ['manage', 'write', 'write'],
  ['manage', 'manage', 'manage'],
]

const rank = (role: Role): number => ROLES.indexOf(role)

describe('effectiveBridgeRole', () => {
  it.each(PAIRS)('resolves (%s, %s) to %s', (left, right, expected) => {
    expect(effectiveBridgeRole(left, right)).toBe(expected)
  })

  // This is the one test tying the suite's domain to the kernel's own role list rather than to a
  // second, locally-typed list of three. PAIRS is hand-written above and stays nine entries long
  // however many roles the kernel later grows to, so a fourth role added to ROLES makes this
  // assertion fail here — loudly, in this file — instead of leaving the table above quietly
  // incomplete.
  it("exercises every role the kernel's own role list names, not a list re-declared here", () => {
    expect(PAIRS).toHaveLength(ROLES.length ** 2)
    expect(new Set(PAIRS.flatMap(([left, right]) => [left, right]))).toEqual(new Set(ROLES))
  })

  it('never resolves stronger than either input', () => {
    for (const [left, right, expected] of PAIRS) {
      expect(rank(expected)).toBeLessThanOrEqual(rank(left))
      expect(rank(expected)).toBeLessThanOrEqual(rank(right))
    }
  })

  it('is commutative', () => {
    for (const [left, right] of PAIRS) {
      expect(effectiveBridgeRole(left, right)).toBe(effectiveBridgeRole(right, left))
    }
  })

  it('is idempotent', () => {
    for (const role of ROLES) {
      expect(effectiveBridgeRole(role, role)).toBe(role)
    }
  })

  // Associativity is what makes the two-stage attenuation later tasks perform — binding role by
  // live token role, then that result by the plan reader's own role — equivalent to applying the
  // function once over all three, however the two applications are grouped.
  it('is associative', () => {
    for (const a of ROLES) {
      for (const b of ROLES) {
        for (const c of ROLES) {
          const leftFirst = effectiveBridgeRole(effectiveBridgeRole(a, b), c)
          const rightFirst = effectiveBridgeRole(a, effectiveBridgeRole(b, c))
          expect(leftFirst).toBe(rightFirst)
        }
      }
    }
  })
})
