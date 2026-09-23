import { describe, expect, it } from 'vitest'
import {
  GUARDED_PREFIX,
  IDS,
  PLAN_TOKEN,
  SERVICE_KEY,
  TOKENS,
  admin,
  asLink,
  body,
  buildApp,
  buildAppWithPlan,
} from '../testing/harness.js'

const SEARCH = `${GUARDED_PREFIX}/search?q=Launch`

const PROJECT = `${GUARDED_PREFIX}/projects/${IDS.p1}`

const CURRENT = `${GUARDED_PREFIX}/shares/current`

const withPlan = async (path: string, headers: Record<string, string>): Promise<Response> =>
  (await buildAppWithPlan()).request(path, { headers })

describe('the Microtask mount refuses a bearer rooted in the other product', () => {
  it('refuses the search route, whose gate builds its target from the caller own scope', async () => {
    const response = await withPlan(SEARCH, asLink(PLAN_TOKEN))
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('refuses a path-parameter route as well, so the refusal is the mount and not one handler', async () => {
    const response = await withPlan(PROJECT, asLink(PLAN_TOKEN))
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('words that refusal exactly as the gate words its own, at both routes and at the share route', async () => {
    const details = await Promise.all(
      [SEARCH, PROJECT, CURRENT].map(async (path) =>
        (await body(await withPlan(path, asLink(PLAN_TOKEN))))['detail'],
      ),
    )
    expect(details).toEqual(['Not permitted: project:read', 'Not permitted: project:read', 'Not permitted: project:read'])
  })

  it('authenticates that bearer first, so a live plan link is refused and never treated as unknown', async () => {
    const live = await withPlan(SEARCH, asLink(PLAN_TOKEN))
    const unknown = await withPlan(SEARCH, asLink('shr_nobody_holds_this_tok'))
    expect([live.status, unknown.status]).toEqual([403, 401])
    expect(await body(unknown)).toMatchObject({ code: 'unknown_principal' })
  })

  it('still refuses a request carrying no service key, so it has not displaced the credential guard', async () => {
    const response = await withPlan(SEARCH, { authorization: `Bearer ${PLAN_TOKEN}` })
    expect(response.status).toBe(401)
  })

  it('lets the admin reach both routes, having no scope to belong to either product', async () => {
    const [search, project] = await Promise.all([
      withPlan(SEARCH, admin()),
      withPlan(PROJECT, admin()),
    ])
    expect([search.status, project.status]).toEqual([200, 200])
  })

  it('lets this product own links through untouched, whatever root they carry', async () => {
    const app = await buildApp()
    const answered = await Promise.all(
      [TOKENS.p1View, TOKENS.p1Manage, TOKENS.t1Manage].map(async (token) =>
        (await app.request(SEARCH, { headers: asLink(token) })).status,
      ),
    )
    expect(answered).toEqual([200, 200, 200])
  })

  it('refuses before the router matches, so an unknown path under the mount is 403 and not 404', async () => {
    const response = await withPlan(`${GUARDED_PREFIX}/nothing-here`, asLink(PLAN_TOKEN))
    expect(response.status).toBe(403)
  })

  it('leaves the login route alone, which carries no principal guard for this to sit behind', async () => {
    const response = await (await buildAppWithPlan()).request('/v1/auth/login', {
      method: 'POST',
      headers: { 'x-api-key': SERVICE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    expect(response.status).not.toBe(403)
  })
})
