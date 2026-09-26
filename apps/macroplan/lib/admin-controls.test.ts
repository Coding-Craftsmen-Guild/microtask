import { Role, type ScopeValue } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { ADMIN_CONTROLS } from './admin-controls'
import { planCapabilities, type PlanControls } from './plan-capabilities'

const PLAN: ScopeValue = { kind: 'plan', planId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

const PROJECT: ScopeValue = { kind: 'project', projectId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

// Both groups flattened to one list of `group.control` pairs, so a sweep below reads every boolean
// the type holds at either level rather than the twenty-eight and then, separately, the four.
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
    expect(leaves(ADMIN_CONTROLS)).toHaveLength(32)
  })

  it('draws all twenty-eight content controls and all four seat controls', () => {
    expect(Object.values(ADMIN_CONTROLS.content)).toHaveLength(28)
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

  // **Phase 4 is where these two stopped coinciding**, and the divergence is the point rather than a
  // regression. Through phase 3 every control an admin drew a plan manage seat drew too, so the only
  // difference between them was the scope. `epic:bind` is the first action a control asks about whose
  // minimum is `'admin'` — design §7.3 puts it there because an epic's binding is the ceiling on
  // everything a link holder reaches in Microtask, so a holder that could re-role one could raise its
  // own — and the two binding controls are therefore the first an admin draws and no seat does.
  it('coincides with a plan manage seat on every control but the two admin-only ones', () => {
    const seat = planCapabilities('manage', PLAN)
    expect(ADMIN_CONTROLS.seats).toEqual(seat.seats)
    const differ = Object.keys(ADMIN_CONTROLS.content).filter(
      (name) => ADMIN_CONTROLS.content[name as keyof typeof seat.content] !== seat.content[name as keyof typeof seat.content],
    )
    expect(differ.sort()).toEqual(['bindEpic', 'unbindEpic'])
  })

  it('is the surface that holds those two, so the difference is not the seat being stronger', () => {
    expect([ADMIN_CONTROLS.content.bindEpic, ADMIN_CONTROLS.content.unbindEpic]).toEqual([true, true])
    const seat = planCapabilities('manage', PLAN).content
    expect([seat.bindEpic, seat.unbindEpic]).toEqual([false, false])
  })

  it('differs from that same role in any other scope, which is the scope there is none of', () => {
    expect(refused(planCapabilities('manage', PROJECT))).not.toEqual([])
    expect(ADMIN_CONTROLS).not.toEqual(planCapabilities('manage', PROJECT))
  })

  it.each(['view', 'write'] as const)('differs from a %s seat of the same plan', (role) => {
    expect(ADMIN_CONTROLS).not.toEqual(planCapabilities(role, PLAN))
  })
})
