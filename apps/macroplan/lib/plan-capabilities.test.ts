import {
  ACTION_DECISIONS,
  capabilities,
  mayReach,
  Role,
  type CapabilityAction,
  type RoleValue,
  type ScopeValue,
} from '@repo/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { problemAnswer } from '../components/plan/testing/fake-plan-api'
import { PLAN_A, WRITE_SEAT_TOKEN } from '../components/plan/testing/plan-fixture'
import { planCapabilities, type PlanContentControls } from './plan-capabilities'
import { ACTION_REFUSALS, plainRefusal } from './refusal'

// The two modules whose exports this file compares the controls against are reached through the
// same mocks `components/plan/admin-actions.test.ts` uses, so importing eighteen `'use server'`
// actions here cannot touch a cookie or re-render anything. `lib/api` is deliberately **not**
// mocked: the last describe drives a real client over a stubbed `fetch`, which is the only way the
// refusal sentence it asserts is the one the app would really show.
vi.mock('next/cache', () => ({ refresh: () => undefined }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`)
  },
}))

const { ADMIN_PLAN_ACTIONS } = await import('../components/plan/admin-actions')
const { seatPlanActions } = await import('../components/plan/seat-actions')

const PLAN: ScopeValue = { kind: 'plan', planId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

const SEAT_ACTIONS = ['share:read', 'share:update', 'share:revoke'] as const

const ROLES: readonly RoleValue[] = ['view', 'write', 'manage']

// Which action of the record each content control asks about, stated here rather than read out of
// the implementation, so a control wired to the like-named action of another entity fails this file
// instead of passing quietly. Every pair was checked against the `authorize()` call the handler
// makes (`apps/api/src/routes/macroplan/{epics,features,items}/handlers.ts`), which is what
// `ACTION_DECISIONS`' target column is itself held to. `recolourEpic` shares `epic:rename` because
// that PATCH is one gate for a name, a colour or both.
const WRITES: Readonly<Record<keyof PlanContentControls, CapabilityAction>> = {
  createEpic: 'epic:create',
  renameEpic: 'epic:rename',
  recolourEpic: 'epic:rename',
  reorderEpic: 'epic:reorder',
  removeEpic: 'epic:delete',
  createFeature: 'feature:create',
  renameFeature: 'feature:rename',
  estimateFeature: 'feature:estimate',
  pinFeature: 'feature:pin',
  placeFeature: 'feature:place',
  setDependencies: 'feature:depend',
  removeFeature: 'feature:delete',
  createItem: 'item:create',
  renameItem: 'item:rename',
  estimateItem: 'item:estimate',
  describeItem: 'item:describe',
  placeItem: 'item:place',
  removeItem: 'item:delete',
}

const CONTROLS = Object.keys(WRITES) as readonly (keyof PlanContentControls)[]

const drawn = (role: RoleValue, scope: ScopeValue = PLAN): readonly string[] =>
  Object.entries(planCapabilities(role, scope).content)
    .filter(([, answer]) => answer)
    .map(([name]) => name)
    .sort()

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

  it('gates none of the eighteen writes on a second target, which is why the record answers them', () => {
    for (const control of CONTROLS) {
      expect(ACTION_DECISIONS[WRITES[control]].alsoGatedOn, control).toBeUndefined()
    }
  })

  it('names a plan-family target on every one of them, which is what a plan scope reaches', () => {
    const targets = new Set(CONTROLS.map((control) => ACTION_DECISIONS[WRITES[control]].target))
    expect([...targets].sort()).toEqual(['epic', 'feature', 'item'])
  })
})

describe('planCapabilities answers each seat action the way the server decides it', () => {
  it('tells a manage seat it may do all four, which reading three off the record would deny', () => {
    expect(planCapabilities('manage', PLAN).seats).toEqual({
      read: true,
      create: true,
      update: true,
      revoke: true,
    })
  })

  it.each(['view', 'write'] as const)('tells a %s seat it may do none of the four', (role) => {
    expect(planCapabilities(role, PLAN).seats).toEqual({
      read: false,
      create: false,
      update: false,
      revoke: false,
    })
  })

  it('disagrees with the record on three of the four, which is the whole reason it exists', () => {
    const record = capabilities('manage', PLAN)
    const asked = planCapabilities('manage', PLAN).seats
    expect([record['share:read'], record['share:update'], record['share:revoke']]).toEqual([
      false,
      false,
      false,
    ])
    expect([asked.read, asked.update, asked.revoke]).toEqual([true, true, true])
  })

  it('reads share:create off the record on purpose, its target being own-scope and not the plan', () => {
    expect(capabilities('manage', PLAN)['share:create']).toBe(
      planCapabilities('manage', PLAN).seats.create,
    )
    expect(capabilities('view', PLAN)['share:create']).toBe(
      planCapabilities('view', PLAN).seats.create,
    )
    expect(mayReach('manage', PLAN, 'share:create', 'own-scope')).toBe(true)
  })

  it('answers exactly the four questions a share manager asks, and no more', () => {
    expect(Object.keys(planCapabilities('manage', PLAN).seats).sort()).toEqual([
      'create',
      'read',
      'revoke',
      'update',
    ])
  })
})

describe('the eighteen content controls are the eighteen writes, and neither more nor fewer', () => {
  it('holds one boolean per member of PlanEditActions, which the admin wiring enumerates', () => {
    expect(Object.keys(planCapabilities('manage', PLAN).content).sort()).toEqual(
      Object.keys(ADMIN_PLAN_ACTIONS).sort(),
    )
    expect([...CONTROLS].sort()).toEqual(Object.keys(ADMIN_PLAN_ACTIONS).sort())
    expect(CONTROLS).toHaveLength(18)
  })

  it('draws no nineteenth for the plan itself, there being no such action on either surface', () => {
    const asked: readonly string[] = Object.values(WRITES)
    expect(asked).not.toContain('plan:rename')
    expect(asked).not.toContain('plan:retime')
    expect(asked).not.toContain('plan:delete')
    expect(Object.keys(planCapabilities('manage', PLAN)).sort()).toEqual(['content', 'seats'])
  })

  it('keeps the seat four out of the content group, so no create is mistaken for a createEpic', () => {
    const content: Record<string, boolean> = { ...planCapabilities('manage', PLAN).content }
    expect(content['create']).toBeUndefined()
    expect(content['createEpic']).toBe(true)
  })
})

describe('each content control is the record’s own answer for the action behind it', () => {
  it.each(ROLES)('answers every one of the eighteen as the record answers a %s seat', (role) => {
    const asked = planCapabilities(role, PLAN).content
    const record = capabilities(role, PLAN)
    for (const control of CONTROLS) {
      expect(asked[control], control).toBe(record[WRITES[control]])
      expect(asked[control], control).toBe(
        mayReach(role, PLAN, WRITES[control], ACTION_DECISIONS[WRITES[control]].target),
      )
    }
  })

  it('draws nothing at all for a view seat, every one of the eighteen being a write', () => {
    expect(drawn('view')).toEqual([])
  })

  it('draws a write seat the seven that role is granted, and none of the manage eleven', () => {
    expect(drawn('write')).toEqual([
      'createFeature',
      'createItem',
      'describeItem',
      'estimateFeature',
      'estimateItem',
      'renameFeature',
      'renameItem',
    ])
  })

  it('draws a manage seat all eighteen', () => {
    expect(drawn('manage')).toEqual([...CONTROLS].sort())
  })

  it('answers a recolour exactly as it answers a rename, that PATCH being one gate', () => {
    for (const role of ROLES) {
      const asked = planCapabilities(role, PLAN).content
      expect(asked.recolourEpic, role).toBe(asked.renameEpic)
    }
  })
})

describe('the answers are for the scope handed in, never for a role alone (ADR 0038)', () => {
  const project: ScopeValue = { kind: 'project', projectId: '01HZZZZZZZZZZZZZZZZZZZZZZZ' }

  it('refuses a manage holder rooted in the other product the three plan-gated answers', () => {
    const asked = planCapabilities('manage', project).seats
    expect([asked.read, asked.update, asked.revoke]).toEqual([false, false, false])
  })

  it('leaves create true there, own-scope being the one target every scope reaches, plan or not', () => {
    expect(planCapabilities('manage', project).seats.create).toBe(true)
  })

  it('draws that holder no content control either, a project scope reaching no epic or item', () => {
    expect(drawn('manage', project)).toEqual([])
  })
})

describe('a control is a rendering answer and never a gate', () => {
  beforeEach(() => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
    vi.stubEnv('API_KEY', 'the-macroplan-service-key')
    vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
    vi.stubGlobal('fetch', () => Promise.resolve(problemAnswer(403, 'Not permitted: epic:create')))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('answers about a role, and the admin is not one, so no synthetic role can be passed through', () => {
    expect(Role.safeParse('admin').success).toBe(false)
    expect(Role.options).toEqual(['view', 'write', 'manage'])
  })

  it('surfaces the refusal’s own sentence when a seat re-roled after render clicks a drawn control', async () => {
    expect(planCapabilities('manage', PLAN).content.createEpic).toBe(true)
    expect(await seatPlanActions(WRITE_SEAT_TOKEN).createEpic(PLAN_A, { name: 'Billing' })).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.link),
    })
  })

  it('leaves the action callable where the control was never drawn, the API being the only gate', async () => {
    expect(planCapabilities('view', PLAN).content.createEpic).toBe(false)
    const answer = await seatPlanActions(WRITE_SEAT_TOKEN).createEpic(PLAN_A, { name: 'Billing' })
    expect(answer).toMatchObject({ ok: false, status: 403 })
    expect(answer).not.toMatchObject({ detail: 'Not permitted: epic:create' })
  })

  it('wires all eighteen whatever the controls answer, which is what makes that the case', () => {
    expect(Object.keys(seatPlanActions(WRITE_SEAT_TOKEN)).sort()).toEqual(
      Object.keys(planCapabilities('view', PLAN).content).sort(),
    )
  })
})
