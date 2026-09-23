import { describe, expect, it } from 'vitest'
import { PlanView } from '@repo/contracts'
import { admin, adminJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const EPICS = `${ONE}/epics`
const FIXTURE_RAILS = [PLAN_IDS.e1, PLAN_IDS.e2, PLAN_IDS.e3]

interface Rail {
  readonly id: string
  readonly name: string
  readonly colour: string
  readonly railOrder: number
  readonly binding: unknown
}

const railsOf = (found: Record<string, unknown>): Rail[] => found['epics'] as Rail[]

const railOrders = (found: Record<string, unknown>): [string, number][] =>
  [...railsOf(found)]
    .sort((left, right) => left.railOrder - right.railOrder)
    .map((one) => [one.id, one.railOrder])

const idsOf = (found: Record<string, unknown>, key: string): string[] =>
  (found[key] as { id: string }[]).map((one) => one.id)

const post = async (payload: unknown): Promise<Response> =>
  (await buildMacroplanApp()).request(EPICS, {
    method: 'POST',
    headers: adminJson(),
    body: JSON.stringify(payload),
  })

describe('POST /v1/macroplan/plans/{planId}/epics', () => {
  it('answers 200 and the whole plan, because the body is the plan and not the rail', async () => {
    const response = await post({ name: 'Growth' })
    expect(response.status).toBe(200)
    const parsed = PlanView.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('appends the rail at the bottom, work being added in the order it is discovered', async () => {
    const found = await body(await post({ name: 'Growth' }))
    const added = railsOf(found).find((one) => !FIXTURE_RAILS.includes(one.id))
    expect(added).toMatchObject({ name: 'Growth', railOrder: 3, binding: null })
    expect(railsOf(found)).toHaveLength(4)
  })

  it('falls back to one fixed colour rather than to a rotating palette', async () => {
    const found = await body(await post({ name: 'Growth' }))
    const added = railsOf(found).find((one) => !FIXTURE_RAILS.includes(one.id))
    expect(added?.colour).toBe('#3355ff')
  })

  it('takes the colour the body names when it names one', async () => {
    const found = await body(await post({ name: 'Growth', colour: '#112233' }))
    const added = railsOf(found).find((one) => !FIXTURE_RAILS.includes(one.id))
    expect(added?.colour).toBe('#112233')
  })

  it('carries a schedule, so a caller never has to re-fetch the plan to draw it', async () => {
    const found = await body(await post({ name: 'Growth' }))
    expect(Object.keys(found['schedule'] as object).sort()).toEqual([
      'cycles',
      'ignoredEdges',
      'spans',
      'unscheduled',
    ])
  })

  it('refuses a body with no name with a 422 naming json', async () => {
    const response = await post({ colour: '#112233' })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/epics/{epicId}', () => {
  const patch = async (epicId: string, payload: unknown): Promise<Response> =>
    (await buildMacroplanApp()).request(`${EPICS}/${epicId}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify(payload),
    })

  it('renames one rail and moves nothing on it', async () => {
    const found = await body(await patch(PLAN_IDS.e1, { name: 'Basket and checkout' }))
    const renamed = railsOf(found).find((one) => one.id === PLAN_IDS.e1)
    expect(renamed).toMatchObject({ name: 'Basket and checkout', railOrder: 0 })
    expect(idsOf(found, 'features')).toEqual([
      PLAN_IDS.f1,
      PLAN_IDS.f2,
      PLAN_IDS.f3,
      PLAN_IDS.f4,
      PLAN_IDS.f5,
      PLAN_IDS.f6,
    ])
  })

  it('refuses an empty body with a 422, rather than stamping updatedAt for nothing', async () => {
    const response = await patch(PLAN_IDS.e1, {})
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })

  it('answers 404 for a well-formed epic id that belongs to nothing', async () => {
    const response = await patch(PLAN_IDS.missing, { name: 'Nowhere' })
    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ code: 'not_found' })
  })

  it('answers 422 for an epic id that is not a ULID, which is a different failure', async () => {
    const response = await patch('not-a-ulid', { name: 'Nowhere' })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'param' })
  })
})

describe('the binding a PATCH may not write, which phase 4 owns (spec §9)', () => {
  it('ignores a binding in the body and leaves the stored one null', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(`${EPICS}/${PLAN_IDS.e1}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({
        name: 'Checkout',
        binding: { projectId: PLAN_IDS.plan, role: 'manage' },
      }),
    })
    expect(response.status).toBe(200)
    const stored = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
    expect(stored?.epics.find((one) => one.id === PLAN_IDS.e1)?.binding).toBeNull()
  })

  it('does not answer a binding either, the key being stripped before the handler runs', async () => {
    const found = await body(
      await (await buildMacroplanApp()).request(`${EPICS}/${PLAN_IDS.e1}`, {
        method: 'PATCH',
        headers: adminJson(),
        body: JSON.stringify({ name: 'Checkout', binding: { projectId: PLAN_IDS.plan } }),
      }),
    )
    expect(railsOf(found).find((one) => one.id === PLAN_IDS.e1)?.binding).toBeNull()
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/epics/{epicId}/placement', () => {
  const place = async (epicId: string, railOrder: number): Promise<Response> =>
    (await buildMacroplanApp()).request(`${EPICS}/${epicId}/placement`, {
      method: 'PATCH',
      headers: adminJson(),
      body: JSON.stringify({ railOrder }),
    })

  it('moves one rail to the top and renumbers the rest densely', async () => {
    const found = await body(await place(PLAN_IDS.e3, 0))
    expect(railOrders(found)).toEqual([
      [PLAN_IDS.e3, 0],
      [PLAN_IDS.e1, 1],
      [PLAN_IDS.e2, 2],
    ])
  })

  it('clamps a rail order past the end to last, a drag to the bottom needing no count', async () => {
    const found = await body(await place(PLAN_IDS.e1, 99))
    expect(railOrders(found)).toEqual([
      [PLAN_IDS.e2, 0],
      [PLAN_IDS.e3, 1],
      [PLAN_IDS.e1, 2],
    ])
  })

  it('leaves the features on every rail at the positions they had', async () => {
    const found = await body(await place(PLAN_IDS.e3, 0))
    const features = found['features'] as { id: string; epicId: string; position: number }[]
    expect(features.map((one) => [one.id, one.position])).toEqual([
      [PLAN_IDS.f1, 0],
      [PLAN_IDS.f2, 1],
      [PLAN_IDS.f3, 0],
      [PLAN_IDS.f4, 1],
      [PLAN_IDS.f5, 0],
      [PLAN_IDS.f6, 1],
    ])
  })
})

describe('DELETE /v1/macroplan/plans/{planId}/epics/{epicId}', () => {
  const remove = async (epicId: string): Promise<Response> =>
    (await buildMacroplanApp()).request(`${EPICS}/${epicId}`, {
      method: 'DELETE',
      headers: admin(),
    })

  it('answers 200 and the plan that remains, which is the point of the cascade', async () => {
    const response = await remove(PLAN_IDS.e1)
    expect(response.status).toBe(200)
    expect(railOrders(await body(response))).toEqual([
      [PLAN_IDS.e2, 0],
      [PLAN_IDS.e3, 1],
    ])
  })

  it('carries nothing under the removed rail in features or items', async () => {
    const found = await body(await remove(PLAN_IDS.e1))
    expect(idsOf(found, 'features')).toEqual([
      PLAN_IDS.f3,
      PLAN_IDS.f4,
      PLAN_IDS.f5,
      PLAN_IDS.f6,
    ])
    expect(idsOf(found, 'items')).toEqual([
      PLAN_IDS.i3,
      PLAN_IDS.i4,
      PLAN_IDS.i5,
      PLAN_IDS.i6,
      PLAN_IDS.i7,
      PLAN_IDS.i8,
      PLAN_IDS.i9,
    ])
  })

  it('strips every edge that named a removed feature, on every rail', async () => {
    const found = await body(await remove(PLAN_IDS.e1))
    const features = found['features'] as { id: string; dependsOn: string[] }[]
    expect(features.map((one) => [one.id, one.dependsOn])).toEqual([
      [PLAN_IDS.f3, []],
      [PLAN_IDS.f4, []],
      [PLAN_IDS.f5, []],
      [PLAN_IDS.f6, []],
    ])
  })

  it('re-derives the schedule over what is left, the waiting rail no longer waiting', async () => {
    const found = await body(await remove(PLAN_IDS.e1))
    const spans = (found['schedule'] as { spans: { id: string; startDay: number; endDay: number }[] }).spans
    expect(spans.find((one) => one.id === PLAN_IDS.f3)).toEqual({
      id: PLAN_IDS.f3,
      startDay: 0,
      endDay: 3,
    })
    expect(spans.find((one) => one.id === PLAN_IDS.f4)).toEqual({
      id: PLAN_IDS.f4,
      startDay: 3,
      endDay: 5,
    })
  })

  it('takes the item files of the removed branch off the store, not only the manifest', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await app.request(`${EPICS}/${PLAN_IDS.e1}`, { method: 'DELETE', headers: admin() })
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i1)).toBeNull()
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i2)).toBeNull()
    expect(await deps.plans.readItem('macroplan', PLAN_IDS.plan, PLAN_IDS.i3)).not.toBeNull()
  })

  it('answers 404 for a well-formed epic id that belongs to nothing', async () => {
    expect((await remove(PLAN_IDS.missing)).status).toBe(404)
  })

  it('answers 422 for an epic id that is not a ULID', async () => {
    expect((await remove('not-a-ulid')).status).toBe(422)
  })
})
