import { describe, expect, it } from 'vitest'
import { LIMITS, PlanView } from '@repo/contracts'
import type { ApiDeps } from '../../../deps.js'
import { feature, marked } from '@repo/macroplan-domain/testing'
import { admin, adminJson, body, linkJson } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const FEATURES = `${ONE}/features`
const FIXTURE_FEATURES: readonly string[] = [
  PLAN_IDS.f1,
  PLAN_IDS.f2,
  PLAN_IDS.f3,
  PLAN_IDS.f4,
  PLAN_IDS.f5,
  PLAN_IDS.f6,
]

interface Span {
  readonly id: string
  readonly startDay: number
  readonly endDay: number
}

interface Schedule {
  readonly spans: readonly Span[]
  readonly cycles: readonly unknown[]
  readonly unscheduled: readonly { id: string; reason: string }[]
  readonly ignoredEdges: readonly unknown[]
}

const scheduleOf = (found: Record<string, unknown>): Schedule => found['schedule'] as Schedule

const spanOf = (found: Record<string, unknown>, id: string): Span | undefined =>
  scheduleOf(found).spans.find((one) => one.id === id)

const featuresOf = (
  found: Record<string, unknown>,
): { id: string; epicId: string; position: number; estimateDays: number | null; pinSprint: number | null }[] =>
  found['features'] as {
    id: string
    epicId: string
    position: number
    estimateDays: number | null
    pinSprint: number | null
  }[]

const post = async (payload: unknown): Promise<Response> =>
  (await buildMacroplanApp()).request(FEATURES, {
    method: 'POST',
    headers: adminJson(),
    body: JSON.stringify(payload),
  })

const patch = async (featureId: string, payload: unknown): Promise<Response> =>
  (await buildMacroplanApp()).request(`${FEATURES}/${featureId}`, {
    method: 'PATCH',
    headers: adminJson(),
    body: JSON.stringify(payload),
  })

/**
 * Grows the fixture plan to `total` features, so the cap can be probed from exactly one below it.
 *
 * The padding sits on the Search rail and is estimated, so the plan it makes is a real one the
 * forward pass places rather than a bag of unschedulable rows the limit happens to count.
 */
const padTo = async (deps: ApiDeps, total: number): Promise<void> => {
  const plan = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
  if (plan === null) throw new Error('the fixture plan is missing')
  const extra = Array.from({ length: total - plan.features.length }, (_unused, index) =>
    feature(marked('FT', 10 + index), PLAN_IDS.e3, { name: 'Padding', position: 2 + index }),
  )
  await deps.plans.saveManifest('macroplan', { ...plan, features: [...plan.features, ...extra] })
}

describe('POST /v1/macroplan/plans/{planId}/features', () => {
  it('answers 200 and the whole plan, the body being the plan and not the feature', async () => {
    const response = await post({ epicId: PLAN_IDS.e1, name: 'Vouchers' })
    expect(response.status).toBe(200)
    const parsed = PlanView.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('appends the feature after the last one on its rail', async () => {
    const found = await body(await post({ epicId: PLAN_IDS.e1, name: 'Vouchers' }))
    const added = featuresOf(found).find((one) => !FIXTURE_FEATURES.includes(one.id))
    expect(added).toMatchObject({ epicId: PLAN_IDS.e1, position: 2, estimateDays: null })
  })

  it('leaves an unestimated new feature off the axis rather than drawing it at a guess', async () => {
    const found = await body(await post({ epicId: PLAN_IDS.e1, name: 'Vouchers' }))
    const added = featuresOf(found).find((one) => !FIXTURE_FEATURES.includes(one.id))
    expect(scheduleOf(found).unscheduled).toEqual([{ id: added?.id, reason: 'no-estimate' }])
  })

  it('refuses a rail that is not in this plan with a 422, an epicId being a body field', async () => {
    const response = await post({ epicId: PLAN_IDS.missing, name: 'Vouchers' })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid' })
  })
})

describe('the plan-wide feature cap, probed at the cap itself', () => {
  const add = async (app: Awaited<ReturnType<typeof buildMacroplanApp>>): Promise<Response> =>
    app.request(FEATURES, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ epicId: PLAN_IDS.e1, name: 'One more' }),
    })

  it(`refuses the feature that would make ${String(LIMITS.featuresPerPlan + 1)}, naming the limit`, async () => {
    const { app, deps } = await buildMacroplanFixture()
    await padTo(deps, LIMITS.featuresPerPlan)
    const response = await add(app)
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({
      code: 'invalid',
      detail: `Too many features in this plan — the limit is ${String(LIMITS.featuresPerPlan)}`,
    })
  })

  it('accepts the one before it, so the refusal above is the cap and not the padding', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await padTo(deps, LIMITS.featuresPerPlan - 1)
    const response = await add(app)
    expect(response.status).toBe(200)
    expect(featuresOf(await body(response))).toHaveLength(LIMITS.featuresPerPlan)
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/features/{featureId}', () => {
  it('renames one feature and moves nothing', async () => {
    const found = await body(await patch(PLAN_IDS.f1, { name: 'The basket' }))
    expect(featuresOf(found).find((one) => one.id === PLAN_IDS.f1)).toMatchObject({
      name: 'The basket',
      position: 0,
      epicId: PLAN_IDS.e1,
    })
  })

  it('clears an estimate with null and takes that feature off the axis', async () => {
    const found = await body(await patch(PLAN_IDS.f2, { estimateDays: null }))
    expect(featuresOf(found).find((one) => one.id === PLAN_IDS.f2)?.estimateDays).toBeNull()
    expect(scheduleOf(found).unscheduled).toEqual([{ id: PLAN_IDS.f2, reason: 'no-estimate' }])
    expect(spanOf(found, PLAN_IDS.f2)).toBeUndefined()
  })

  it('does not cut its rail in two: the features either side keep the spans they had', async () => {
    const found = await body(await patch(PLAN_IDS.f2, { estimateDays: null }))
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 0, endDay: 4 })
    expect(spanOf(found, PLAN_IDS.f4)).toEqual({ id: PLAN_IDS.f4, startDay: 7, endDay: 9 })
    expect(scheduleOf(found).ignoredEdges).toEqual([])
  })

  it('moves a pinned feature to sprint times sprint length, and everything after it on its rail', async () => {
    const found = await body(await patch(PLAN_IDS.f1, { pinSprint: 3 }))
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 30, endDay: 34 })
    expect(spanOf(found, PLAN_IDS.f2)).toEqual({ id: PLAN_IDS.f2, startDay: 34, endDay: 37 })
  })

  it('moves it the same way for a manage seat, the pin being a manage authority now', async () => {
    const response = await (await buildMacroplanApp()).request(`${FEATURES}/${PLAN_IDS.f1}`, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.manage),
      body: JSON.stringify({ pinSprint: 3 }),
    })
    expect(response.status).toBe(200)
    const found = await body(response)
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 30, endDay: 34 })
    expect(spanOf(found, PLAN_IDS.f2)).toEqual({ id: PLAN_IDS.f2, startDay: 34, endDay: 37 })
  })

  it('carries its items with it, and the rail it does not touch stays where it was', async () => {
    const found = await body(await patch(PLAN_IDS.f1, { pinSprint: 3 }))
    expect(spanOf(found, PLAN_IDS.i1)).toEqual({ id: PLAN_IDS.i1, startDay: 30, endDay: 31 })
    expect(spanOf(found, PLAN_IDS.i2)).toEqual({ id: PLAN_IDS.i2, startDay: 31, endDay: 34 })
    expect(spanOf(found, PLAN_IDS.f3)).toEqual({ id: PLAN_IDS.f3, startDay: 34, endDay: 37 })
    expect(spanOf(found, PLAN_IDS.f5)).toEqual({ id: PLAN_IDS.f5, startDay: 0, endDay: 9 })
  })

  it('refuses an empty body with a 422', async () => {
    const response = await patch(PLAN_IDS.f1, {})
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })

  it('answers 404 for a well-formed feature id that belongs to nothing, and 422 for junk', async () => {
    expect((await patch(PLAN_IDS.missing, { name: 'Nowhere' })).status).toBe(404)
    expect((await patch('not-a-ulid', { name: 'Nowhere' })).status).toBe(422)
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/features/{featureId}/placement', () => {
  const place = async (featureId: string, to: unknown): Promise<Response> =>
    (await buildMacroplanApp()).request(`${FEATURES}/${featureId}/placement`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify(to),
    })

  it('moves a feature onto another rail and renumbers both densely', async () => {
    const found = await body(await place(PLAN_IDS.f6, { epicId: PLAN_IDS.e1, position: 0 }))
    const placed = featuresOf(found).map((one) => [one.id, one.epicId, one.position])
    expect(placed).toEqual([
      [PLAN_IDS.f1, PLAN_IDS.e1, 1],
      [PLAN_IDS.f2, PLAN_IDS.e1, 2],
      [PLAN_IDS.f3, PLAN_IDS.e2, 0],
      [PLAN_IDS.f4, PLAN_IDS.e2, 1],
      [PLAN_IDS.f5, PLAN_IDS.e3, 0],
      [PLAN_IDS.f6, PLAN_IDS.e1, 0],
    ])
  })

  it('re-schedules the rail it arrived on', async () => {
    const found = await body(await place(PLAN_IDS.f6, { epicId: PLAN_IDS.e1, position: 0 }))
    expect(spanOf(found, PLAN_IDS.f6)).toEqual({ id: PLAN_IDS.f6, startDay: 0, endDay: 5 })
    expect(spanOf(found, PLAN_IDS.f1)).toEqual({ id: PLAN_IDS.f1, startDay: 5, endDay: 9 })
    expect(spanOf(found, PLAN_IDS.f2)).toEqual({ id: PLAN_IDS.f2, startDay: 9, endDay: 12 })
  })

  it('re-schedules the rail it left, which now ends where its one feature does', async () => {
    const found = await body(await place(PLAN_IDS.f6, { epicId: PLAN_IDS.e1, position: 0 }))
    expect(spanOf(found, PLAN_IDS.f5)).toEqual({ id: PLAN_IDS.f5, startDay: 0, endDay: 9 })
    expect(spanOf(found, PLAN_IDS.i9)).toEqual({ id: PLAN_IDS.i9, startDay: 2, endDay: 5 })
  })

  it('carries the feature whole, its estimate and its edges crossing untouched', async () => {
    const found = await body(await place(PLAN_IDS.f3, { epicId: PLAN_IDS.e3, position: 0 }))
    const moved = found['features'] as { id: string; estimateDays: number | null; dependsOn: string[] }[]
    expect(moved.find((one) => one.id === PLAN_IDS.f3)).toMatchObject({
      estimateDays: 3,
      dependsOn: [PLAN_IDS.f1],
    })
  })

  it('refuses a rail that is not in this plan with a 422', async () => {
    const response = await place(PLAN_IDS.f1, { epicId: PLAN_IDS.missing, position: 0 })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid' })
  })
})

describe('DELETE /v1/macroplan/plans/{planId}/features/{featureId}', () => {
  const remove = async (featureId: string): Promise<Response> =>
    (await buildMacroplanApp()).request(`${FEATURES}/${featureId}`, {
      method: 'DELETE',
      headers: admin(),
    })

  it('answers 200 and the plan that remains, its items and edges gone with it', async () => {
    const response = await remove(PLAN_IDS.f1)
    expect(response.status).toBe(200)
    const found = await body(response)
    expect(featuresOf(found).map((one) => one.id)).toEqual([
      PLAN_IDS.f2,
      PLAN_IDS.f3,
      PLAN_IDS.f4,
      PLAN_IDS.f5,
      PLAN_IDS.f6,
    ])
    const edges = found['features'] as { id: string; dependsOn: string[] }[]
    expect(edges.find((one) => one.id === PLAN_IDS.f3)?.dependsOn).toEqual([])
  })

  it('takes the item files under it off the store, not only the manifest', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await app.request(`${FEATURES}/${PLAN_IDS.f1}`, { method: 'DELETE', headers: admin() })
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i1)).toBeNull()
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i3)).not.toBeNull()
  })

  it('answers 404 for a well-formed feature id that belongs to nothing, and 422 for junk', async () => {
    expect((await remove(PLAN_IDS.missing)).status).toBe(404)
    expect((await remove('not-a-ulid')).status).toBe(422)
  })
})
