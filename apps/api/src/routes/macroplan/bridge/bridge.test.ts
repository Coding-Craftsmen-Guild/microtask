import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { IDS, TOKENS, admin, adminJson, asLink, linkJson, body } from '../../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanFixture,
} from '../../../testing/macroplan-harness.js'

const PLAN = `${MACROPLAN_PREFIX}/plans/${PLAN_IDS.plan}`
const RAIL = `${PLAN}/epics/${PLAN_IDS.e1}`
const ITEM = `${PLAN}/items/${PLAN_IDS.i1}`
const OTHER_ITEM = `${PLAN}/items/${PLAN_IDS.i3}`

type App = OpenAPIHono<ApiEnv>

const bindBody = (token: string, role: 'view' | 'manage'): string => JSON.stringify({ token, role })

const bind = async (
  app: App,
  token: string = TOKENS.p1Manage,
  role: 'view' | 'manage' = 'manage',
): Promise<Response> =>
  app.request(`${RAIL}/binding`, { method: 'PUT', headers: adminJson(), body: bindBody(token, role) })

const railOf = async (deps: ApiDeps, epicId: string = PLAN_IDS.e1) =>
  (await deps.plans.readManifest('macroplan', PLAN_IDS.plan))?.epics.find((each) => each.id === epicId)

const itemOf = async (deps: ApiDeps, itemId: string = PLAN_IDS.i1) =>
  (await deps.plans.readManifest('macroplan', PLAN_IDS.plan))?.items.find((each) => each.id === itemId)

const tasksIn = async (deps: ApiDeps): Promise<number> =>
  (await deps.store.readManifest('microtask', IDS.p1))?.tasks.length ?? 0

const revoke = async (deps: ApiDeps): Promise<void> => {
  const project = await deps.store.readManifest('microtask', IDS.p1)
  if (project === null) throw new Error('the fixture holds project one')
  const shareLinks = project.shareLinks.filter((each) => each.token !== TOKENS.p1Manage)
  await deps.store.saveManifest('microtask', { ...project, shareLinks })
}

const detailOf = async (response: Response): Promise<unknown> => (await body(response))['detail']

describe('PUT /epics/{epicId}/binding — only an admin, and the project comes from the token', () => {
  it('binds the rail and derives the project from the token, never from the body', async () => {
    const { app, deps } = await buildMacroplanFixture()
    expect((await bind(app)).status).toBe(200)
    expect((await railOf(deps))?.binding?.projectId).toBe(IDS.p1)
    expect((await railOf(deps))?.binding?.role).toBe('manage')
  })

  it('seals the token, so the stored blob is not the token that was pasted', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const stored = (await railOf(deps))?.binding?.sealedToken
    expect(stored).toBeDefined()
    expect(stored).not.toBe(TOKENS.p1Manage)
    expect(stored).not.toContain(TOKENS.p1Manage)
  })

  it('answers the plan with no sealed token anywhere in it, not even for the admin', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await bind(app)
    const text = JSON.stringify(await body(answer))
    expect(text).not.toContain('sealedToken')
    expect(text).not.toContain(TOKENS.p1Manage)
  })

  it.each([PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage])(
    'refuses a seat holding %s, epic:bind being admin-only however strong the seat',
    async (token) => {
      const { app, deps } = await buildMacroplanFixture()
      const answer = await app.request(`${RAIL}/binding`, {
        method: 'PUT',
        headers: linkJson(token),
        body: bindBody(TOKENS.p1Manage, 'manage'),
      })
      expect(answer.status).toBe(403)
      expect(await detailOf(answer)).toBe('Not permitted: epic:bind')
      expect((await railOf(deps))?.binding).toBeNull()
    },
  )

  it('refuses a token that names nobody with 422 and a sentence about the token', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await bind(app, 'shr_names_nobody_at_all')
    expect(answer.status).toBe(422)
    expect(await detailOf(answer)).toContain('no Microtask project')
  })

  it('refuses a plan token, whose scope names a plan and not a project', async () => {
    const { app } = await buildMacroplanFixture()
    expect((await bind(app, PLAN_TOKENS.manage)).status).toBe(422)
  })

  // §7.2 binds an epic to a project; a task-scoped token would bind a rail to one task's worth of one.
  it('refuses a task-scoped token, which the policy would otherwise clear for project:read', async () => {
    const { app } = await buildMacroplanFixture()
    expect((await bind(app, TOKENS.t1Manage)).status).toBe(422)
  })

  // Binding at manage with a view token would work and then read as view for ever: the admin's
  // screen would say manage and the product would behave as view. Refusing now is what makes the
  // stored role a fact, and the admin is standing in front of Microtask's share manager anyway.
  it.each([TOKENS.p1View, TOKENS.p1Write])(
    'refuses manage over a %s token, rather than storing a role that would silently attenuate',
    async (token) => {
      const { app } = await buildMacroplanFixture()
      const answer = await bind(app, token, 'manage')
      expect(answer.status).toBe(422)
      expect(await detailOf(answer)).toContain('holds less in Microtask')
    },
  )

  it('accepts view over a manage token, a declaration weaker than the token being the point of one', async () => {
    const { app, deps } = await buildMacroplanFixture()
    expect((await bind(app, TOKENS.p1Manage, 'view')).status).toBe(200)
    expect((await railOf(deps))?.binding?.role).toBe('view')
  })

  it('replaces an existing binding rather than refusing a second bind', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app, TOKENS.p1Manage, 'manage')
    expect((await bind(app, TOKENS.p1View, 'view')).status).toBe(200)
    expect((await railOf(deps))?.binding?.role).toBe('view')
  })

  it('answers 404 for a rail the plan does not hold', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${PLAN}/epics/${PLAN_IDS.missing}/binding`, {
      method: 'PUT',
      headers: adminJson(),
      body: bindBody(TOKENS.p1Manage, 'manage'),
    })
    expect(answer.status).toBe(404)
  })
})

describe('DELETE /epics/{epicId}/binding — and it keeps every link', () => {
  it('unbinds the rail and answers the plan', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const answer = await app.request(`${RAIL}/binding`, { method: 'DELETE', headers: admin() })
    expect(answer.status).toBe(200)
    expect((await railOf(deps))?.binding).toBeNull()
  })

  it('is idempotent on a rail bound to nothing', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${RAIL}/binding`, { method: 'DELETE', headers: admin() })
    expect(answer.status).toBe(200)
  })

  // §7.2 permits this bridge no delete, and clearing the links would be destruction nobody asked
  // for: an admin rebinding the same rail after rotating a revoked token finds its items intact.
  it('leaves every item link in place, so rebinding the same project restores them', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    await app.request(`${ITEM}/link`, { method: 'PUT', headers: adminJson(), body: JSON.stringify({ taskId: IDS.t1 }) })
    await app.request(`${RAIL}/binding`, { method: 'DELETE', headers: admin() })
    expect((await itemOf(deps))?.linkedTaskId).toBe(IDS.t1)
  })

  it('refuses a manage seat, the same gate the PUT refuses it on', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${RAIL}/binding`, {
      method: 'DELETE',
      headers: asLink(PLAN_TOKENS.manage),
    })
    expect(answer.status).toBe(403)
  })
})

describe('PUT /items/{itemId}/link — a write seat may, a view seat may not', () => {
  const link = async (
    app: App,
    headers: Record<string, string>,
    taskId: string = IDS.t1,
  ): Promise<Response> =>
    app.request(`${ITEM}/link`, { method: 'PUT', headers, body: JSON.stringify({ taskId }) })

  it('lets a write seat link an item under a bound rail, item:link being a write grant', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    expect((await link(app, linkJson(PLAN_TOKENS.write))).status).toBe(200)
    expect((await itemOf(deps))?.linkedTaskId).toBe(IDS.t1)
  })

  it('refuses a view seat, and writes nothing', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const answer = await link(app, linkJson(PLAN_TOKENS.view))
    expect(answer.status).toBe(403)
    expect(await detailOf(answer)).toBe('Not permitted: item:link')
    expect((await itemOf(deps))?.linkedTaskId).toBeNull()
  })

  it('answers 409 for an item whose rail is bound to nothing', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await link(app, adminJson())
    expect(answer.status).toBe(409)
    expect(await detailOf(answer)).toContain('no live Microtask project')
  })

  // A revoked token and an unbound rail are one sentence from here, which is §7.2's own decision.
  it('answers 409 once the bound project revokes the seat the rail holds', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    await revoke(deps)
    expect((await link(app, adminJson())).status).toBe(409)
  })

  it('answers 422 for a task that is not one of the bound project’s', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    const answer = await link(app, adminJson(), PLAN_IDS.missing)
    expect(answer.status).toBe(422)
    expect(await detailOf(answer)).toContain('not one of the bound')
  })

  it('answers 404 for an item the plan does not hold', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    const answer = await app.request(`${PLAN}/items/${PLAN_IDS.missing}/link`, {
      method: 'PUT',
      headers: adminJson(),
      body: JSON.stringify({ taskId: IDS.t1 }),
    })
    expect(answer.status).toBe(404)
  })

  it('unlinks on DELETE, is idempotent, and needs no live binding to clear a field', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    await link(app, adminJson())
    await app.request(`${RAIL}/binding`, { method: 'DELETE', headers: admin() })
    const answer = await app.request(`${ITEM}/link`, { method: 'DELETE', headers: admin() })
    expect(answer.status).toBe(200)
    expect((await itemOf(deps))?.linkedTaskId).toBeNull()
    expect((await app.request(`${ITEM}/link`, { method: 'DELETE', headers: admin() })).status).toBe(200)
  })

  // Task 4's shaping, exercised against a real write rather than a unit fixture.
  it('leaves a view seat’s own plan read saying linkedTaskId is null after somebody links it', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    await link(app, adminJson())
    const plan = await body(await app.request(PLAN, { headers: asLink(PLAN_TOKENS.view) }))
    expect(JSON.stringify(plan)).not.toContain(IDS.t1)
  })
})

describe('POST /items/{itemId}/task — the one write this bridge permits', () => {
  const create = async (
    app: App,
    headers: Record<string, string>,
    at: string = ITEM,
  ): Promise<Response> => app.request(`${at}/task`, { method: 'POST', headers })

  it('creates the task in the bound project, names it after the item, and links it', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const before = await tasksIn(deps)
    expect((await create(app, admin())).status).toBe(200)
    expect(await tasksIn(deps)).toBe(before + 1)
    const linked = (await itemOf(deps))?.linkedTaskId
    const project = await deps.store.readManifest('microtask', IDS.p1)
    expect(project?.tasks.find((each) => each.id === linked)?.name).toBe('Add to basket')
  })

  // No idempotency key exists, so the item's own link is the record that the work happened. Without
  // this, a retry of a request whose response was lost would create a second task for one item.
  it('answers 409 for an item that is already linked, and creates no second task', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    await create(app, admin())
    const after = await tasksIn(deps)
    const answer = await create(app, admin())
    expect(answer.status).toBe(409)
    expect(await detailOf(answer)).toContain('already linked')
    expect(await tasksIn(deps)).toBe(after)
  })

  it('refuses a rail bound at view, however strong the caller, and creates nothing', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app, TOKENS.p1Manage, 'view')
    const before = await tasksIn(deps)
    const answer = await create(app, admin())
    expect(answer.status).toBe(403)
    expect(await detailOf(answer)).toContain('not bound at manage')
    expect(await tasksIn(deps)).toBe(before)
  })

  // The minimum's second application: a write seat over a manage binding is effectively write.
  it('refuses a write seat over a manage-bound rail, the reader being the weaker half', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const before = await tasksIn(deps)
    expect((await create(app, asLink(PLAN_TOKENS.write))).status).toBe(403)
    expect(await tasksIn(deps)).toBe(before)
  })

  it('lets a manage seat through, so the refusal above is about the role and not about seats', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    expect((await create(app, asLink(PLAN_TOKENS.manage))).status).toBe(200)
  })

  it('refuses a view seat at the gate, before any question about the binding', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    const answer = await create(app, asLink(PLAN_TOKENS.view))
    expect(answer.status).toBe(403)
    expect(await detailOf(answer)).toBe('Not permitted: item:link')
  })

  it('answers 409 for an unbound rail and for one whose token has been revoked', async () => {
    const first = await buildMacroplanFixture()
    expect((await create(first.app, admin())).status).toBe(409)
    const second = await buildMacroplanFixture()
    await bind(second.app)
    await revoke(second.deps)
    expect((await create(second.app, admin())).status).toBe(409)
  })

  it('creates nothing for an item on another, unbound rail', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    const before = await tasksIn(deps)
    expect((await create(app, admin(), OTHER_ITEM)).status).toBe(409)
    expect(await tasksIn(deps)).toBe(before)
  })
})

describe('GET /bridge — 200 whatever the state of a binding, shaped per reader', () => {
  const read = async (app: App, headers: Record<string, string>): Promise<Record<string, unknown>> =>
    body(await app.request(`${PLAN}/bridge`, { headers }))

  it('tells an admin every rail’s state, bound or not', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    const answer = await read(app, admin())
    expect(answer['epics']).toEqual([
      { epicId: PLAN_IDS.e1, state: 'bound', binding: { projectId: IDS.p1, role: 'manage' } },
      { epicId: PLAN_IDS.e2, state: 'unlinked' },
      { epicId: PLAN_IDS.e3, state: 'unlinked' },
    ])
  })

  it.each([PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage])(
    'leaves the epic block out for a seat holding %s, epic:bind being admin-only',
    async (token) => {
      const { app } = await buildMacroplanFixture()
      await bind(app)
      const answer = await read(app, asLink(token))
      expect(answer['epics']).toBeUndefined()
      expect(Object.keys(answer)).toEqual(['items'])
    },
  )

  it('gives a view seat the count and never the task’s name — spec §9’s gate, over HTTP', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    await app.request(`${ITEM}/task`, { method: 'POST', headers: admin() })
    const answer = await read(app, asLink(PLAN_TOKENS.view))
    expect(JSON.stringify(answer)).not.toContain('Add to basket')
    expect(answer['items']).toEqual([{ itemId: PLAN_IDS.i1, progress: { done: 0, total: 0 } }])
  })

  it('is not vacuous: a write seat over the same rail is given the name', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    await app.request(`${ITEM}/task`, { method: 'POST', headers: admin() })
    expect(JSON.stringify(await read(app, asLink(PLAN_TOKENS.write)))).toContain('Add to basket')
  })

  // §7.2: "never an error page and never an empty canvas".
  it('answers 200 with the rail unlinked once its token is revoked, and reports no item', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await bind(app)
    await app.request(`${ITEM}/task`, { method: 'POST', headers: admin() })
    await revoke(deps)
    const answer = await read(app, admin())
    expect(answer['epics']).toContainEqual({ epicId: PLAN_IDS.e1, state: 'unlinked' })
    expect(answer['items']).toEqual([])
  })

  it('answers a plan with nothing bound, rather than refusing it', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await read(app, admin())
    expect(answer['items']).toEqual([])
  })

  it('refuses a seat scoped to another plan', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${PLAN}/bridge`, { headers: asLink(PLAN_TOKENS.collidingManage) })
    expect(answer.status).toBe(403)
  })

  it('answers 404 for a plan that does not exist', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${MACROPLAN_PREFIX}/plans/${PLAN_IDS.missing}/bridge`, {
      headers: admin(),
    })
    expect(answer.status).toBe(404)
  })
})

describe('GET /bridge/epics/{epicId}/tasks — admin-only, because a list is more than §7.3 grants', () => {
  const tasks = async (app: App, headers: Record<string, string>): Promise<Response> =>
    app.request(`${PLAN}/bridge/epics/${PLAN_IDS.e1}/tasks`, { headers })

  it('answers the bound project’s tasks, id and name only', async () => {
    const { app } = await buildMacroplanFixture()
    await bind(app)
    const answer = await tasks(app, admin())
    expect(answer.status).toBe(200)
    const listed = (await body(answer))['tasks']
    expect(listed).toContainEqual({ id: IDS.t1, name: 'Write the spec' })
    expect(JSON.stringify(listed)).not.toContain('progress')
  })

  // The decision, not a consequence: §7.3 grants a write holder one linked task's name, and a list
  // of up to 500 names is materially more. PUT /items/{itemId}/link stays a write grant, so a seat
  // may link and has no picker — recorded rather than fixed by widening this gate.
  it.each([PLAN_TOKENS.view, PLAN_TOKENS.write, PLAN_TOKENS.manage])(
    'refuses a seat holding %s, so no plan credential becomes an inventory of a project',
    async (token) => {
      const { app } = await buildMacroplanFixture()
      await bind(app)
      const answer = await tasks(app, asLink(token))
      expect(answer.status).toBe(403)
      expect(await detailOf(answer)).toBe('Not permitted: epic:bind')
    },
  )

  it('answers 409 for a rail bound to nothing and for one whose token was revoked', async () => {
    const first = await buildMacroplanFixture()
    expect((await tasks(first.app, admin())).status).toBe(409)
    const second = await buildMacroplanFixture()
    await bind(second.app)
    await revoke(second.deps)
    expect((await tasks(second.app, admin())).status).toBe(409)
  })

  it('answers 404 for a rail the plan does not hold', async () => {
    const { app } = await buildMacroplanFixture()
    const answer = await app.request(`${PLAN}/bridge/epics/${PLAN_IDS.missing}/tasks`, {
      headers: admin(),
    })
    expect(answer.status).toBe(404)
  })
})
