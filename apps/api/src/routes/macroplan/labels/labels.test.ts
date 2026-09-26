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
const LABELS = `${ONE}/labels`
const LABEL = `${LABELS}/${PLAN_IDS.l1}`

interface Group {
  readonly id: string
  readonly name: string
  readonly colour: string
}

interface Grouped {
  readonly id: string
  readonly epicId: string
  readonly labelId: string | null
}

const groupsOf = (found: Record<string, unknown>): Group[] => found['labels'] as Group[]

const featuresOf = (found: Record<string, unknown>): Grouped[] => found['features'] as Grouped[]

const send = async (
  method: string,
  path: string,
  payload?: unknown,
): Promise<Response> =>
  (await buildMacroplanApp()).request(path, {
    method,
    ...(payload === undefined
      ? { headers: admin() }
      : { headers: adminJson(), body: JSON.stringify(payload) }),
  })

const labelPath = (featureId: string): string => `${ONE}/features/${featureId}/label`

describe('POST /v1/macroplan/plans/{planId}/labels', () => {
  it('answers 200 and the whole plan, because the body is the plan and not the label', async () => {
    const response = await send('POST', LABELS, { name: 'Phase 3' })
    expect(response.status).toBe(200)
    const parsed = PlanView.safeParse(await response.json())
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('adds the group at the end, keeping the two the fixture holds', async () => {
    const found = await body(await send('POST', LABELS, { name: 'Phase 3' }))
    expect(groupsOf(found).map((one) => one.name)).toEqual(['Phase 1', 'Phase 2', 'Phase 3'])
  })

  it('takes the colour asked for, and picks one when the body names none', async () => {
    const chosen = await body(await send('POST', LABELS, { name: 'Phase 3', colour: '#123456' }))
    const fallback = await body(await send('POST', LABELS, { name: 'Phase 3' }))
    expect(groupsOf(chosen)[2]?.colour).toBe('#123456')
    expect(groupsOf(fallback)[2]?.colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('refuses an uppercase colour, one spelling per colour being what lets a client compare', async () => {
    expect((await send('POST', LABELS, { name: 'Phase 3', colour: '#ABCDEF' })).status).toBe(422)
  })

  it('answers 404 for a plan that is not there', async () => {
    const path = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.missing}/labels`
    expect((await send('POST', path, { name: 'Phase 3' })).status).toBe(404)
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/labels/{labelId}', () => {
  it('renames and recolours, and moves no feature', async () => {
    const found = await body(await send('PATCH', LABEL, { name: 'Launch', colour: '#0a0b0c' }))
    expect(groupsOf(found)[0]).toMatchObject({ name: 'Launch', colour: '#0a0b0c' })
    expect(featuresOf(found).map((one) => one.id)).toHaveLength(6)
  })

  it('refuses an empty body, a request asking for nothing being no write', async () => {
    expect((await send('PATCH', LABEL, {})).status).toBe(422)
  })

  it('answers 404 for a label this plan does not hold', async () => {
    expect((await send('PATCH', `${LABELS}/${PLAN_IDS.missing}`, { name: 'Launch' })).status).toBe(404)
  })
})

describe('DELETE /v1/macroplan/plans/{planId}/labels/{labelId}', () => {
  it('removes the group and answers the plan that remains', async () => {
    const found = await body(await send('DELETE', LABEL))
    expect(groupsOf(found).map((one) => one.id)).toEqual([PLAN_IDS.l2])
  })

  /**
   * The one thing a reader of `DELETE /epics/{epicId}` beside it would guess wrongly: a rail is where
   * work lives, so deleting one deletes the work, and a group is a way of seeing work that lives
   * somewhere else. So every feature stays, on its own rail, in no group.
   */
  it('deletes no feature, clearing the group off the two that were in it instead', async () => {
    const app = await buildMacroplanApp()
    for (const featureId of [PLAN_IDS.f1, PLAN_IDS.f3]) {
      await app.request(labelPath(featureId), {
        method: 'PUT',
        headers: adminJson(),
        body: JSON.stringify({ labelId: PLAN_IDS.l1 }),
      })
    }
    const before = await body(await app.request(ONE, { headers: admin() }))
    expect(featuresOf(before).filter((one) => one.labelId === PLAN_IDS.l1)).toHaveLength(2)
    const after = await body(await app.request(LABEL, { method: 'DELETE', headers: admin() }))
    expect(featuresOf(after)).toHaveLength(6)
    expect(featuresOf(after).every((one) => one.labelId === null)).toBe(true)
  })

  it('answers 404 for a label this plan does not hold', async () => {
    expect((await send('DELETE', `${LABELS}/${PLAN_IDS.missing}`)).status).toBe(404)
  })
})

describe('PUT /v1/macroplan/plans/{planId}/features/{featureId}/label', () => {
  /** The whole point of a group: one release spread over rails that are otherwise unrelated. */
  it('groups features on two different rails under one label', async () => {
    const app = await buildMacroplanApp()
    await app.request(labelPath(PLAN_IDS.f1), {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ labelId: PLAN_IDS.l1 }),
    })
    const found = await body(
      await app.request(labelPath(PLAN_IDS.f3), {
        method: 'PUT',
        headers: adminJson(),
        body: JSON.stringify({ labelId: PLAN_IDS.l1 }),
      }),
    )
    const grouped = featuresOf(found).filter((one) => one.labelId === PLAN_IDS.l1)
    expect(grouped.map((one) => one.epicId)).toEqual([PLAN_IDS.e1, PLAN_IDS.e2])
  })

  it('takes a feature out of a group with null', async () => {
    const app = await buildMacroplanApp()
    await app.request(labelPath(PLAN_IDS.f1), {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ labelId: PLAN_IDS.l1 }),
    })
    const found = await body(
      await app.request(labelPath(PLAN_IDS.f1), {
        method: 'PUT',
        headers: adminJson(),
        body: JSON.stringify({ labelId: null }),
      }),
    )
    expect(featuresOf(found)[0]?.labelId).toBeNull()
  })

  it('refuses a body with no labelId, so no request clears a group by accident', async () => {
    expect((await send('PUT', labelPath(PLAN_IDS.f1), {})).status).toBe(422)
  })

  /** A field of the body rather than the thing addressed, so 422 and not 404 (ADR 0050). */
  it('refuses a label this plan does not hold with 422, which is how a cross-plan group is refused', async () => {
    const response = await send('PUT', labelPath(PLAN_IDS.f1), { labelId: PLAN_IDS.missing })
    expect(response.status).toBe(422)
  })

  it('answers 404 for a feature that is not there', async () => {
    expect((await send('PUT', labelPath(PLAN_IDS.missing), { labelId: PLAN_IDS.l1 })).status).toBe(404)
  })

  /** A group is a way of seeing a plan, never a constraint on it: `@repo/schedule` reads no label. */
  it('moves no span, the schedule reading no group at all', async () => {
    const { app } = await buildMacroplanFixture()
    const before = await body(await app.request(ONE, { headers: admin() }))
    const after = await body(
      await app.request(labelPath(PLAN_IDS.f1), {
        method: 'PUT',
        headers: adminJson(),
        body: JSON.stringify({ labelId: PLAN_IDS.l1 }),
      }),
    )
    expect(after['schedule']).toEqual(before['schedule'])
  })
})
