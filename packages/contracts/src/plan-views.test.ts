import { describe, expect, it } from 'vitest'
import { EntityId } from './document.js'
import { capabilities } from './capabilities.js'
import { LIMITS } from './limits.js'
import { PlanManifest } from './plan.js'
import { UpdateEpicPayload, UpdatePlanPayload } from './plan-payloads.js'
import { CreatePlanShareLinkPayload } from './plan-share-payloads.js'
import { ItemView, PlanList, PlanListItem, PlanShareView, PlanView } from './plan-views.js'
import { IgnoredEdge, ScheduleView, UnscheduledEntry } from './schedule-view.js'
import { DependenciesPayload, UpdateFeaturePayload, UpdateItemPayload } from './structure-payloads.js'

const ulid = (seed: number): string => `01M240ERCRWWCN16Q5AH${String(seed).padStart(6, '0')}`

const ID = ulid(1)
const STAMP = '2026-09-10T00:00:00.000Z'

const plan = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ID,
  name: 'Launch',
  startDate: '2026-01-05',
  sprintLengthDays: 10,
  timezone: 'UTC',
  epics: [],
  features: [],
  items: [],
  shareLinks: [],
  createdAt: STAMP,
  updatedAt: STAMP,
  ...over,
})

describe('UpdateFeaturePayload, where undefined and null must stay distinguishable', () => {
  it('refuses an empty body, so a pointless PATCH is a 422 rather than a stamped no-op', () => {
    expect(UpdateFeaturePayload.safeParse({}).success).toBe(false)
  })

  it('parses an explicit clear and carries the key, proving null survives as a key', () => {
    const parsed = UpdateFeaturePayload.safeParse({ estimateDays: null })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'estimateDays' in parsed.data).toBe(true)
  })

  it('leaves the key off when estimateDays is only omitted, proving leave-alone differs from clear', () => {
    const parsed = UpdateFeaturePayload.safeParse({ name: 'Renamed' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'estimateDays' in parsed.data).toBe(false)
  })

  it('keeps its shape introspectable after .refine(), which the OpenAPI generator needs', () => {
    expect(Object.keys(UpdateFeaturePayload.shape)).toEqual(['name', 'estimateDays', 'pinSprint'])
    expect(() => UpdateFeaturePayload.extend({ epicId: EntityId })).not.toThrow()
  })

  it('throws from .omit() after .refine(), so a derived schema must start from an unrefined one', () => {
    /** Zod 4.6 refuses .omit(), .pick(), .partial() and .merge() on a refined object, at construction. */
    expect(() => UpdateFeaturePayload.omit({ pinSprint: true })).toThrow(/refinements/u)
  })
})

describe('the other three Update*Payload schemas, refusing an empty body the same way', () => {
  it.each([
    ['UpdatePlanPayload', UpdatePlanPayload, { name: 'Relaunch' }],
    ['UpdateEpicPayload', UpdateEpicPayload, { colour: '#1f2a37' }],
    ['UpdateItemPayload', UpdateItemPayload, { estimateDays: null }],
  ] as const)('refuses an empty %s and accepts a body carrying one field', (_label, schema, oneField) => {
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse(oneField).success).toBe(true)
  })
})

describe('PlanListItem, which a list of 200 plans at the item cap must not carry contents in', () => {
  it('has no epics, features or items key', () => {
    expect(Object.keys(PlanListItem.shape)).not.toContain('epics')
    expect(Object.keys(PlanListItem.shape)).not.toContain('features')
    expect(Object.keys(PlanListItem.shape)).not.toContain('items')
  })

  it('parses a settings-and-counts row with no contents present', () => {
    const row = {
      id: ID,
      name: 'Launch',
      startDate: '2026-01-05',
      sprintLengthDays: 10,
      timezone: 'UTC',
      epicCount: 2,
      featureCount: 5,
      itemCount: 30,
      createdAt: STAMP,
      updatedAt: STAMP,
    }
    expect(PlanListItem.safeParse(row).success).toBe(true)
    expect(PlanList.safeParse({ plans: [row] }).success).toBe(true)
  })
})

describe('PlanView versus PlanManifest, since a stored manifest must never carry a schedule', () => {
  const schedule = { spans: [], cycles: [], unscheduled: [], ignoredEdges: [] }

  it('accepts a plan view carrying its schedule', () => {
    expect(PlanView.safeParse(plan({ schedule })).success).toBe(true)
  })

  it('refuses a plan view with no schedule, since the field is required, not optional', () => {
    expect(PlanView.safeParse(plan()).success).toBe(false)
  })

  it('has a schedule key that PlanManifest does not, so a schedule can never land in storage', () => {
    expect(Object.keys(PlanView.shape)).toContain('schedule')
    expect(Object.keys(PlanManifest.shape)).not.toContain('schedule')
  })

  it('strips a schedule key off a stored manifest, PlanManifest not declaring one to keep', () => {
    expect(PlanManifest.safeParse(plan()).success).toBe(true)
    const parsed = PlanManifest.safeParse(plan({ schedule }))
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'schedule' in parsed.data).toBe(false)
  })
})

describe('DependenciesPayload, bounded by the plan-wide edge budget', () => {
  it('accepts a list at the cap and refuses one past it', () => {
    const atCap = Array.from({ length: LIMITS.edgesPerPlan }, (_, i) => ulid(i))
    const overCap = [...atCap, ulid(LIMITS.edgesPerPlan)]
    expect(DependenciesPayload.safeParse({ dependsOn: atCap }).success).toBe(true)
    expect(DependenciesPayload.safeParse({ dependsOn: overCap }).success).toBe(false)
  })
})

describe('ItemView, which adds the description its own file holds', () => {
  it('parses an item with its description alongside its own fields', () => {
    const item = {
      id: ID,
      featureId: ulid(2),
      name: 'Write the migration',
      position: 0,
      estimateDays: 1,
      linkedTaskId: null,
      createdAt: STAMP,
      updatedAt: STAMP,
      description: 'Backfill the new column.',
    }
    expect(ItemView.safeParse(item).success).toBe(true)
  })
})

describe('CreatePlanShareLinkPayload, which takes no scope because a plan has exactly one', () => {
  it('mints from a name and a role alone', () => {
    expect(CreatePlanShareLinkPayload.safeParse({ name: 'Acme', role: 'view' }).success).toBe(true)
  })

  it('has no scope or planId field to state a fact the route path already states', () => {
    expect(Object.keys(CreatePlanShareLinkPayload.shape)).toEqual(['name', 'role'])
  })

  it('strips a scope or planId a caller sends anyway, rather than accepting a second statement', () => {
    const parsed = CreatePlanShareLinkPayload.parse({
      name: 'Acme',
      role: 'view',
      scope: { kind: 'plan', planId: ID },
      planId: ID,
    })
    expect(parsed).not.toHaveProperty('scope')
    expect(parsed).not.toHaveProperty('planId')
  })
})

/**
 * Nothing here reads `@repo/schedule`: this package may not depend on it, so these assertions pin
 * these schemas' own members and spellings and cannot notice the package's diverging. The two are
 * compared where both may be imported — `apps/api`'s `agreement.test.ts`, Task 17, which asserts
 * `schedule()` called on the fixture manifest deep-equals the `schedule` block of the plan response.
 */
describe('ScheduleView, the schedule as it crosses the wire', () => {
  it('parses a schedule with one span, one cycle, one unscheduled entry and one ignored edge', () => {
    const view = {
      spans: [{ id: ID, startDay: 0, endDay: 3 }],
      cycles: [{ featureIds: [ID, ulid(2)] }],
      unscheduled: [{ id: ulid(3), reason: 'no-estimate' }],
      ignoredEdges: [{ featureId: ulid(4), dependsOnId: ulid(5) }],
    }
    expect(ScheduleView.safeParse(view).success).toBe(true)
  })

  it('names an ignored edge as a fourth conflict channel, distinct from a cycle or an unscheduled entry', () => {
    const view = {
      spans: [{ id: ID, startDay: 0, endDay: 1 }],
      cycles: [],
      unscheduled: [],
      ignoredEdges: [{ featureId: ID, dependsOnId: ulid(2) }],
    }
    const parsed = ScheduleView.safeParse(view)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.cycles).toHaveLength(0)
    expect(parsed.data.unscheduled).toHaveLength(0)
    expect(parsed.data.ignoredEdges).toHaveLength(1)
    expect(parsed.data.spans).toHaveLength(1)
  })

  it('declares UnscheduledReason as exactly no-estimate and in-cycle, no more', () => {
    expect(UnscheduledEntry.safeParse({ id: ID, reason: 'no-estimate' }).success).toBe(true)
    expect(UnscheduledEntry.safeParse({ id: ID, reason: 'in-cycle' }).success).toBe(true)
    expect(UnscheduledEntry.safeParse({ id: ID, reason: 'blocked' }).success).toBe(false)
  })

  it('names IgnoredEdge’s fields featureId and dependsOnId, not any other spelling', () => {
    expect(Object.keys(IgnoredEdge.shape)).toEqual(['featureId', 'dependsOnId'])
  })
})

describe('PlanShareView, the answer a plan seat gets about itself', () => {
  const view = {
    role: 'write',
    scope: { kind: 'plan', planId: ID },
    plan: { id: ID, name: 'Roadmap' },
  }

  it('parses a role, a plan scope and the plan that scope names', () => {
    expect(PlanShareView.safeParse(view).success).toBe(true)
  })

  it('has no token field of any kind, so no answer can carry a live credential (ADR 0033)', () => {
    expect(Object.keys(PlanShareView.shape)).toEqual(['role', 'scope', 'plan'])
  })

  it('strips a token a caller somehow provoked, absence being the guarantee rather than a filter', () => {
    expect(PlanShareView.parse({ ...view, token: 'shr_a_live_credential_x' })).not.toHaveProperty('token')
  })

  it('refuses a project scope, this being the answer of the product that has none', () => {
    const scope = { kind: 'project', projectId: ID }
    expect(PlanShareView.safeParse({ ...view, scope }).success).toBe(false)
  })

  it('refuses a role the policy does not name', () => {
    expect(PlanShareView.safeParse({ ...view, role: 'owner' }).success).toBe(false)
  })

  it('carries what capabilities() takes, so the client computes the set the answer does not', () => {
    const parsed = PlanShareView.parse(view)
    expect(capabilities(parsed.role, parsed.scope)['feature:create']).toBe(true)
    expect(capabilities(parsed.role, parsed.scope)['epic:create']).toBe(false)
  })
})
