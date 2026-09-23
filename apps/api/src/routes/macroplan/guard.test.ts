import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACTION_DECISIONS, type CapabilityAction, type CapabilityTarget } from '@repo/contracts'
import {
  ACTIONS,
  ADMIN_ONLY_ACTIONS,
  can,
  type Action,
  type Principal,
  type Role,
  type Target,
} from '@repo/kernel'
import {
  GUARDED_PREFIX,
  IDS,
  SERVICE_KEY,
  TOKENS,
  admin,
  adminJson,
  asLink,
  body,
  linkJson,
} from '../../testing/harness.js'
import {
  MACROPLAN_PREFIX,
  PLAN_IDS,
  PLAN_TOKENS,
  buildMacroplanApp,
  buildMacroplanFixture,
} from '../../testing/macroplan-harness.js'

const COLLECTION = `${MACROPLAN_PREFIX}/plans`
const ONE = `${COLLECTION}/${PLAN_IDS.plan}`
const COLLIDING = `${COLLECTION}/${IDS.p1}`
const PROJECT_ONE = `${GUARDED_PREFIX}/projects/${IDS.p1}`

const retimed = JSON.stringify({ startDate: '2026-02-02' })
const drafted = JSON.stringify({ name: 'A plan', startDate: '2026-03-02' })

interface Call {
  readonly what: string
  readonly path: string
  readonly method?: string
  readonly carriesBody?: boolean
}

const READS: readonly Call[] = [
  { what: 'GET /plans', path: COLLECTION },
  { what: 'GET /plans/{planId}', path: ONE },
]

const WRITES: readonly Call[] = [
  { what: 'POST /plans', path: COLLECTION, method: 'POST', carriesBody: true },
  { what: 'DELETE /plans/{planId}', path: ONE, method: 'DELETE' },
]

const COLLECTIONS: readonly Call[] = [
  { what: 'GET /plans', path: COLLECTION },
  { what: 'POST /plans', path: COLLECTION, method: 'POST', carriesBody: true },
]

const send = async (
  app: Awaited<ReturnType<typeof buildMacroplanApp>>,
  call: Call,
  headers: Record<string, string>,
): Promise<Response> =>
  app.request(call.path, {
    method: call.method ?? 'GET',
    headers,
    ...(call.carriesBody === true ? { body: drafted } : {}),
  })

type Deps = Awaited<ReturnType<typeof buildMacroplanFixture>>['deps']

/**
 * Every rail order, every feature's rail and position and edge list, every item's group and spot.
 *
 * One flat list of sentences rather than a shape per entity, so that a single `toEqual` against the
 * same list read from an untouched fixture covers all three placements and the edges at once, and a
 * failure names the row that moved. Two suites below compare against it: the one that proves a
 * refused **move** moved nothing, and the one that proves a refused **delete** removed nothing —
 * which is the same question asked of a list that would have got shorter rather than reordered.
 */
const structureOf = async (deps: Deps): Promise<readonly string[]> => {
  const plan = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
  if (plan === null) return []
  return [
    ...plan.epics.map((one) => `${one.id} is rail ${one.railOrder}`),
    ...plan.features.map(
      (one) => `${one.id} on ${one.epicId} at ${one.position} after [${one.dependsOn.join(' ')}]`,
    ),
    ...plan.items.map((one) => `${one.id} under ${one.featureId} at ${one.position}`),
  ]
}

const statusesFor = async (token: string, calls: readonly Call[]): Promise<readonly number[]> => {
  const app = await buildMacroplanApp()
  const out: number[] = []
  for (const call of calls) {
    out.push((await send(app, call, linkJson(token))).status)
  }
  return out
}

describe('the macroplan mount answers 401 before anything else it could answer', () => {
  it('refuses a request carrying no credentials at all', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION)
    expect(response.status).toBe(401)
  })

  it('refuses a valid service key with no bearer, because a key confers no authority', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      headers: { 'x-api-key': SERVICE_KEY },
    })
    expect(response.status).toBe(401)
  })

  it('refuses an unmatched path with 401 before 404, so a token cannot map the API by probing', async () => {
    const response = await (await buildMacroplanApp()).request(`${MACROPLAN_PREFIX}/nothing-here`)
    expect(response.status).toBe(401)
  })

  it('answers 404 for that same unmatched path once both credentials are present', async () => {
    const response = await (await buildMacroplanApp()).request(`${MACROPLAN_PREFIX}/nothing-here`, {
      headers: admin(),
    })
    expect(response.status).toBe(404)
  })
})

describe('a Microtask seat reaches no macroplan route, whatever its role or scope', () => {
  const ALL = [...READS, ...WRITES]

  for (const token of Object.values(TOKENS)) {
    it(`refuses ${token} with 403 on all four plan routes`, async () => {
      expect(await statusesFor(token, ALL)).toEqual([403, 403, 403, 403])
    })
  }

  it('refuses the most powerful of them, so a 403 cannot be read as a thin role', async () => {
    expect(await statusesFor(TOKENS.p1Manage, ALL)).toEqual([403, 403, 403, 403])
  })

  it('refuses a planId equal to its own projectId, so a collision across products is no grant', async () => {
    const app = await buildMacroplanApp()
    const read = await app.request(COLLIDING, { headers: asLink(TOKENS.p1Manage) })
    const removed = await app.request(COLLIDING, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Manage),
    })
    expect([read.status, removed.status]).toEqual([403, 403])
  })

  it('refuses with the gate own wording, naming the product root read and never the target', async () => {
    const response = await (await buildMacroplanApp()).request(ONE, {
      headers: asLink(TOKENS.p1Manage),
    })
    expect(await body(response)).toMatchObject({
      code: 'forbidden',
      detail: 'Not permitted: plan:read',
    })
  })

  /**
   * The one place the two layers are distinguishable, pinned so the TSDoc saying so cannot drift.
   *
   * `requireProduct` words every refusal after the product's own top-level read, because a mount has
   * no route to read an action off. On `/plans/{planId}` that is also what the handler gates, so the
   * two are indistinguishable there and `authorize.ts` can promise as much. On the two collection
   * routes it is not: the handler asks a `workspace:` action instead, so a same-product seat with too
   * thin a role is refused in different words than a foreign seat is. Both sentences are asserted
   * here, against one path, because the claim is about the difference and not about either half.
   */
  it('words a collection refusal differently for a foreign seat and a thin same-product one', async () => {
    const app = await buildMacroplanApp()
    const foreign = await app.request(COLLECTION, { headers: asLink(TOKENS.p1Manage) })
    const thin = await app.request(COLLECTION, { headers: asLink(PLAN_TOKENS.view) })
    expect([foreign.status, thin.status]).toEqual([403, 403])
    expect([(await body(foreign))['detail'], (await body(thin))['detail']]).toEqual([
      'Not permitted: plan:read',
      'Not permitted: workspace:list-plans',
    ])
  })

  it('refuses before the body is even validated, so a foreign seat gets no schema oracle', async () => {
    const response = await (await buildMacroplanApp()).request(COLLECTION, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(403)
  })

  it('leaves the plan standing, because the refusal lands before any handler runs', async () => {
    const { app, deps } = await buildMacroplanFixture()
    await app.request(ONE, { method: 'DELETE', headers: asLink(TOKENS.p1Manage) })
    expect(await deps.plans.readManifest('macroplan', PLAN_IDS.plan)).not.toBeNull()
  })

  it('authenticates the bearer first, so a live Microtask seat is refused and not called unknown', async () => {
    const app = await buildMacroplanApp()
    const live = await app.request(COLLECTION, { headers: asLink(TOKENS.p1View) })
    const unknown = await app.request(COLLECTION, { headers: asLink('shr_nobody_holds_this_tok') })
    expect([live.status, unknown.status]).toEqual([403, 401])
    expect(await body(unknown)).toMatchObject({ code: 'unknown_principal' })
  })
})

describe('and the reverse: a plan seat reaches no Microtask route', () => {
  it('refuses a plan manage seat on a project whose id equals its own planId', async () => {
    const response = await (await buildMacroplanApp()).request(PROJECT_ONE, {
      headers: asLink(PLAN_TOKENS.collidingManage),
    })
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({
      code: 'forbidden',
      detail: 'Not permitted: project:read',
    })
  })

  it('serves that same project to the admin, so the refusal is the scope and not the fixture', async () => {
    const response = await (await buildMacroplanApp()).request(PROJECT_ONE, { headers: admin() })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.p1, name: 'Launch' })
  })
})

describe('the two collection routes are the admin own, whatever a plan seat holds', () => {
  for (const [role, token] of Object.entries(PLAN_TOKENS)) {
    it(`refuses the ${role} seat on both, because "every plan" is no seat question`, async () => {
      expect(await statusesFor(token, COLLECTIONS)).toEqual([403, 403])
    })
  }
})

describe('a plan seat reaches exactly what its role grants, and the gate decides that', () => {
  const patchedBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(token),
      body: retimed,
    })

  const removedBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(ONE, {
      method: 'DELETE',
      headers: asLink(token),
    })

  const patchAs = async (token: string): Promise<number> => (await patchedBy(token)).status

  const deleteAs = async (token: string): Promise<number> => (await removedBy(token)).status

  const readAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(ONE, { headers: asLink(token) })).status

  it('clears the view seat on the plan read, which is the one action view grants here', async () => {
    expect(await readAs(PLAN_TOKENS.view)).toBe(200)
  })

  it('refuses the view seat on PATCH and on DELETE, both of which are manage', async () => {
    expect([await patchAs(PLAN_TOKENS.view), await deleteAs(PLAN_TOKENS.view)]).toEqual([403, 403])
  })

  it('refuses the write seat on the same two, so write cannot become manage over the wire', async () => {
    expect([await patchAs(PLAN_TOKENS.write), await deleteAs(PLAN_TOKENS.write)]).toEqual([403, 403])
  })

  it('clears the write seat on the plan read, so its 403 above is the action and not the scope', async () => {
    expect(await readAs(PLAN_TOKENS.write)).toBe(200)
  })

  /**
   * The two refusals above, read for the action each one names, which is §10's "by name".
   *
   * The `PATCH` body is `retimed` — a `startDate` and nothing else — so the action the handler asks
   * for is `plan:retime` and never `plan:rename`: `updatePlan` chooses between them on whether the
   * body carries a `name`, and this sweep has only ever exercised the timing branch. The rename
   * branch is a second gate, asserted in its own block below against a body that carries a name.
   *
   * Asserting the `detail` and not only the status is what tells a **handler** refusal from the
   * mount guard's. `requireProduct` words every refusal `plan:read`, because a mount has no route to
   * read an action off, so a 403 carrying these two sentences can only have come from `authorize`.
   */
  it('names plan:retime and plan:delete in those two refusals, a handler gate not the mount', async () => {
    const details = [
      (await body(await patchedBy(PLAN_TOKENS.write)))['detail'],
      (await body(await removedBy(PLAN_TOKENS.write)))['detail'],
    ]
    expect(details).toEqual(['Not permitted: plan:retime', 'Not permitted: plan:delete'])
  })

  it('clears the manage seat on all three, which is what makes the refusals above meaningful', async () => {
    const statuses = [
      await readAs(PLAN_TOKENS.manage),
      await patchAs(PLAN_TOKENS.manage),
      await deleteAs(PLAN_TOKENS.manage),
    ]
    expect(statuses).toEqual([200, 200, 204])
  })

  it('refuses the colliding plan manage seat on the fixture plan, one plan being no other', async () => {
    expect(await readAs(PLAN_TOKENS.collidingManage)).toBe(403)
  })
})

describe('a write seat edits a plan but cannot restructure it, which is spec §10 on the wire', () => {
  const FEATURES = `${ONE}/features`
  const draftedFeature = JSON.stringify({ epicId: PLAN_IDS.e1, name: 'A feature' })

  const addFeatureAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(FEATURES, {
      method: 'POST',
      headers: linkJson(token),
      body: draftedFeature,
    })).status

  const deletedFeatureBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(`${FEATURES}/${PLAN_IDS.f1}`, {
      method: 'DELETE',
      headers: asLink(token),
    })

  const deleteFeatureAs = async (token: string): Promise<number> =>
    (await deletedFeatureBy(token)).status

  it('clears the write seat on POST /features, feature:create being a write action', async () => {
    expect(await addFeatureAs(PLAN_TOKENS.write)).toBe(200)
  })

  it('refuses the write seat on DELETE /features/{featureId}, so write cannot become manage', async () => {
    expect(await deleteFeatureAs(PLAN_TOKENS.write)).toBe(403)
  })

  /**
   * That refusal read for the action it names, `feature:delete` falling inside §10's word "delete".
   *
   * The status alone would leave the sentence unpinned, and an unpinned sentence is how a reader
   * loses the one signal that separates a handler's `authorize` from the mount's `requireProduct` —
   * which words every one of its refusals `plan:read`, whatever route it stopped.
   */
  it('names feature:delete in that refusal, so the action refused is the one the route gates', async () => {
    expect(await body(await deletedFeatureBy(PLAN_TOKENS.write))).toMatchObject({
      code: 'forbidden',
      detail: 'Not permitted: feature:delete',
    })
  })

  it('clears the manage seat on both, which is what makes that refusal mean something', async () => {
    const statuses = [
      await addFeatureAs(PLAN_TOKENS.manage),
      await deleteFeatureAs(PLAN_TOKENS.manage),
    ]
    expect(statuses).toEqual([200, 200])
  })

  it('refuses the view seat on both, a read holder restructuring nothing', async () => {
    const statuses = [
      await addFeatureAs(PLAN_TOKENS.view),
      await deleteFeatureAs(PLAN_TOKENS.view),
    ]
    expect(statuses).toEqual([403, 403])
  })

  it('refuses the colliding plan manage seat on both, one plan being no other', async () => {
    const statuses = [
      await addFeatureAs(PLAN_TOKENS.collidingManage),
      await deleteFeatureAs(PLAN_TOKENS.collidingManage),
    ]
    expect(statuses).toEqual([403, 403])
  })

  it('validates the body before the in-product gate, so a valid body is what a sweep must send', async () => {
    const response = await (await buildMacroplanApp()).request(FEATURES, {
      method: 'POST',
      headers: linkJson(PLAN_TOKENS.view),
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(422)
  })

  it('refuses a Microtask seat before that, so the other product gets no schema oracle at all', async () => {
    const response = await (await buildMacroplanApp()).request(FEATURES, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(403)
  })
})

describe('a write seat estimates a feature but cannot re-pin it, which is spec §10 on the wire', () => {
  const FEATURE = `${ONE}/features/${PLAN_IDS.f1}`

  const patchFeature = async (token: string, changes: unknown): Promise<Response> =>
    (await buildMacroplanApp()).request(FEATURE, {
      method: 'PATCH',
      headers: linkJson(token),
      body: JSON.stringify(changes),
    })

  const statusOf = async (token: string, changes: unknown): Promise<number> =>
    (await patchFeature(token, changes)).status

  const storedFeature = async (deps: Awaited<ReturnType<typeof buildMacroplanFixture>>['deps']) => {
    const plan = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
    return plan?.features.find((one) => one.id === PLAN_IDS.f1)
  }

  it('clears the write seat on an estimate, feature:estimate being what write was given', async () => {
    expect(await statusOf(PLAN_TOKENS.write, { estimateDays: 5 })).toBe(200)
  })

  it('refuses the write seat a pin, a pin deciding where the bar sits and not what it costs', async () => {
    expect(await statusOf(PLAN_TOKENS.write, { pinSprint: 3 })).toBe(403)
  })

  it('names feature:pin in that refusal, so the action refused is the one the body implied', async () => {
    const response = await patchFeature(PLAN_TOKENS.write, { pinSprint: 3 })
    expect(await body(response)).toMatchObject({
      code: 'forbidden',
      detail: 'Not permitted: feature:pin',
    })
  })

  it('clears the manage seat on that same body, so the refusal is the role and not the body', async () => {
    expect(await statusOf(PLAN_TOKENS.manage, { pinSprint: 3 })).toBe(200)
  })

  it('refuses the view seat both bodies, a reader authoring neither cost nor placement', async () => {
    const statuses = [
      await statusOf(PLAN_TOKENS.view, { estimateDays: 5 }),
      await statusOf(PLAN_TOKENS.view, { pinSprint: 3 }),
    ]
    expect(statuses).toEqual([403, 403])
  })

  it('refuses the colliding plan manage seat on the pin, one plan being no other', async () => {
    expect(await statusOf(PLAN_TOKENS.collidingManage, { pinSprint: 3 })).toBe(403)
  })

  it('refuses a write seat an estimate and a pin in one body, and writes neither field', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(FEATURE, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.write),
      body: JSON.stringify({ estimateDays: 5, pinSprint: 3 }),
    })
    expect(response.status).toBe(403)
    const stored = await storedFeature(deps)
    expect([stored?.estimateDays, stored?.pinSprint]).toEqual([4, null])
  })

  it('refuses a write seat a rename carried with a pin, and leaves the name as it was', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(FEATURE, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.write),
      body: JSON.stringify({ name: 'Trolley', pinSprint: 3 }),
    })
    expect(response.status).toBe(403)
    expect((await storedFeature(deps))?.name).toBe('Basket')
  })

  it('writes both fields for the manage seat, so the refusals above are the role not the body', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(FEATURE, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.manage),
      body: JSON.stringify({ estimateDays: 5, pinSprint: 3 }),
    })
    expect(response.status).toBe(200)
    const stored = await storedFeature(deps)
    expect([stored?.estimateDays, stored?.pinSprint]).toEqual([5, 3])
  })

  it('still lets the write seat rename and re-estimate in one body, which it holds both of', async () => {
    const { app, deps } = await buildMacroplanFixture()
    const response = await app.request(FEATURE, {
      method: 'PATCH',
      headers: linkJson(PLAN_TOKENS.write),
      body: JSON.stringify({ name: 'Trolley', estimateDays: 5 }),
    })
    expect(response.status).toBe(200)
    const stored = await storedFeature(deps)
    expect([stored?.name, stored?.estimateDays, stored?.pinSprint]).toEqual(['Trolley', 5, null])
  })
})

/**
 * The other half of spec §7.1, asserted the way §10 promises it: action by action, by name.
 *
 * A `write` seat authors what the work is and what it costs. Where that work sits and what waits on
 * what is `manage`, and four routes carry exactly that: the three placements and the edge list. All
 * four were already `manage`-only in the kernel's `GRANTS` and in `@repo/contracts`' `ROWS` with no
 * test over the wire saying so — which is the state `feature:pin` was in when it turned out to have
 * been granted to `write` by mistake, and the reason §10 asks for each of them by name.
 *
 * Every route is asserted in both directions, because a refusal on its own would prove only that the
 * route is unreachable for some other reason: each `write` 403 is paired with a `manage` clearance
 * sending the **same body** to the **same path**. The two claims that need making once rather than per
 * route are made over all four at once — that the detail names the action asked for, which is how a
 * reader tells a handler-gate refusal from the mount guard's, and that a refusal writes nothing.
 */
describe('a write seat cannot move work or rewire it, which is spec §10 action by action', () => {
  const MOVES = [
    {
      what: 'PATCH /epics/{epicId}/placement',
      action: 'epic:reorder',
      method: 'PATCH',
      path: `${ONE}/epics/${PLAN_IDS.e1}/placement`,
      sent: { railOrder: 2 },
    },
    {
      what: 'PATCH /features/{featureId}/placement',
      action: 'feature:place',
      method: 'PATCH',
      path: `${ONE}/features/${PLAN_IDS.f1}/placement`,
      sent: { epicId: PLAN_IDS.e2, position: 0 },
    },
    {
      what: 'PATCH /items/{itemId}/placement',
      action: 'item:place',
      method: 'PATCH',
      path: `${ONE}/items/${PLAN_IDS.i1}/placement`,
      sent: { featureId: PLAN_IDS.f3, position: 0 },
    },
    {
      what: 'PUT /features/{featureId}/dependencies',
      action: 'feature:depend',
      method: 'PUT',
      path: `${ONE}/features/${PLAN_IDS.f3}/dependencies`,
      sent: { dependsOn: [PLAN_IDS.f2] },
    },
  ] as const

  const moveOn = async (
    app: Awaited<ReturnType<typeof buildMacroplanApp>>,
    move: (typeof MOVES)[number],
    token: string,
  ): Promise<Response> =>
    app.request(move.path, {
      method: move.method,
      headers: linkJson(token),
      body: JSON.stringify(move.sent),
    })

  const moveAs = async (move: (typeof MOVES)[number], token: string): Promise<Response> =>
    moveOn(await buildMacroplanApp(), move, token)

  const sweep = async (token: string): Promise<readonly number[]> => {
    const out: number[] = []
    for (const move of MOVES) {
      out.push((await moveAs(move, token)).status)
    }
    return out
  }

  for (const move of MOVES) {
    it(`refuses the write seat 403 on ${move.what}`, async () => {
      expect((await moveAs(move, PLAN_TOKENS.write)).status).toBe(403)
    })

    it(`clears the manage seat on ${move.what}, same path and same body`, async () => {
      expect((await moveAs(move, PLAN_TOKENS.manage)).status).toBe(200)
    })
  }

  it('names the action refused in all four details, which is what "asserted by name" is', async () => {
    const details: unknown[] = []
    for (const move of MOVES) {
      details.push((await body(await moveAs(move, PLAN_TOKENS.write)))['detail'])
    }
    expect(details).toEqual(MOVES.map((move) => `Not permitted: ${move.action}`))
  })

  it('refuses the view seat on all four, a reader moving nothing and rewiring nothing', async () => {
    expect(await sweep(PLAN_TOKENS.view)).toEqual([403, 403, 403, 403])
  })

  it('refuses the colliding plan manage seat on all four, one plan being no other', async () => {
    expect(await sweep(PLAN_TOKENS.collidingManage)).toEqual([403, 403, 403, 403])
  })

  it('writes nothing on any of the four: each rail order, position and edge is as it was', async () => {
    const untouched = await structureOf((await buildMacroplanFixture()).deps)
    const refusals: unknown[] = []
    for (const move of MOVES) {
      const { app, deps } = await buildMacroplanFixture()
      refusals.push([move.action, (await moveOn(app, move, PLAN_TOKENS.write)).status])
      expect(await structureOf(deps)).toEqual(untouched)
    }
    expect(refusals).toEqual(MOVES.map((move) => [move.action, 403]))
  })
})

/**
 * The last of §7.1's `manage` half that no seat had ever been refused by name: five more actions.
 *
 * Three of them are §10's promise read literally. `epic:delete` and `item:delete` are the word
 * "delete" — a rail with its features and their items, and one item with its description file — and
 * `plan:rename` is "plan settings": what a plan is called is the plan's own, not the work's. The
 * remaining two, `epic:create` and `epic:rename`, are the shape `feature:pin` was in before this
 * task's first pass — `manage`-only in the kernel and in `@repo/contracts`' rows, with nothing over
 * the wire saying so — and `feature:pin` is the reason that state is no longer treated as safe: it
 * had been granted to `write` by mistake, and a seat could move a bar in time until a test looked.
 *
 * `plan:rename` needs a body of its own and is the subtle one. The `PATCH /plans/{planId}` sweep
 * above sends `{ startDate }`, so it has only ever exercised `plan:retime`; `updatePlan` chooses its
 * action on whether the body carries a `name`, which makes the rename branch a **second gate on the
 * same route** that no seat had ever met. It is asserted here against a body carrying a name and
 * nothing else, so the action asked for can only be `plan:rename`.
 *
 * Both halves for every row, because a refusal alone would prove only that the route is unreachable
 * for some other reason: each `write` 403 is paired with a `manage` clearance sending the **same
 * body** to the **same path**. The `detail` is asserted for all five at once — that clause is what
 * makes "asserted by name" literally true, and it is how a reader tells a handler gate's refusal
 * from the mount guard's, which words every one of its own refusals `plan:read`.
 */
describe('a write seat cannot add, rename or remove structure, which is spec §10 continued', () => {
  const EDITS = [
    {
      what: 'PATCH /plans/{planId} carrying a name',
      action: 'plan:rename',
      method: 'PATCH',
      path: ONE,
      sent: { name: 'Renamed' },
      cleared: 200,
    },
    {
      what: 'POST /epics',
      action: 'epic:create',
      method: 'POST',
      path: `${ONE}/epics`,
      sent: { name: 'Payments' },
      cleared: 200,
    },
    {
      what: 'PATCH /epics/{epicId}',
      action: 'epic:rename',
      method: 'PATCH',
      path: `${ONE}/epics/${PLAN_IDS.e1}`,
      sent: { name: 'Baskets' },
      cleared: 200,
    },
    {
      what: 'DELETE /epics/{epicId}',
      action: 'epic:delete',
      method: 'DELETE',
      path: `${ONE}/epics/${PLAN_IDS.e3}`,
      sent: null,
      cleared: 200,
    },
    {
      what: 'DELETE /items/{itemId}',
      action: 'item:delete',
      method: 'DELETE',
      path: `${ONE}/items/${PLAN_IDS.i1}`,
      sent: null,
      cleared: 200,
    },
  ] as const

  type Edit = (typeof EDITS)[number]

  const editOn = async (
    app: Awaited<ReturnType<typeof buildMacroplanApp>>,
    edit: Edit,
    token: string,
  ): Promise<Response> =>
    app.request(edit.path, {
      method: edit.method,
      ...(edit.sent === null
        ? { headers: asLink(token) }
        : { headers: linkJson(token), body: JSON.stringify(edit.sent) }),
    })

  const editAs = async (edit: Edit, token: string): Promise<Response> =>
    editOn(await buildMacroplanApp(), edit, token)

  const sweep = async (token: string): Promise<readonly number[]> => {
    const out: number[] = []
    for (const edit of EDITS) {
      out.push((await editAs(edit, token)).status)
    }
    return out
  }

  /** The plan's own name beside its whole structure, which is what these five would have changed. */
  const shapeOf = async (deps: Deps): Promise<readonly string[]> => {
    const plan = await deps.plans.readManifest('macroplan', PLAN_IDS.plan)
    return [`named ${plan?.name ?? 'gone'}`, ...(await structureOf(deps))]
  }

  for (const edit of EDITS) {
    it(`refuses the write seat 403 on ${edit.what}`, async () => {
      expect((await editAs(edit, PLAN_TOKENS.write)).status).toBe(403)
    })

    it(`clears the manage seat on ${edit.what}, same path and same body`, async () => {
      expect((await editAs(edit, PLAN_TOKENS.manage)).status).toBe(edit.cleared)
    })
  }

  it('names the action refused in all five details, which is what "asserted by name" is', async () => {
    const details: unknown[] = []
    for (const edit of EDITS) {
      details.push((await body(await editAs(edit, PLAN_TOKENS.write)))['detail'])
    }
    expect(details).toEqual(EDITS.map((edit) => `Not permitted: ${edit.action}`))
  })

  it('refuses the view seat on all five, a reader adding, renaming and removing nothing', async () => {
    expect(await sweep(PLAN_TOKENS.view)).toEqual([403, 403, 403, 403, 403])
  })

  it('refuses the colliding plan manage seat on all five, one plan being no other', async () => {
    expect(await sweep(PLAN_TOKENS.collidingManage)).toEqual([403, 403, 403, 403, 403])
  })

  /**
   * The half a status cannot prove: a refused cascade removed nothing and a refused rename renamed
   * nothing. `epic:delete` would have taken two features and five items with it, so a 403 that wrote
   * anyway is the one failure here worth more than a wrong status code.
   */
  it('writes nothing on any of the five: the plan name, its rails, features and items stand', async () => {
    const untouched = await shapeOf((await buildMacroplanFixture()).deps)
    const refusals: unknown[] = []
    for (const edit of EDITS) {
      const { app, deps } = await buildMacroplanFixture()
      refusals.push([edit.action, (await editOn(app, edit, PLAN_TOKENS.write)).status])
      expect(await shapeOf(deps)).toEqual(untouched)
    }
    expect(refusals).toEqual(EDITS.map((edit) => [edit.action, 403]))
  })
})

describe('the admin is cleared on all five plan routes', () => {
  it('reaches the two collections', async () => {
    const app = await buildMacroplanApp()
    const listed = await app.request(COLLECTION, { headers: admin() })
    const created = await app.request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ name: 'A plan', startDate: '2026-03-02' }),
    })
    expect([listed.status, created.status]).toEqual([200, 201])
  })

  it('reaches the read, the patch and the delete', async () => {
    const app = await buildMacroplanApp()
    const read = await app.request(ONE, { headers: admin() })
    const patched = await app.request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: retimed,
    })
    const removed = await app.request(ONE, { method: 'DELETE', headers: admin() })
    expect([read.status, patched.status, removed.status]).toEqual([200, 200, 204])
  })
})

describe('a write seat cannot hand out a seat, which is spec §10 at its most dangerous point', () => {
  const SEATS = `${ONE}/share-links`
  const draftedSeat = JSON.stringify({ name: 'Acme', role: 'manage' })
  const renamedSeat = JSON.stringify({ name: 'Jane at ACME' })

  const mintedBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(SEATS, {
      method: 'POST',
      headers: linkJson(token),
      body: draftedSeat,
    })

  const renamedBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'PATCH',
      headers: linkJson(token),
      body: renamedSeat,
    })

  const revokedBy = async (token: string): Promise<Response> =>
    (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'DELETE',
      headers: asLink(token),
    })

  const mintAs = async (token: string): Promise<number> => (await mintedBy(token)).status

  const renameAs = async (token: string): Promise<number> => (await renamedBy(token)).status

  const revokeAs = async (token: string): Promise<number> => (await revokedBy(token)).status

  const statuses = async (token: string): Promise<readonly number[]> => [
    await mintAs(token),
    await renameAs(token),
    await revokeAs(token),
  ]

  it('refuses the write seat 403 on the mint, the rename and the revoke alike', async () => {
    expect(await statuses(PLAN_TOKENS.write)).toEqual([403, 403, 403])
  })

  /**
   * Those three refusals read for the actions they name, which is §10's "every `share:*` action".
   *
   * `share:read` is the fourth of the family and is deliberately absent here, because **no route
   * gates it**: a plan's seats arrive inside `PlanView.shareLinks`, shaped by `visibleLinks`, so a
   * caller who may not read them is handed a view without them rather than a 403. There is no
   * sentence for a test to assert, and the completeness suite at the foot of this file records that
   * by name rather than leaving it to look like an oversight.
   */
  it('names share:create, share:update and share:revoke in those three refusals', async () => {
    const details = [
      (await body(await mintedBy(PLAN_TOKENS.write)))['detail'],
      (await body(await renamedBy(PLAN_TOKENS.write)))['detail'],
      (await body(await revokedBy(PLAN_TOKENS.write)))['detail'],
    ]
    expect(details).toEqual([
      'Not permitted: share:create',
      'Not permitted: share:update',
      'Not permitted: share:revoke',
    ])
  })

  it('clears the manage seat on the same three, which is what makes those refusals mean something', async () => {
    expect(await statuses(PLAN_TOKENS.manage)).toEqual([201, 200, 204])
  })

  it('refuses the view seat on all three as well, a reader handing out nothing', async () => {
    expect(await statuses(PLAN_TOKENS.view)).toEqual([403, 403, 403])
  })

  it('refuses the colliding plan manage seat on all three, one plan being no other', async () => {
    expect(await statuses(PLAN_TOKENS.collidingManage)).toEqual([403, 403, 403])
  })

  it('sends a valid body deliberately: the in-product gate runs after body validation', async () => {
    const response = await (await buildMacroplanApp()).request(SEATS, {
      method: 'POST',
      headers: linkJson(PLAN_TOKENS.write),
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(422)
  })

  it('refuses a Microtask seat before that, the other product getting no schema oracle at all', async () => {
    const response = await (await buildMacroplanApp()).request(SEATS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify({ nonsense: true }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a plan seat the bootstrap of the other product, and the reverse, on the same wording', async () => {
    const app = await buildMacroplanApp()
    const outward = await app.request(`${GUARDED_PREFIX}/shares/current`, {
      headers: asLink(PLAN_TOKENS.manage),
    })
    const inward = await app.request(`${MACROPLAN_PREFIX}/shares/current`, {
      headers: asLink(TOKENS.p1Manage),
    })
    expect([outward.status, inward.status]).toEqual([403, 403])
    expect(await body(outward)).toMatchObject({ detail: 'Not permitted: project:read' })
    expect(await body(inward)).toMatchObject({ detail: 'Not permitted: plan:read' })
  })
})

const SOURCE = readFileSync(fileURLToPath(import.meta.url), 'utf8')

const NAMED_DETAIL = /Not permitted: ([a-z]+:[a-z-]+)/gu

const TABLE_ACTION = /\baction: '([a-z]+:[a-z-]+)'/gu

const matched = (pattern: RegExp): readonly string[] =>
  [...SOURCE.matchAll(pattern)].map((found) => found[1] ?? '')

/**
 * Every action this file asserts a refusal for **by name**, read out of its own source.
 *
 * Two patterns, because the suites above word their assertions two ways and both are by name. A
 * suite covering one route writes the sentence out as a literal; a table-driven suite carries the
 * action on each row and compares a whole column of details against that column, so the row's own
 * `action` field is where the name is written. Reading the source rather than aggregating a list by
 * hand is the whole point: a list would be a third place to forget something.
 *
 * Neither pattern can match its own source text — both need a lowercase letter where the source has
 * a `(` — so the scan does not find the two names it is itself spelled with.
 */
const assertedByName = (): ReadonlySet<string> =>
  new Set([...matched(NAMED_DETAIL), ...matched(TABLE_ACTION)])

const PLAN_SEAT_TARGETS: Readonly<Record<CapabilityTarget, Target>> = {
  workspace: { kind: 'workspace' },
  project: { kind: 'project', projectId: IDS.p1 },
  folder: { kind: 'folder', projectId: IDS.p1 },
  task: { kind: 'task', projectId: IDS.p1, taskId: IDS.t1 },
  tab: { kind: 'tab', projectId: IDS.p1, taskId: IDS.t1 },
  plan: { kind: 'plan', planId: PLAN_IDS.plan },
  epic: { kind: 'epic', planId: PLAN_IDS.plan },
  feature: { kind: 'feature', planId: PLAN_IDS.plan },
  item: { kind: 'item', planId: PLAN_IDS.plan },
  'own-scope': { kind: 'plan', planId: PLAN_IDS.plan },
}

const EVERY_TARGET = Object.keys(PLAN_SEAT_TARGETS) as readonly CapabilityTarget[]

const planSeat = (role: Role): Principal => ({
  kind: 'link',
  role,
  scope: { kind: 'plan', planId: PLAN_IDS.plan },
  token: PLAN_TOKENS[role],
})

const isDecided = (action: Action): action is CapabilityAction => action in ACTION_DECISIONS

/**
 * The targets the API gates one action on, as `@repo/contracts` records them.
 *
 * The kernel's `can()` is the authority on **who** holds an action and deliberately not on which kind
 * of thing the action is about: a plan `manage` seat asked about `project:rename` against a `plan`
 * target answers `true`, because the policy checks the role and the scope's root and leaves the
 * pairing of an action with a resource to whoever builds the target. So asking the kernel alone would
 * answer that a plan seat holds every `manage` action in the repo, Microtask's included.
 *
 * `ACTION_DECISIONS` supplies that pairing, and it is not a second opinion about the policy: its
 * `minimum` column is held to `can()`'s answers for every role, scope, action and target by
 * `packages/contracts/src/capabilities.test.ts` (ADR 0038), and its `target` column is held to the
 * `authorize()` call each handler actually makes by `apps/api/src/routes/authorize-targets.test.ts`.
 * `alsoGatedOn` is read as well as `target`, which is the only reason the three seat actions appear
 * in the set below at all: their row names the `project` Microtask administers seats from, and the
 * `plan` this product administers them from is the second entry.
 *
 * An action with no row falls back to **every** target, which is the conservative direction: the
 * kernel then decides whether a plan seat could reach it, and one only a plan `manage` seat holds
 * shows up as a gap needing either an assertion or a named allowance, rather than vanishing.
 */
const gatedOn = (action: Action): readonly CapabilityTarget[] => {
  if (!isDecided(action)) return EVERY_TARGET
  const decision = ACTION_DECISIONS[action]
  return [decision.target, ...(decision.alsoGatedOn ?? [])]
}

const reaches = (role: Role, action: Action): boolean =>
  gatedOn(action).some((kind) => can(planSeat(role), action, PLAN_SEAT_TARGETS[kind]))

/**
 * Spec §7.1's line computed rather than transcribed: what `manage` holds on a plan and `write` does not.
 *
 * A seat of each role on the same plan, asked about every target its action is gated on. An action
 * survives only if some target clears it for `manage` and none clears it for `write`, which is exactly
 * the set §10 promises a refusal for.
 *
 * Neither phase-4 bridge action is in it, and the kernel is what leaves them out rather than an
 * allowance: `epic:bind` is in `ADMIN_ONLY_ACTIONS`, so `manage` does not reach it either, and
 * `item:link` is granted to `write`. A test below pins that, so the day one of them is re-graded to
 * `manage`-only it arrives here as a gap to be decided rather than as an assumption.
 */
const MANAGE_ONLY_PLAN_ACTIONS: readonly Action[] = ACTIONS.filter(
  (action) => reaches('manage', action) && !reaches('write', action),
)

/**
 * The one action in that set with no route to be refused on, allowed by name and with its reason.
 *
 * Reading a plan's seats is decided inside `visibleLinks` and never at a route: they travel inside
 * `PlanView.shareLinks`, so a caller who may not see them is handed a view without them — ADR 0009's
 * filter rather than a gate. There is no 403 and therefore no sentence to assert, and
 * `packages/contracts/src/capabilities.ts` records the same fact from the other side, noting that no
 * `authorize(` scan can find that row.
 *
 * It is an allowance about the **shape** of the check and not a hole in it. That a plan `write` seat
 * is told nothing about the plan's seats is asserted where the filter lives, by
 * `packages/macroplan-domain/src/views/view-leaks.test.ts`, which serialises the view for a holder of
 * each role and every foreign scope and requires that no token of any seat appears in it. What cannot
 * exist is a 403 to read the wording of, which is the only thing this file is in a position to assert.
 *
 * One action, named. Never a prefix or a family: a rule like "every seat action" would swallow the
 * next one somebody adds with a route and no test, which is the failure this suite exists to stop.
 * `authorize-targets.test.ts` keeps `PENDING_ROUTES` for the sibling job of recording actions with no
 * route at all; this list is deliberately **not** a copy of it, because the kernel already excludes
 * both of those from the set above and a copy could only drift from the original.
 */
const NO_ROUTE_TO_REFUSE_ON: Readonly<Record<string, string>> = {
  'share:read': 'no route gates it: visibleLinks filters the seats out of the view instead',
}

const gaps = (): readonly Action[] => {
  const asserted = assertedByName()
  return MANAGE_ONLY_PLAN_ACTIONS.filter(
    (action) => !asserted.has(action) && !(action in NO_ROUTE_TO_REFUSE_ON),
  )
}

/**
 * The suite that stops a fourth pass over this file.
 *
 * Three passes added refusals one at a time and each found the next gap, because "every `manage`-only
 * action" was a claim kept in somebody's head. This derives the set from the policy itself and reads
 * the assertions out of this file's own source, so the completeness is mechanical: a **new**
 * `manage`-only plan action arriving without a refusal test fails here on the day it is added, in the
 * commit that adds it, rather than in an audit months later. That is what it buys over the suites
 * above, each of which proves one route and can only ever cover the routes somebody thought of.
 *
 * It answers the two ways a test like this passes for the wrong reason. It cannot report "no gaps"
 * because its scan matched nothing: the collected set's exact size is asserted, and a member found
 * only by each of the two patterns is named, so a broken pattern fails loudly and says which one
 * broke. And it cannot report "no gaps" because the derivation answered the empty set: the size of
 * that is asserted too. Both numbers are expected to move when an action or a refusal is added — that
 * is the speed bump, and it is deliberate.
 */
describe('every manage-only plan action is refused a write seat by name somewhere above', () => {
  it('derives the manage-only plan actions from the kernel, and the set is not empty', () => {
    expect(MANAGE_ONLY_PLAN_ACTIONS.length).toBe(17)
  })

  it('collects the refusals asserted above by name, one pattern finding each wording', () => {
    const asserted = assertedByName()
    expect(asserted.size).toBe(19)
    expect(asserted.has('feature:pin')).toBe(true)
    expect(asserted.has('epic:reorder')).toBe(true)
  })

  it('asserts a write-seat refusal by name for every one of them, bar the allowance above', () => {
    expect(gaps()).toEqual([])
  })

  it('needs no allowance for the two bridge actions, the kernel leaving both out of the set', () => {
    const derived = new Set<string>(MANAGE_ONLY_PLAN_ACTIONS)
    expect(['epic:bind', 'item:link'].filter((one) => derived.has(one))).toEqual([])
    expect(ADMIN_ONLY_ACTIONS).toContain('epic:bind')
  })

  it('holds no stale allowance: each is in the set, and none of them is asserted after all', () => {
    const derived = new Set<string>(MANAGE_ONLY_PLAN_ACTIONS)
    const asserted = assertedByName()
    const allowed = Object.keys(NO_ROUTE_TO_REFUSE_ON)
    expect(allowed.filter((one) => !derived.has(one))).toEqual([])
    expect(allowed.filter((one) => asserted.has(one))).toEqual([])
  })
})
