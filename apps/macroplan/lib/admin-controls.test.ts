import { Role, type ScopeValue } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { ADMIN_CONTROLS } from './admin-controls'
import { planCapabilities, type PlanControls } from './plan-capabilities'

const PLAN: ScopeValue = { kind: 'plan', planId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

const PROJECT: ScopeValue = { kind: 'project', projectId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

// Both groups flattened to one list of `group.control` pairs, so a sweep below reads every boolean
// the type holds at either level rather than the eighteen and then, separately, the four.
const leaves = (controls: PlanControls): readonly (readonly [string, boolean])[] => [
  ...Object.entries(controls.content).map(([name, answer]): [string, boolean] => [
    `content.${name}`,
    answer,
  ]),
  ...Object.entries(controls.seats).map(([name, answer]): [string, boolean] => [
    `seats.${name}`,
    answer,
  ]),
]

const refused = (controls: PlanControls): readonly string[] =>
  leaves(controls)
    .filter(([, answer]) => !answer)
    .map(([name]) => name)

describe('the admin draws every control there is', () => {
  it('answers true for every one of them, at both levels, with none left false', () => {
    expect(refused(ADMIN_CONTROLS)).toEqual([])
    expect(leaves(ADMIN_CONTROLS)).toHaveLength(22)
  })

  it('draws all eighteen content controls and all four seat controls', () => {
    expect(Object.values(ADMIN_CONTROLS.content)).toHaveLength(18)
    expect(Object.values(ADMIN_CONTROLS.seats)).toHaveLength(4)
  })

  it('answers exactly the questions planCapabilities answers, group for group and name for name', () => {
    const asked = planCapabilities('manage', PLAN)
    expect(Object.keys(ADMIN_CONTROLS).sort()).toEqual(Object.keys(asked).sort())
    expect(Object.keys(ADMIN_CONTROLS.content).sort()).toEqual(Object.keys(asked.content).sort())
    expect(Object.keys(ADMIN_CONTROLS.seats).sort()).toEqual(Object.keys(asked.seats).sort())
  })
})

describe('the admin is not a role, which is why this is a constant and not a call', () => {
  it('is not a role the projection would even accept, let alone answer for', () => {
    expect(Role.safeParse('admin').success).toBe(false)
    expect(Role.options).toEqual(['view', 'write', 'manage'])
  })

  it('coincides with a plan manage seat, so what is missing is the scope and not the answers', () => {
    expect(ADMIN_CONTROLS).toEqual(planCapabilities('manage', PLAN))
  })

  it('differs from that same role in any other scope, which is the scope there is none of', () => {
    expect(refused(planCapabilities('manage', PROJECT))).not.toEqual([])
    expect(ADMIN_CONTROLS).not.toEqual(planCapabilities('manage', PROJECT))
  })

  it.each(['view', 'write'] as const)('differs from a %s seat of the same plan', (role) => {
    expect(ADMIN_CONTROLS).not.toEqual(planCapabilities(role, PLAN))
  })
})
