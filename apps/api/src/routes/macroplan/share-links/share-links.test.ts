import { describe, expect, it } from 'vitest'
import { PlanShareLink } from '@repo/contracts'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../../../auth/env.js'
import { IDS, admin, adminJson, asLink, body, linkJson } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const ONE = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const SEATS = `${ONE}/share-links`
const OTHER_SEATS = `${MACROPLAN_PREFIX}/plans/${IDS.p1}/share-links`
const SEAT_FIELDS = ['createdAt', 'createdBy', 'name', 'role', 'token']

type App = OpenAPIHono<ApiEnv>

const mint = async (
  app: App,
  headers: Record<string, string>,
  payload: unknown,
): Promise<Response> =>
  app.request(SEATS, { method: 'POST', headers, body: JSON.stringify(payload) })

const mintedBy = async (app: App, token: string, name: string): Promise<string> => {
  const response = await mint(app, linkJson(token), { name, role: 'manage' })
  expect(response.status).toBe(201)
  return (await body(response))['token'] as string
}

const keysOf = (value: unknown): string[] => Object.keys(value as object).sort()

const seatsOf = async (
  deps: Awaited<ReturnType<typeof buildMacroplanFixture>>['deps'],
): Promise<Record<string, unknown>[]> => {
  const manifest = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
  return (manifest?.shareLinks ?? []) as unknown as Record<string, unknown>[]
}

describe('POST /v1/macroplan/plans/{planId}/share-links', () => {
  it('answers 201 with the five seat fields and no scope, a plan seat carrying none', async () => {
    const response = await mint(await buildMacroplanApp(), linkJson(PLAN_TOKENS.manage), {
      name: 'Acme',
      role: 'view',
    })
    expect(response.status).toBe(201)
    const minted = await body(response)
    expect(keysOf(minted)).toEqual(SEAT_FIELDS)
    expect(PlanShareLink.safeParse(minted).error?.issues ?? []).toEqual([])
  })

  it('records the presenting token as createdBy, so lineage is the credential and not the body', async () => {
    const response = await mint(await buildMacroplanApp(), linkJson(PLAN_TOKENS.manage), {
      name: 'Acme',
      role: 'write',
      createdBy: PLAN_TOKENS.view,
    })
    expect((await body(response))['createdBy']).toBe(PLAN_TOKENS.manage)
  })

  it('refuses a write seat with 403, a holder that could mint being able to mint itself manage', async () => {
    const response = await mint(await buildMacroplanApp(), linkJson(PLAN_TOKENS.write), {
      name: 'Acme',
      role: 'manage',
    })
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('refuses a view seat with 403 as well, minting being manage authority', async () => {
    const response = await mint(await buildMacroplanApp(), linkJson(PLAN_TOKENS.view), {
      name: 'Acme',
      role: 'view',
    })
    expect(response.status).toBe(403)
  })

  it('leaves the plan holding exactly the seats it started with when a write seat is refused', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await mint(app, linkJson(PLAN_TOKENS.write), { name: 'Acme', role: 'manage' })
    expect((await seatsOf(deps)).map((seat) => seat['token'])).toEqual([
      PLAN_TOKENS.view,
      PLAN_TOKENS.write,
      PLAN_TOKENS.manage,
    ])
  })

  it('records null for the admin, which descends from no seat at all', async () => {
    const response = await mint(await buildMacroplanApp(), adminJson(), {
      name: 'Acme',
      role: 'manage',
    })
    expect([response.status, (await body(response))['createdBy']]).toEqual([201, null])
  })

  it('refuses a manage seat on another plan, one plan being no other', async () => {
    const response = await mint(await buildMacroplanApp(), linkJson(PLAN_TOKENS.collidingManage), {
      name: 'Acme',
      role: 'view',
    })
    expect(response.status).toBe(403)
  })

  it('drops a scope naming another plan rather than honouring it, the payload declaring none', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await mint(app, linkJson(PLAN_TOKENS.manage), {
      name: 'Acme',
      role: 'manage',
      scope: { kind: 'plan', planId: IDS.p1 },
    })
    expect(response.status).toBe(201)
    const token = (await body(response))['token']
    const stored = (await seatsOf(deps)).find((seat) => seat['token'] === token)
    expect(keysOf(stored)).toEqual(SEAT_FIELDS)
  })

  it('answers 422 for a role the policy does not name, before anything is written', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await mint(app, linkJson(PLAN_TOKENS.manage), { name: 'Acme', role: 'owner' })
    expect(response.status).toBe(422)
    expect(await seatsOf(deps)).toHaveLength(3)
  })

  it('answers 404 for a plan that does not exist, the gate clearing an admin on any of them', async () => {
    const response = await (await buildMacroplanApp()).request(
      `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.missing}/share-links`,
      { method: 'POST', headers: adminJson(), body: JSON.stringify({ name: 'A', role: 'view' }) },
    )
    expect(response.status).toBe(404)
  })
})

describe('PATCH /v1/macroplan/plans/{planId}/share-links/{token}', () => {
  const patch = async (app: App, token: string, payload: unknown): Promise<Response> =>
    app.request(`${SEATS}/${token}`, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.manage),
      body: JSON.stringify(payload),
    })

  it('changes the name and the role and keeps the token its holder bookmarked', async () => {
    const response = await patch(await buildMacroplanApp(), PLAN_TOKENS.view, {
      name: 'Jane at ACME',
      role: 'write',
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({
      token: PLAN_TOKENS.view,
      name: 'Jane at ACME',
      role: 'write',
    })
  })

  it('drops a scope key rather than honouring it, the payload being closed to name and role', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await patch(app, PLAN_TOKENS.view, {
      role: 'manage',
      scope: { kind: 'plan', planId: IDS.p1 },
    })
    expect(response.status).toBe(200)
    const stored = (await seatsOf(deps)).find((seat) => seat['token'] === PLAN_TOKENS.view)
    expect(keysOf(stored)).toEqual(SEAT_FIELDS)
    expect(stored?.['role']).toBe('manage')
  })

  it('refuses a write seat with 403, renaming a seat being seat administration', async () => {
    const response = await (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.write),
      body: JSON.stringify({ name: 'Mine now' }),
    })
    expect(response.status).toBe(403)
  })

  it('answers 404 for a token this plan does not hold, including one another plan does', async () => {
    const unknown = await patch(await buildMacroplanApp(), 'shr_nobody_holds_this_tok', { role: 'view' })
    const elsewhere = await patch(await buildMacroplanApp(), PLAN_TOKENS.collidingManage, { role: 'view' })
    expect([unknown.status, elsewhere.status]).toEqual([404, 404])
  })

  it('answers 422 for a token that is not token-shaped, the param being validated', async () => {
    const response = await patch(await buildMacroplanApp(), 'nope', { role: 'view' })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'param' })
  })
})

describe('DELETE /v1/macroplan/plans/{planId}/share-links/{token}', () => {
  const revoke = async (app: App, token: string, as: string): Promise<Response> =>
    app.request(`${SEATS}/${token}`, { method: 'DELETE', headers: asLink(as) })

  it('answers 204 with no body, revoking a seat moving no bar on the canvas', async () => {
    const response = await revoke(await buildMacroplanApp(), PLAN_TOKENS.view, PLAN_TOKENS.manage)
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('drops the seat from the plan, so the manage holder no longer sees it', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await revoke(app, PLAN_TOKENS.view, PLAN_TOKENS.manage)
    expect((await seatsOf(deps)).map((seat) => seat['token'])).toEqual([
      PLAN_TOKENS.write,
      PLAN_TOKENS.manage,
    ])
  })

  it('takes every seat minted through the one revoked, however deep the lineage (ADR 0010)', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const parent = await mintedBy(app, PLAN_TOKENS.manage, 'A parent')
    const child = await mintedBy(app, parent, 'A child')
    const grandchild = await mintedBy(app, child, 'A grandchild')
    expect((await revoke(app, parent, PLAN_TOKENS.manage)).status).toBe(204)
    const left = (await seatsOf(deps)).map((seat) => seat['token'])
    expect(left).not.toContain(parent)
    expect(left).not.toContain(child)
    expect(left).not.toContain(grandchild)
    expect(left).toContain(PLAN_TOKENS.manage)
  })

  it('leaves every revoked token answering 401 on the plan, asserted by presenting each one', async () => {
    const app = await buildMacroplanApp()
    const parent = await mintedBy(app, PLAN_TOKENS.manage, 'A parent')
    const child = await mintedBy(app, parent, 'A child')
    await revoke(app, parent, PLAN_TOKENS.manage)
    for (const dead of [parent, child]) {
      const response = await app.request(ONE, { headers: asLink(dead) })
      expect([dead, response.status]).toEqual([dead, 401])
      expect(await body(response)).toMatchObject({ code: 'unknown_principal' })
    }
  })

  it('leaves the seat that revoked them still working, so the 401s are the cascade and not the app', async () => {
    const app = await buildMacroplanApp()
    const parent = await mintedBy(app, PLAN_TOKENS.manage, 'A parent')
    await revoke(app, parent, PLAN_TOKENS.manage)
    expect((await app.request(ONE, { headers: asLink(PLAN_TOKENS.manage) })).status).toBe(200)
  })

  it('answers 404 for a token belonging to another plan, a 403 there confirming it exists', async () => {
    const response = await revoke(
      await buildMacroplanApp(),
      PLAN_TOKENS.collidingManage,
      PLAN_TOKENS.manage,
    )
    expect(response.status).toBe(404)
  })

  it('leaves that other plan holding its seat, the 404 being about this plan and not that one', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await revoke(app, PLAN_TOKENS.collidingManage, PLAN_TOKENS.manage)
    const other = await deps.plans.readManifest('macroplan', IDS.p1)
    expect(other?.shareLinks.map((seat) => seat.token)).toEqual([PLAN_TOKENS.collidingManage])
  })

  it('refuses a write seat with 403 before reading the store, so it learns nothing either way', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await revoke(app, PLAN_TOKENS.view, PLAN_TOKENS.write)
    expect(response.status).toBe(403)
    expect(await seatsOf(deps)).toHaveLength(3)
  })

  it('refuses the write seat the same way for a token that does not exist, 403 before 404', async () => {
    const response = await revoke(
      await buildMacroplanApp(),
      'shr_nobody_holds_this_tok',
      PLAN_TOKENS.write,
    )
    expect(response.status).toBe(403)
  })

  it('clears the admin, which is what makes those refusals about the seat and not the route', async () => {
    const response = await (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'DELETE',
      headers: admin(),
    })
    expect(response.status).toBe(204)
  })
})

describe('the seats of one plan are read through the plan, there being no listing route', () => {
  it('carries shareLinks for a manage holder, which is the one gate and the one shape', async () => {
    const found = await body(await (await buildMacroplanApp()).request(ONE, {
      headers: asLink(PLAN_TOKENS.manage),
    }))
    expect((found['shareLinks'] as { token: string }[]).map((seat) => seat.token)).toEqual([
      PLAN_TOKENS.view,
      PLAN_TOKENS.write,
      PLAN_TOKENS.manage,
    ])
  })

  it('omits the key entirely for a view and a write holder, absent never reading as empty', async () => {
    const app = await buildMacroplanApp()
    for (const token of [PLAN_TOKENS.view, PLAN_TOKENS.write]) {
      const found = await body(await app.request(ONE, { headers: asLink(token) }))
      expect([token, 'shareLinks' in found]).toEqual([token, false])
    }
  })

  it('answers 404 for a listing address, so no second shape describes a plan seats', async () => {
    const response = await (await buildMacroplanApp()).request(SEATS, { headers: admin() })
    expect(response.status).toBe(404)
  })

  it('carries shareLinkCount to the admin on the collection, the count riding the same decision', async () => {
    const found = await body(
      await (await buildMacroplanApp()).request(`${MACROPLAN_PREFIX}/plans`, { headers: admin() }),
    )
    const rows = found['plans'] as { id: string; shareLinkCount: number }[]
    expect(rows.find((row) => row.id === PLAN_IDS.plan)?.shareLinkCount).toBe(3)
  })

  it('mints into that block, so a new seat is visible to the holder that minted it', async () => {
    const app = await buildMacroplanApp()
    await mintedBy(app, PLAN_TOKENS.manage, 'Acme')
    const found = await body(await app.request(ONE, { headers: asLink(PLAN_TOKENS.manage) }))
    expect(found['shareLinks']).toHaveLength(4)
  })

  it('refuses a seat on another plan the address under it, the path deciding the plan', async () => {
    const response = await (await buildMacroplanApp()).request(`${OTHER_SEATS}/${PLAN_TOKENS.view}`, {
      method: 'DELETE',
      headers: asLink(PLAN_TOKENS.manage),
    })
    expect(response.status).toBe(403)
  })
})
