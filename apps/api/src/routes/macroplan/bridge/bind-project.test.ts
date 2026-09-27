import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { MINTED_SEAT_NAME } from '../../../bridge/bindings.js'
import { IDS, TOKENS, adminJson, linkJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const PLAN = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`

const RAIL = `${PLAN}/epics/${PLAN_IDS.e1}`

type App = OpenAPIHono<ApiEnv>

const bindProject = async (
  app: App,
  headers: Record<string, string> = adminJson(),
  projectId: string = IDS.p1,
  role: 'view' | 'manage' = 'manage',
): Promise<Response> =>
  app.request(`${RAIL}/binding/project`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ projectId, role }),
  })

const railOf = async (deps: ApiDeps) =>
  (await deps.plans.readManifest('macroplan', PLAN_IDS.plan))?.epics.find(
    (each) => each.id === PLAN_IDS.e1,
  )

const seatsIn = async (deps: ApiDeps) =>
  (await deps.store.readManifest('microtask', IDS.p1))?.shareLinks ?? []

describe('POST /epics/{epicId}/binding/project — the API mints the seat, so no token is pasted', () => {
  it('binds the rail to the named project without a token anywhere in the request', async () => {
    const { app, deps } = await buildMacroplanFixture()
    expect((await bindProject(app)).status).toBe(200)
    expect((await railOf(deps))?.binding?.projectId).toBe(IDS.p1)
    expect((await railOf(deps))?.binding?.role).toBe('manage')
  })

  it('mints exactly one new seat over that project, named for the product that holds it', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const before = await seatsIn(deps)
    await bindProject(app)
    const after = await seatsIn(deps)
    expect(after).toHaveLength(before.length + 1)
    expect(after.at(-1)?.name).toBe(MINTED_SEAT_NAME)
  })

  it('mints it over the whole project and never one task, a rail spanning all of them', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app)
    expect((await seatsIn(deps)).at(-1)?.scope).toEqual({ kind: 'project', projectId: IDS.p1 })
  })

  it('mints it at the role asked for, so the stored role is a fact and not an aspiration', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app, adminJson(), IDS.p1, 'view')
    expect((await seatsIn(deps)).at(-1)?.role).toBe('view')
    expect((await railOf(deps))?.binding?.role).toBe('view')
  })

  // The whole point of the route: the credential is created, sealed and stored inside one request.
  it('seals the minted token at rest, so the stored blob is not the seat token itself', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app)
    const sealed = (await railOf(deps))?.binding?.sealedToken
    const minted = (await seatsIn(deps)).at(-1)?.token
    expect(sealed).toBeDefined()
    expect(minted).toBeDefined()
    expect(sealed).not.toBe(minted)
  })

  it('answers the plan and puts no token in the body, EpicBindingView having no field for one', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const answer = await bindProject(app)
    const minted = (await seatsIn(deps)).at(-1)?.token ?? 'no-seat-was-minted'
    expect(JSON.stringify(await body(answer))).not.toContain(minted)
  })

  it('records no parent for the seat, an admin having no link to descend from (ADR 0010)', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app)
    expect((await seatsIn(deps)).at(-1)?.createdBy).toBeNull()
  })
})

describe('the two gates, and that neither is decoration', () => {
  // `epic:bind` is in ADMIN_ONLY_ACTIONS, so a seat of any role is refused before the project is touched.
  it.each([
    ['a view seat', PLAN_TOKENS.view],
    ['a write seat', PLAN_TOKENS.write],
    ['a manage seat', PLAN_TOKENS.manage],
  ])('refuses %s, an epic binding being the ceiling on what a holder reaches', async (_what, token) => {
    const { app } = await buildMacroplanFixture()
    const answer = await bindProject(app, linkJson(token))
    expect(answer.status).toBe(403)
  })

  it('mints nothing when the first gate refuses, so a refused caller cannot make us write', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const before = await seatsIn(deps)
    await bindProject(app, linkJson(PLAN_TOKENS.manage))
    expect(await seatsIn(deps)).toHaveLength(before.length)
  })

  it('refuses an unauthenticated caller before anything at all is read', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${RAIL}/binding/project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: IDS.p1, role: 'manage' }),
    })
    expect(answer.status).toBe(401)
  })

  // 422 and not 400: this API reports a body that does not parse as a validation problem, which is what
  // `problemResponses()` publishes for every route in the tree.
  it('refuses a body naming no project at all, the payload requiring one', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${RAIL}/binding/project`, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ role: 'manage' }),
    })
    expect(answer.status).toBe(422)
  })

  it('refuses the write role, which has no bridge meaning (design §7.2)', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${RAIL}/binding/project`, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ projectId: IDS.p1, role: 'write' }),
    })
    expect(answer.status).toBe(422)
  })
})

describe('what a minted binding is worth once it is stored', () => {
  // A seat minted here is an ordinary Microtask share link: revoking it in that product's own share manager
  // takes effect on the next bridge read, because `PrincipalResolver` re-reads its live role every time.
  it('reads as unlinked once its seat is revoked in Microtask, and never as an error', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app)
    const minted = (await seatsIn(deps)).at(-1)?.token
    const project = await deps.store.readManifest('microtask', IDS.p1)
    if (project === null) throw new Error('the fixture holds project one')
    await deps.store.saveManifest('microtask', {
      ...project,
      shareLinks: project.shareLinks.filter((each) => each.token !== minted),
    })
    const bridge = await body(await app.request(`${PLAN}/bridge`, { headers: adminJson() }))
    const epics = bridge['epics'] as readonly { readonly epicId: string; readonly state: string }[]
    expect(epics.find((each) => each.epicId === PLAN_IDS.e1)?.state).toBe('unlinked')
  })

  it('is indistinguishable downstream from a binding made by pasting a token', async () => {
    const minted = await buildMacroplanFixture()
    await bindProject(minted.app)
    const pasted = await buildMacroplanFixture()
    await pasted.app.request(`${RAIL}/binding`, {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ token: TOKENS.p1Manage, role: 'manage' }),
    })
    const shapeOf = (binding: unknown): readonly string[] =>
      Object.keys(binding as object).sort()
    expect(shapeOf((await railOf(minted.deps))?.binding)).toEqual(
      shapeOf((await railOf(pasted.deps))?.binding),
    )
  })

  it('lets an admin rebind the same rail, the later seat being the one it holds', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bindProject(app)
    const first = (await railOf(deps))?.binding?.sealedToken
    await bindProject(app)
    const seats = await seatsIn(deps)
    expect((await railOf(deps))?.binding?.sealedToken).not.toBe(first)
    expect(seats.filter((each) => each.name === MINTED_SEAT_NAME)).toHaveLength(2)
  })
})
