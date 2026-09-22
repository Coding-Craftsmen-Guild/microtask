import { describe, expect, it } from 'vitest'
import {
  GUARDED_PREFIX,
  IDS,
  PLAN_TOKEN,
  TOKENS,
  admin,
  asLink,
  body,
  buildApp,
  buildAppWithPlan,
} from '../../testing/harness.js'

const CURRENT = `${GUARDED_PREFIX}/shares/current`

const shareView = async (token: string): Promise<Record<string, unknown>> =>
  body(await (await buildApp()).request(CURRENT, { headers: asLink(token) }))

describe('GET /v1/microtask/shares/current', () => {
  it('tells a project-scoped link its role, its scope and the tree it may see', async () => {
    const response = await (await buildApp()).request(CURRENT, { headers: asLink(TOKENS.p1View) })
    expect(response.status).toBe(200)
    const view = await body(response)
    expect(view).toMatchObject({
      role: 'view',
      scope: { kind: 'project', projectId: IDS.p1 },
      project: { id: IDS.p1, name: 'Launch' },
    })
    expect((view['folders'] as unknown[]).length).toBe(2)
    expect((view['tasks'] as { id: string }[]).map((one) => one.id).sort()).toEqual(
      [IDS.t1, IDS.t2, IDS.t3, IDS.t4].sort(),
    )
  })

  it('tells a task-scoped link its one task, and no folder it could read a client out of', async () => {
    const view = await shareView(TOKENS.t1Manage)
    expect(view).toMatchObject({ role: 'manage', scope: { kind: 'task', taskId: IDS.t1 } })
    expect(view['folders']).toEqual([])
    expect((view['tasks'] as { id: string }[]).map((one) => one.id)).toEqual([IDS.t1])
  })

  it('answers from the credential, so the token never appears in the path or the body', async () => {
    const serialised = JSON.stringify(await shareView(TOKENS.p1Manage))
    for (const token of Object.values(TOKENS)) {
      expect(serialised).not.toContain(token)
    }
  })

  it('answers the project the caller’s own credential names, not the first one it finds', async () => {
    const view = await shareView(TOKENS.p2Manage)
    expect(view['project']).toEqual({ id: IDS.p2, name: 'Other' })
  })

  it('reports that an admin credential names no share link, rather than inventing one', async () => {
    const response = await (await buildApp()).request(CURRENT, { headers: admin() })
    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ code: 'not_found' })
  })

  it('refuses a plan-scoped link, which one shared token index makes a credential that resolves', async () => {
    const app = await buildAppWithPlan()
    const response = await app.request(CURRENT, { headers: asLink(PLAN_TOKEN) })
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('still resolves that plan link, so the 403 is a refusal and not a failure to authenticate', async () => {
    const app = await buildAppWithPlan()
    const response = await app.request(`${GUARDED_PREFIX}/projects/${IDS.p1}`, {
      headers: asLink(PLAN_TOKEN),
    })
    expect(response.status).toBe(403)
  })

  it('takes no token in its path, so there is no per-token address to leak', async () => {
    const paths = (await buildApp()).routes.map((one) => one.path)
    expect(paths).toContain(CURRENT)
    expect(paths.filter((path) => path.startsWith(`${GUARDED_PREFIX}/shares`))).toEqual([CURRENT])
  })
})
