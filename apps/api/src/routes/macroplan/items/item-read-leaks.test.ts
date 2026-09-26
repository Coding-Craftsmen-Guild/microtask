import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import type { ApiEnv } from '../../../auth/env.js'
import { IDS, TOKENS, adminJson, asLink, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

// The name the fixture gives task one in Microtask. Written out because the sweep below asserts it is
// **absent**, and a negative assertion against a string the fixture does not use passes for the wrong
// reason: the first draft of this file looked for 'Task one', which appears nowhere, so it could not
// have failed however the route behaved.
const TASK_NAME = 'Write the spec'

const PLAN = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const RAIL = `${PLAN}/epics/${PLAN_IDS.e1}`
const ITEM = `${PLAN}/items/${PLAN_IDS.i1}`

type App = OpenAPIHono<ApiEnv>

/**
 * Binds the rail at `manage` and links the item, both as the admin.
 *
 * The binding is at `manage` on purpose: a `view` binding attenuates every caller down to `view`, so the
 * link would be withheld from everybody and the cases below could not tell the rule from a blanket
 * refusal. With it at `manage` the answer turns on the **reader's own plan role**, which is what §7.3
 * decides and what this file is about.
 */
const linked = async (app: App): Promise<void> => {
  const bound = await app.request(`${RAIL}/binding`, {
    method: 'PUT',
    headers: adminJson(),
    body: JSON.stringify({ token: TOKENS.p1Manage, role: 'manage' }),
  })
  if (bound.status !== 200) throw new Error(`the fixture could not bind the rail: ${String(bound.status)}`)
  const link = await app.request(`${ITEM}/link`, {
    method: 'PUT',
    headers: adminJson(),
    body: JSON.stringify({ taskId: IDS.t1 }),
  })
  if (link.status !== 200) throw new Error(`the fixture could not link the item: ${String(link.status)}`)
}

const readItemAs = async (app: App, token: string): Promise<Record<string, unknown>> => {
  const response = await app.request(ITEM, { headers: asLink(token) })
  expect(response.status).toBe(200)
  return body(response)
}

const readPlanAs = async (app: App, token: string): Promise<unknown> => {
  const response = await app.request(PLAN, { headers: asLink(token) })
  expect(response.status).toBe(200)
  const plan = await body(response)
  const items = plan['items']
  if (!Array.isArray(items)) throw new Error('a plan response carries items')
  const first: unknown = items.find((each: { id?: unknown }) => each.id === PLAN_IDS.i1)
  return (first as { linkedTaskId?: unknown } | undefined)?.linkedTaskId ?? null
}

/**
 * `GET /plans/{planId}/items/{itemId}` against design §7.3, which it used to disagree with.
 *
 * The route is gated on `plan:read` alone — reading an item is reading part of the plan, and no narrower
 * scope exists for a seat to hold (ADR 0053) — so **every** reader of the plan reaches it. It answered the
 * item as stored, which was harmless until phase 4 wrote `linkedTaskId` and then was not: a plan `view`
 * seat was refused the link by `planView` in the timeline and handed it by this route in the drawer. One
 * fact, two answers, one API.
 *
 * The phase-4 gate was never breached, and that distinction is worth keeping straight rather than
 * flattening into "there was a leak": the gate is "a `view` holder provably never receives a linked task's
 * **name**", and a name is only ever read through the bridge, which attenuates on its own. What this route
 * leaked was the weaker fact that a link exists at all — an id, never a name — which §7.3 withholds just
 * the same.
 *
 * Both halves are asserted here rather than only the refusal, because a route that answered `null` for
 * everybody would pass a one-sided sweep while being just as wrong in the other direction.
 */
describe('GET /items/{itemId} tells a reader about a link exactly when the timeline does', () => {
  it('withholds the linked task id from a view seat, as the timeline does', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    expect(await readItemAs(app, PLAN_TOKENS.view)).toMatchObject({ linkedTaskId: null })
  })

  it('carries it for a write seat, so the refusal above is a rule and not a blanket', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    expect(await readItemAs(app, PLAN_TOKENS.write)).toMatchObject({ linkedTaskId: IDS.t1 })
  })

  it('carries it for a manage seat too', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    expect(await readItemAs(app, PLAN_TOKENS.manage)).toMatchObject({ linkedTaskId: IDS.t1 })
  })

  it('never names the task, whoever asks — this route reads no bridge at all', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    for (const token of [PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage]) {
      expect(JSON.stringify(await readItemAs(app, token))).not.toContain(TASK_NAME)
    }
  })

  it('is not vacuous about the name: the bridge does hand it to a write seat', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    const bridge = await app.request(`${PLAN}/bridge`, { headers: asLink(PLAN_TOKENS.write) })
    expect(bridge.status).toBe(200)
    expect(JSON.stringify(await body(bridge))).toContain(TASK_NAME)
  })

  it('agrees with the plan response for all three seats, which is the disagreement it closed', async () => {
    const { app } = await buildMacroplanFixture()
    await linked(app)
    for (const token of [PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage]) {
      const inDrawer = (await readItemAs(app, token))['linkedTaskId'] ?? null
      expect(inDrawer).toBe(await readPlanAs(app, token))
    }
  })

  it('still answers the description, so the shaping did not replace the body', async () => {
    const { app } = await buildMacroplanFixture()
    await app.request(`${ITEM}/description`, {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ description: 'Check the invoice totals' }),
    })
    await linked(app)
    expect(await readItemAs(app, PLAN_TOKENS.view)).toMatchObject({
      description: 'Check the invoice totals',
      linkedTaskId: null,
    })
  })
})
