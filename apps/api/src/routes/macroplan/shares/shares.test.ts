import { describe, expect, it } from 'vitest'
import { PlanShareView, capabilities, type RoleValue, type ScopeValue } from '@repo/contracts'
import { SERVICE_KEY, TOKENS, admin, asLink, body, linkJson } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanApp,
} from '../../../testing/macroplan-harness.js'

const CURRENT = `${MACROPLAN_PREFIX}/shares/current`
const SEATS = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}/share-links`

const asSeat = async (token: string): Promise<Response> =>
  (await buildMacroplanApp()).request(CURRENT, { headers: asLink(token) })

describe('GET /v1/macroplan/shares/current', () => {
  it('answers the presenting seat its role, its scope and the plan that scope names', async () => {
    const response = await asSeat(PLAN_TOKENS.write)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({
      role: 'write',
      scope: { kind: 'plan', planId: PLAN_IDS.plan },
      plan: { id: PLAN_IDS.plan, name: 'Roadmap' },
    })
  })

  it('satisfies the shape its route declares, so the document and the answer are one thing', async () => {
    const parsed = PlanShareView.safeParse(await (await asSeat(PLAN_TOKENS.manage)).json())
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('carries no token at all, its own included, so no response can leak a live credential', async () => {
    const found = await body(await asSeat(PLAN_TOKENS.manage))
    expect(JSON.stringify(found)).not.toContain(PLAN_TOKENS.manage)
    expect('token' in found).toBe(false)
  })

  it('answers each role with its own, which is what a client reads its authority from', async () => {
    const app = await buildMacroplanApp()
    const roles: string[] = []
    for (const token of [PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage]) {
      roles.push((await body(await app.request(CURRENT, { headers: asLink(token) })))['role'] as string)
    }
    expect(roles).toEqual(['view', 'write', 'manage'])
  })

  it('gives a client the two inputs capabilities() takes, and they answer for that seat', async () => {
    const found = await body(await asSeat(PLAN_TOKENS.view))
    const answers = capabilities(found['role'] as RoleValue, found['scope'] as ScopeValue)
    expect(answers['plan:read']).toBe(true)
    expect(answers['feature:create']).toBe(false)
    expect(answers['workspace:list-plans']).toBe(false)
  })

  it('answers the role the manifest holds and not the one the token was minted with', async () => {
    const app = await buildMacroplanApp()
    const downgraded = await app.request(`${SEATS}/${PLAN_TOKENS.manage}`, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.manage),
      body: JSON.stringify({ role: 'view' }),
    })
    expect(downgraded.status).toBe(200)
    const found = await body(await app.request(CURRENT, { headers: asLink(PLAN_TOKENS.manage) }))
    expect(found['role']).toBe('view')
  })

  it('names the plan a seat on the colliding plan holds, the scope deciding which plan', async () => {
    expect(await body(await asSeat(PLAN_TOKENS.collidingManage))).toMatchObject({
      plan: { name: 'A plan holding a project id' },
    })
  })

  it('refuses a request carrying no credentials at all with 401', async () => {
    expect((await (await buildMacroplanApp()).request(CURRENT)).status).toBe(401)
  })

  it('refuses a service key with no bearer, a key conferring no authority', async () => {
    const response = await (await buildMacroplanApp()).request(CURRENT, {
      headers: { 'x-api-key': SERVICE_KEY },
    })
    expect(response.status).toBe(401)
  })

  it('refuses a bearer that names nobody, so a revoked seat gets no answer about itself', async () => {
    const response = await asSeat('shr_nobody_holds_this_tok')
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ code: 'unknown_principal' })
  })

  it('answers the admin 404, which names no seat rather than being refused the question', async () => {
    const response = await (await buildMacroplanApp()).request(CURRENT, { headers: admin() })
    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ code: 'not_found' })
  })

  it('refuses a live Microtask seat 403, naming the action and never the caller own product', async () => {
    const response = await asSeat(TOKENS.p1Manage)
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({
      code: 'forbidden',
      detail: 'Not permitted: plan:read',
    })
  })

  it('refuses every Microtask seat the same way, whatever its role or scope', async () => {
    const app = await buildMacroplanApp()
    const statuses: number[] = []
    for (const token of Object.values(TOKENS)) {
      statuses.push((await app.request(CURRENT, { headers: asLink(token) })).status)
    }
    expect(statuses).toEqual(statuses.map(() => 403))
    expect(statuses).toHaveLength(5)
  })

  it('takes no token in its address, the one a caller sends staying in the header (ADR 0013)', async () => {
    const response = await (await buildMacroplanApp()).request(
      `${CURRENT}/${PLAN_TOKENS.manage}`,
      { headers: asLink(PLAN_TOKENS.manage) },
    )
    expect(response.status).toBe(404)
  })
})
