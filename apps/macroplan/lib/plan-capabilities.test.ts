import { ACTION_DECISIONS, capabilities, mayReach, type ScopeValue } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { planCapabilities } from './plan-capabilities'

const PLAN: ScopeValue = { kind: 'plan', planId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

const SEAT_ACTIONS = ['share:read', 'share:update', 'share:revoke'] as const

describe('the record this helper exists because of', () => {
  it.each(SEAT_ACTIONS)(
    'records %s against the project, with the plan only as a second target',
    (action) => {
      expect(ACTION_DECISIONS[action].target).toBe('project')
      expect(ACTION_DECISIONS[action].alsoGatedOn).toEqual(['plan'])
    },
  )

  it.each(SEAT_ACTIONS)(
    'answers %s false off the record for a plan manage seat the server serves',
    (action) => {
      expect(capabilities('manage', PLAN)[action]).toBe(false)
      expect(mayReach('manage', PLAN, action, 'plan')).toBe(true)
    },
  )

  it('records share:create against own-scope instead, which every scope reaches by definition', () => {
    expect(ACTION_DECISIONS['share:create'].target).toBe('own-scope')
    expect(ACTION_DECISIONS['share:create'].alsoGatedOn).toBeUndefined()
    expect(capabilities('manage', PLAN)['share:create']).toBe(true)
  })
})

describe('planCapabilities answers each seat action the way the server decides it', () => {
  it('tells a manage seat it may do all four, which reading three off the record would deny', () => {
    expect(planCapabilities('manage', PLAN)).toEqual({
      read: true,
      create: true,
      update: true,
      revoke: true,
    })
  })

  it.each(['view', 'write'] as const)('tells a %s seat it may do none of the four', (role) => {
    expect(planCapabilities(role, PLAN)).toEqual({
      read: false,
      create: false,
      update: false,
      revoke: false,
    })
  })

  it('disagrees with the record on three of the four, which is the whole reason it exists', () => {
    const record = capabilities('manage', PLAN)
    const asked = planCapabilities('manage', PLAN)
    expect([record['share:read'], record['share:update'], record['share:revoke']]).toEqual([
      false,
      false,
      false,
    ])
    expect([asked.read, asked.update, asked.revoke]).toEqual([true, true, true])
  })

  it('reads share:create off the record on purpose, its target being own-scope and not the plan', () => {
    expect(capabilities('manage', PLAN)['share:create']).toBe(planCapabilities('manage', PLAN).create)
    expect(capabilities('view', PLAN)['share:create']).toBe(planCapabilities('view', PLAN).create)
    expect(mayReach('manage', PLAN, 'share:create', 'own-scope')).toBe(true)
  })

  it('answers exactly the four questions a share manager asks, and no more', () => {
    expect(Object.keys(planCapabilities('manage', PLAN)).sort()).toEqual([
      'create',
      'read',
      'revoke',
      'update',
    ])
  })
})

describe('the answers are for the scope handed in, never for a role alone (ADR 0038)', () => {
  const project: ScopeValue = { kind: 'project', projectId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

  it('refuses a manage holder rooted in the other product the three plan-gated answers', () => {
    const asked = planCapabilities('manage', project)
    expect([asked.read, asked.update, asked.revoke]).toEqual([false, false, false])
  })

  it('leaves create true there, own-scope being the one target every scope reaches, plan or not', () => {
    expect(planCapabilities('manage', project).create).toBe(true)
  })
})
