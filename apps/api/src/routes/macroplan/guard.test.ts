import { describe, expect, it } from 'vitest'
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
  const patchAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(token),
      body: retimed,
    })).status

  const deleteAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(ONE, {
      method: 'DELETE',
      headers: asLink(token),
    })).status

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

  const deleteFeatureAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(`${FEATURES}/${PLAN_IDS.f1}`, {
      method: 'DELETE',
      headers: asLink(token),
    })).status

  it('clears the write seat on POST /features, feature:create being a write action', async () => {
    expect(await addFeatureAs(PLAN_TOKENS.write)).toBe(200)
  })

  it('refuses the write seat on DELETE /features/{featureId}, so write cannot become manage', async () => {
    expect(await deleteFeatureAs(PLAN_TOKENS.write)).toBe(403)
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

  const mintAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(SEATS, {
      method: 'POST',
      headers: linkJson(token),
      body: draftedSeat,
    })).status

  const renameAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'PATCH',
      headers: linkJson(token),
      body: renamedSeat,
    })).status

  const revokeAs = async (token: string): Promise<number> =>
    (await (await buildMacroplanApp()).request(`${SEATS}/${PLAN_TOKENS.view}`, {
      method: 'DELETE',
      headers: asLink(token),
    })).status

  const statuses = async (token: string): Promise<readonly number[]> => [
    await mintAs(token),
    await renameAs(token),
    await revokeAs(token),
  ]

  it('refuses the write seat 403 on the mint, the rename and the revoke alike', async () => {
    expect(await statuses(PLAN_TOKENS.write)).toEqual([403, 403, 403])
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
