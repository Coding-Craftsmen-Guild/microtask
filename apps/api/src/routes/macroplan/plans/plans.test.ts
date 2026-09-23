import { describe, expect, it } from 'vitest'
import { PlanListItem, PlanView } from '@repo/contracts'
import { admin, adminJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TIMEZONE,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const COLLECTION = `${MACROPLAN_PREFIX}/plans`
const ONE = `${COLLECTION}/${PLAN_IDS.plan}`

const drafted = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name: 'Q1 roadmap', startDate: '2026-03-02', ...extra })

/**
 * The spans `@repo/schedule`'s own example tests pin, flattened and ordered as `planSchedule`
 * promises: by `startDay`, ties broken by ascending id. Feature ids and item ids share this one
 * array, exactly as they share the `days` map it is built from.
 */
const SPANS: readonly { id: string; startDay: number; endDay: number }[] = [
  { id: PLAN_IDS.f1, startDay: 0, endDay: 4 },
  { id: PLAN_IDS.f5, startDay: 0, endDay: 9 },
  { id: PLAN_IDS.i1, startDay: 0, endDay: 1 },
  { id: PLAN_IDS.i5, startDay: 0, endDay: 2 },
  { id: PLAN_IDS.i2, startDay: 1, endDay: 4 },
  { id: PLAN_IDS.i6, startDay: 2, endDay: 5 },
  { id: PLAN_IDS.f2, startDay: 4, endDay: 7 },
  { id: PLAN_IDS.f3, startDay: 4, endDay: 7 },
  { id: PLAN_IDS.i3, startDay: 4, endDay: 5 },
  { id: PLAN_IDS.i4, startDay: 5, endDay: 7 },
  { id: PLAN_IDS.i7, startDay: 5, endDay: 9 },
  { id: PLAN_IDS.f4, startDay: 7, endDay: 9 },
  { id: PLAN_IDS.f6, startDay: 9, endDay: 14 },
  { id: PLAN_IDS.i8, startDay: 9, endDay: 11 },
  { id: PLAN_IDS.i9, startDay: 11, endDay: 14 },
]

const scheduleOf = (found: Record<string, unknown>): Record<string, unknown> =>
  found['schedule'] as Record<string, unknown>

describe('POST /v1/macroplan/plans', () => {
  it('creates a plan and answers 201, not 200', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: drafted(),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({
      name: 'Q1 roadmap',
      startDate: '2026-03-02',
      sprintLengthDays: 10,
      timezone: 'UTC',
      epics: [],
      features: [],
      items: [],
    })
  })

  it('answers a body the contract recognises as a PlanView, schedule included', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: drafted({ sprintLengthDays: 14, timezone: PLAN_TIMEZONE }),
    })
    const parsed = PlanView.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.success).toBe(true)
  })

  it('sets no Location header, the created plan being the body rather than a redirect', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: drafted(),
    })
    expect(response.headers.get('location')).toBeNull()
  })

  it('serves the created plan back from its own address', async () => {
    const app = await buildMacroplanApp()
    const created = await body(
      await app.request(COLLECTION, { method: 'POST', headers: adminJson(), body: drafted() }),
    )
    const read = await app.request(`${COLLECTION}/${String(created['id'])}`, { headers: admin() })
    expect(read.status).toBe(200)
    expect(await body(read)).toMatchObject({ id: created['id'], name: 'Q1 roadmap' })
  })

  it('refuses a body with no startDate with a 422 naming json, rather than inventing one', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ name: 'Q1 roadmap' }),
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })

  it('refuses a startDate that is not zero-padded, because YYYY-MM-DD is the whole format', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ name: 'Q1 roadmap', startDate: '2026-1-5' }),
    })
    expect(response.status).toBe(422)
  })

  it('stores no schedule on the manifest it wrote, the schedule being derived on every read', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const created = await body(
      await app.request(COLLECTION, { method: 'POST', headers: adminJson(), body: drafted() }),
    )
    const stored = await deps.plans.readManifest('macroplan', String(created['id']))
    expect(stored).not.toBeNull()
    expect(Object.keys(stored ?? {})).not.toContain('schedule')
  })
})

describe('GET /v1/macroplan/plans', () => {
  it('lists every plan for the admin', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, { headers: admin() })
    expect(response.status).toBe(200)
    const listed = (await body(response))['plans'] as { id: string }[]
    expect(listed.map((one) => one.id)).toContain(PLAN_IDS.plan)
  })

  it('carries counts and no contents, so a list of 200 plans is not 400,000 items', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, { headers: admin() })
    const listed = (await body(response))['plans'] as Record<string, unknown>[]
    const row = listed.find((one) => one['id'] === PLAN_IDS.plan) ?? {}
    expect(row).toMatchObject({ epicCount: 3, featureCount: 6, itemCount: 9, shareLinkCount: 3 })
    for (const key of ['epics', 'features', 'items', 'shareLinks', 'schedule']) {
      expect(Object.keys(row)).not.toContain(key)
    }
    expect(PlanListItem.safeParse(row).success).toBe(true)
  })
})

describe('GET /v1/macroplan/plans/{planId}', () => {
  it('serves the plan and its three rails to the admin', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, { headers: admin() })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({
      id: PLAN_IDS.plan,
      name: 'Roadmap',
      timezone: PLAN_TIMEZONE,
    })
  })

  it('carries the spans the schedule unit tests pin, in the order the view promises', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, { headers: admin() })
    expect(scheduleOf(await body(response))['spans']).toEqual(SPANS)
  })

  it('places the waiting rail behind the feature it depends on, which is the cross-rail case', async () => {
    const spans = scheduleOf(await body(await (await buildMacroplanApp()).request(ONE, { headers: admin() })))[
      'spans'
    ] as { id: string; startDay: number; endDay: number }[]
    const at = (id: string): unknown => spans.find((span) => span.id === id)
    expect(at(PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 4 })
    expect(at(PLAN_IDS.f3)).toEqual({ id: PLAN_IDS.f3, startDay: 4, endDay: 7 })
    expect(at(PLAN_IDS.f5)).toEqual({ id: PLAN_IDS.f5, startDay: 0, endDay: 9 })
  })

  it('reports nothing unscheduled, no cycle and no dropped edge for a plan that agrees with itself', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, { headers: admin() })
    expect(scheduleOf(await body(response))).toMatchObject({
      cycles: [],
      unscheduled: [],
      ignoredEdges: [],
    })
  })

  it('stores none of that schedule, which the fixture manifest is proof of', async () => {
    const { deps } = await buildMacroplanFixture()
    const stored = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
    expect(Object.keys(stored ?? {})).not.toContain('schedule')
  })

  it('answers 404 for a well-formed id that belongs to nothing', async () => {
    const response = await (await buildMacroplanApp()).request(
      `${COLLECTION}/${PLAN_IDS.missing}`,
      { headers: admin() },
    )
    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ code: 'not_found' })
  })

  it('answers 422 for an id that is not a ULID, which is a different failure from 404', async () => {
    const response = await (await buildMacroplanApp()).request(`${COLLECTION}/not-a-ulid`, {
      headers: admin(),
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'param' })
  })
})

describe('PATCH /v1/macroplan/plans/{planId}', () => {
  it('renames a plan and leaves its rails alone', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({ name: 'The roadmap' }),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ name: 'The roadmap' })
  })

  it('retimes a plan, and the spans stay working-day offsets from the new origin', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({ startDate: '2026-02-02', sprintLengthDays: 14 }),
    })
    expect(await body(response)).toMatchObject({ startDate: '2026-02-02', sprintLengthDays: 14 })
    expect(scheduleOf(await body(await (await buildMacroplanApp()).request(ONE, { headers: admin() })))['spans']).toEqual(SPANS)
  })

  it('refuses an empty body with a 422, rather than stamping updatedAt for nothing', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })
})

describe('DELETE /v1/macroplan/plans/{planId}', () => {
  it('answers 204 with an empty body', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, {
      method: 'DELETE',
      headers: admin(),
    })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('makes the plan a 404 afterwards, and takes its items off the store with it', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await app.request(ONE, { method: 'DELETE', headers: admin() })
    const read = await app.request(ONE, { headers: admin() })
    expect(read.status).toBe(404)
    expect(await deps.plans.readManifest('macroplan', PLAN_IDS.plan)).toBeNull()
  })
})
