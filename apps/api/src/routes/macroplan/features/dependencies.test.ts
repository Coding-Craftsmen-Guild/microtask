import { describe, expect, it } from 'vitest'
import { LIMITS } from '@repo/contracts'
import { epic, feature, marked } from '@repo/macroplan-domain/testing'
import { IDS, admin, adminJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const FEATURES = `${ONE}/features`

/** A rail and a feature belonging to the *other* plan in the fixture, which shares no ids with it. */
const OTHER_EPIC = marked('EP', 8)
const OTHER_FEATURE = marked('FT', 8)

interface Span {
  readonly id: string
  readonly startDay: number
  readonly endDay: number
}

interface Schedule {
  readonly spans: readonly Span[]
  readonly cycles: readonly { featureIds: readonly string[] }[]
  readonly ignoredEdges: readonly unknown[]
}

const scheduleOf = (found: Record<string, unknown>): Schedule => found['schedule'] as Schedule

const spanOf = (found: Record<string, unknown>, id: string): Span | undefined =>
  scheduleOf(found).spans.find((one) => one.id === id)

const edgesOf = (found: Record<string, unknown>, id: string): readonly string[] =>
  (found['features'] as { id: string; dependsOn: string[] }[]).find((one) => one.id === id)
    ?.dependsOn ?? []

const put = async (
  app: Awaited<ReturnType<typeof buildMacroplanApp>>,
  featureId: string,
  dependsOn: readonly string[],
): Promise<Response> =>
  app.request(`${FEATURES}/${featureId}/dependencies`, {
    method: 'PUT',
    headers: adminJson(),
    body: JSON.stringify({ dependsOn }),
  })

describe('PUT /v1/macroplan/plans/{planId}/features/{featureId}/dependencies', () => {
  it('moves the dependent feature to the day its predecessor ends, and reports no cycle', async () => {
    const app = await buildMacroplanApp()
    const response = await put(app, PLAN_IDS.f5, [PLAN_IDS.f2])
    expect(response.status).toBe(200)
    const found = await body(response)
    expect(spanOf(found, PLAN_IDS.f5)).toEqual({ id: PLAN_IDS.f5, startDay: 7, endDay: 16 })
    expect(scheduleOf(found).cycles).toEqual([])
    expect(scheduleOf(found).ignoredEdges).toEqual([])
  })

  it('carries the items of the feature it moved along with it', async () => {
    const found = await body(await put(await buildMacroplanApp(), PLAN_IDS.f5, [PLAN_IDS.f2]))
    expect(spanOf(found, PLAN_IDS.i5)).toEqual({ id: PLAN_IDS.i5, startDay: 7, endDay: 9 })
    expect(spanOf(found, PLAN_IDS.f6)).toEqual({ id: PLAN_IDS.f6, startDay: 16, endDay: 21 })
  })

  it('records the edge list it was given, replacing whatever was there', async () => {
    const found = await body(await put(await buildMacroplanApp(), PLAN_IDS.f3, []))
    expect(edgesOf(found, PLAN_IDS.f3)).toEqual([])
    expect(spanOf(found, PLAN_IDS.f3)).toEqual({ id: PLAN_IDS.f3, startDay: 0, endDay: 3 })
  })
})

describe('a dependency cycle is a 409, and it writes nothing', () => {
  it('answers 409 with a conflict code whose detail names both features', async () => {
    const response = await put(await buildMacroplanApp(), PLAN_IDS.f1, [PLAN_IDS.f3])
    expect(response.status).toBe(409)
    const problem = await body(response)
    expect(problem['code']).toBe('conflict')
    expect(String(problem['detail'])).toContain(PLAN_IDS.f1)
    expect(String(problem['detail'])).toContain(PLAN_IDS.f3)
  })

  it('leaves the plan exactly as it was, which a subsequent GET proves', async () => {
    const app = await buildMacroplanApp()
    await put(app, PLAN_IDS.f1, [PLAN_IDS.f3])
    const found = await body(await app.request(ONE, { headers: admin() }))
    expect(edgesOf(found, PLAN_IDS.f1)).toEqual([])
    expect(edgesOf(found, PLAN_IDS.f3)).toEqual([PLAN_IDS.f1])
    expect(scheduleOf(found).cycles).toEqual([])
  })
})

describe('an edge that would leave this plan, which is a 422 rather than a conflict', () => {
  it('refuses a self-edge, a feature that waits on itself being a bad field and not a clash', async () => {
    const response = await put(await buildMacroplanApp(), PLAN_IDS.f1, [PLAN_IDS.f1])
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({
      code: 'invalid',
      detail: 'A feature cannot depend on itself',
    })
  })

  it('refuses a feature id that belongs to another plan (spec §4.2, ADR 0050)', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const other = await deps.plans.readManifest('macroplan', IDS.p1)
    if (other === null) throw new Error('the colliding plan is missing')
    await deps.plans.saveManifest('macroplan', {
      ...other,
      epics: [epic(OTHER_EPIC, { name: 'Elsewhere' })],
      features: [feature(OTHER_FEATURE, OTHER_EPIC, { name: 'Not ours' })],
    })
    const response = await put(app, PLAN_IDS.f1, [OTHER_FEATURE])
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({
      code: 'invalid',
      detail: `No feature ${OTHER_FEATURE} in this plan`,
    })
  })

  it('refuses a well-formed id that names nothing anywhere, for the same reason', async () => {
    const response = await put(await buildMacroplanApp(), PLAN_IDS.f1, [PLAN_IDS.missing])
    expect(response.status).toBe(422)
  })

  it('writes nothing when it refuses one, which a subsequent GET proves', async () => {
    const app = await buildMacroplanApp()
    const refused = await put(app, PLAN_IDS.f4, [PLAN_IDS.f2, PLAN_IDS.missing])
    expect(refused.status).toBe(422)
    const found = await body(await app.request(ONE, { headers: admin() }))
    expect(edgesOf(found, PLAN_IDS.f4)).toEqual([PLAN_IDS.f2])
  })
})

describe('the plan-wide edge budget the payload itself states', () => {
  it(`refuses a list longer than ${String(LIMITS.edgesPerPlan)} with a 422 naming json`, async () => {
    const tooMany = Array.from({ length: LIMITS.edgesPerPlan + 1 }, (_unused, index) =>
      marked('FT', 100 + index),
    )
    const response = await put(await buildMacroplanApp(), PLAN_IDS.f1, tooMany)
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })
})
