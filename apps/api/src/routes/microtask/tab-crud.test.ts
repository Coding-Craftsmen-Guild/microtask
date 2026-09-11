import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import type { ApiEnv } from '../../auth/env.js'
import {
  GUARDED_PREFIX,
  IDS,
  TOKENS,
  admin,
  adminJson,
  asLink,
  body,
  buildApp,
  linkJson,
} from '../../testing/harness.js'

const TABS = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t1}/tabs`
const ONE = `${TABS}/${IDS.tab1}`
const REORDER = `${TABS}/reorder`
const SIBLING_TABS = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t2}/tabs`

const named = (name: string): string => JSON.stringify({ name })

const addTab = async (app: OpenAPIHono<ApiEnv>, name = 'Notes'): Promise<string> => {
  const response = await app.request(TABS, { method: 'POST', headers: adminJson(), body: named(name) })
  expect(response.status).toBe(201)
  return (await body(response))['id'] as string
}

const tabIds = async (response: Response): Promise<string[]> =>
  ((await body(response))['tabs'] as { id: string }[]).map((tab) => tab.id)

describe('POST /v1/microtask/projects/{projectId}/tasks/{taskId}/tabs', () => {
  it('creates a tab at the end of the task and answers 201', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: adminJson(),
      body: named('Notes'),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ name: 'Notes', position: 1, document: { type: 'doc' } })
  })

  it('lets a write link scoped to the project create one', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: named('Notes'),
    })
    expect(response.status).toBe(201)
  })

  it('lets the link scoped to that one task create one, because a tab target names the task', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: linkJson(TOKENS.t1Manage),
      body: named('Notes'),
    })
    expect(response.status).toBe(201)
  })

  it('refuses that same link a sibling task, so the target is the path and not the scope', async () => {
    const response = await (await buildApp()).request(SIBLING_TABS, {
      method: 'POST',
      headers: linkJson(TOKENS.t1Manage),
      body: named('Notes'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a view link scoped to the project', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1View),
      body: named('Notes'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Notes'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a blank name as a validation failure rather than storing one', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: adminJson(),
      body: named('   '),
    })
    expect(response.status).toBe(422)
  })

  it('refuses a body sent without the JSON content type rather than reading nothing from it', async () => {
    const response = await (await buildApp()).request(TABS, {
      method: 'POST',
      headers: { ...admin(), 'content-type': 'text/plain' },
      body: named('Notes'),
    })
    expect(response.status).toBe(415)
  })

  it('reports a task that does not exist as 404', async () => {
    const response = await (await buildApp()).request(
      `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.missing}/tabs`,
      { method: 'POST', headers: adminJson(), body: named('Notes') },
    )
    expect(response.status).toBe(404)
  })
})

describe('PATCH /v1/microtask/projects/{projectId}/tasks/{taskId}/tabs/{tabId}', () => {
  it('renames the tab for the admin, leaving its document alone', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Agenda'),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.tab1, name: 'Agenda', position: 0 })
  })

  it('lets a write link scoped to the project rename it', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1Write),
      body: named('Agenda'),
    })
    expect(response.status).toBe(200)
  })

  it('lets the link scoped to that one task rename it, which a project target would refuse', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.t1Manage),
      body: named('Agenda'),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a view link scoped to the project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1View),
      body: named('Agenda'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Agenda'),
    })
    expect(response.status).toBe(403)
  })

  it('reports a well-formed tab id that names nothing as 404', async () => {
    const response = await (await buildApp()).request(`${TABS}/${IDS.missing}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Agenda'),
    })
    expect(response.status).toBe(404)
  })
})

describe('DELETE /v1/microtask/projects/{projectId}/tasks/{taskId}/tabs/{tabId}', () => {
  it('removes a tab and answers 204 with no body', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(`${TABS}/${added}`, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    const task = await app.request(`${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t1}`, {
      headers: admin(),
    })
    expect(await tabIds(task)).toEqual([IDS.tab1])
  })

  it('refuses to remove the last tab, and says so as 422 rather than failing with a 500', async () => {
    const response = await (await buildApp()).request(ONE, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid' })
  })

  it('refuses a write link scoped to the project, because removing a tab is manage authority', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(`${TABS}/${added}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Write),
    })
    expect(response.status).toBe(403)
  })

  it('lets the manage link scoped to that one task remove one', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(`${TABS}/${added}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.t1Manage),
    })
    expect(response.status).toBe(204)
  })

  it('refuses a link scoped to another project', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(`${TABS}/${added}`, {
      method: 'DELETE',
      headers: asLink(TOKENS.p2Manage),
    })
    expect(response.status).toBe(403)
  })

  it('reports a well-formed tab id that names nothing as 404', async () => {
    const app = await buildApp()
    await addTab(app)
    const response = await app.request(`${TABS}/${IDS.missing}`, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(404)
  })
})

describe('POST /v1/microtask/projects/{projectId}/tasks/{taskId}/tabs/reorder', () => {
  it('renumbers the task’s tabs into the order given', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ tabIds: [added, IDS.tab1] }),
    })
    expect(response.status).toBe(200)
    expect(await tabIds(response)).toEqual([added, IDS.tab1])
  })

  it('renumbers them densely from zero, so no gap or clash survives', async () => {
    const app = await buildApp()
    const added = await addTab(app)
    const response = await app.request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ tabIds: [added, IDS.tab1] }),
    })
    const tabs = (await body(response))['tabs'] as { position: number }[]
    expect(tabs.map((tab) => tab.position)).toEqual([0, 1])
  })

  it('routes the static segment rather than reading it as a tab id', async () => {
    const app = await buildApp()
    const response = await app.request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(200)
    expect(await tabIds(response)).toEqual([IDS.tab1])
  })

  it('refuses an order sent without the JSON content type rather than reading nothing from it', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: { ...admin(), 'content-type': 'text/plain' },
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(415)
  })

  it('refuses a partial order rather than dropping the tabs it omits', async () => {
    const app = await buildApp()
    await addTab(app)
    const response = await app.request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(422)
  })

  it('lets the manage link scoped to that one task reorder them, which a project target would refuse', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.t1Manage),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(200)
  })

  it('lets a manage link scoped to the project reorder them', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a write link scoped to the project, because reordering is manage authority', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: JSON.stringify({ tabIds: [IDS.tab1] }),
    })
    expect(response.status).toBe(403)
  })
})
