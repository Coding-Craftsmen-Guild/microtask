import { describe, expect, it } from 'vitest'
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

const TASKS = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks`
const ONE = `${TASKS}/${IDS.t1}`
const MOVE = `${ONE}/move`
const REORDER = `${TASKS}/reorder`

const named = (name: string): string => JSON.stringify({ name })

const rootOrder = { folderId: null, taskIds: [IDS.t3, IDS.t2] }

describe('POST /v1/microtask/projects/{projectId}/tasks', () => {
  it('creates a task at the project root and answers 201', async () => {
    const response = await (await buildApp()).request(TASKS, {
      method: 'POST',
      headers: adminJson(),
      body: named('Book the venue'),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ name: 'Book the venue', folderId: null, position: 2 })
  })

  it('creates it inside a folder when the body names one', async () => {
    const response = await (await buildApp()).request(TASKS, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ name: 'Book the venue', folderId: IDS.f1 }),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ folderId: IDS.f1, position: 2 })
  })

  it('lets a write link scoped to the project create one', async () => {
    const response = await (await buildApp()).request(TASKS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: named('Book the venue'),
    })
    expect(response.status).toBe(201)
  })

  it('refuses a task-scoped link, whose authority covers its one task and no more', async () => {
    const response = await (await buildApp()).request(TASKS, {
      method: 'POST',
      headers: linkJson(TOKENS.t1Manage),
      body: named('Book the venue'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(TASKS, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Book the venue'),
    })
    expect(response.status).toBe(403)
  })
})

describe('GET /v1/microtask/projects/{projectId}/tasks/{taskId}', () => {
  it('serves the task, its tabs and its folder to the admin', async () => {
    const response = await (await buildApp()).request(ONE, { headers: admin() })
    expect(response.status).toBe(200)
    const served = await body(response)
    expect(served).toMatchObject({ id: IDS.t1, projectId: IDS.p1, name: 'Write the spec' })
    expect((served['folder'] as { id: string }).id).toBe(IDS.f1)
    expect((served['tabs'] as unknown[]).length).toBe(1)
  })

  it('serves it to the link scoped to that one task, with no folder it may not learn', async () => {
    const response = await (await buildApp()).request(ONE, { headers: asLink(TOKENS.t1Manage) })
    expect(response.status).toBe(200)
    expect((await body(response))['folder']).toBeNull()
  })

  it('refuses that same link its sibling task', async () => {
    const response = await (await buildApp()).request(`${TASKS}/${IDS.t2}`, {
      headers: asLink(TOKENS.t1Manage),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, { headers: asLink(TOKENS.p2Manage) })
    expect(response.status).toBe(403)
  })

  it('reports a well-formed id that names nothing as 404', async () => {
    const response = await (await buildApp()).request(`${TASKS}/${IDS.missing}`, { headers: admin() })
    expect(response.status).toBe(404)
  })
})

describe('PATCH /v1/microtask/projects/{projectId}/tasks/{taskId}', () => {
  it('renames the task for the admin', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Write the brief'),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.t1, name: 'Write the brief' })
  })

  it('lets the link scoped to that task rename it', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.t1Manage),
      body: named('Write the brief'),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a view link scoped to the project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1View),
      body: named('Write the brief'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Write the brief'),
    })
    expect(response.status).toBe(403)
  })
})

describe('DELETE /v1/microtask/projects/{projectId}/tasks/{taskId}', () => {
  it('removes the task and answers 204 with no body', async () => {
    const app = await buildApp()
    const response = await app.request(ONE, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect((await app.request(ONE, { headers: admin() })).status).toBe(404)
  })

  it('refuses a write link scoped to the project, because deleting is manage authority', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'DELETE',
      headers: asLink(TOKENS.p1Write),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'DELETE',
      headers: asLink(TOKENS.p2Manage),
    })
    expect(response.status).toBe(403)
  })
})

describe('POST /v1/microtask/projects/{projectId}/tasks/{taskId}/move', () => {
  it('moves the task to the project root', async () => {
    const response = await (await buildApp()).request(MOVE, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: null }),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.t1, folderId: null })
  })

  it('moves it into another folder when the body names one', async () => {
    const response = await (await buildApp()).request(MOVE, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: IDS.f2 }),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ folderId: IDS.f2 })
  })

  it('refuses a write link scoped to the project, because moving is manage authority', async () => {
    const response = await (await buildApp()).request(MOVE, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: JSON.stringify({ folderId: null }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(MOVE, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: JSON.stringify({ folderId: null }),
    })
    expect(response.status).toBe(403)
  })
})

describe('POST /v1/microtask/projects/{projectId}/tasks/reorder', () => {
  it('renumbers one folder group into the order given', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify(rootOrder),
    })
    expect(response.status).toBe(200)
    const tasks = (await body(response))['tasks'] as { id: string }[]
    expect(tasks.map((one) => one.id)).toEqual([IDS.t3, IDS.t2])
  })

  it('renumbers the group the body names, and not the project root', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: IDS.f1, taskIds: [IDS.t4, IDS.t1] }),
    })
    expect(response.status).toBe(200)
    const tasks = (await body(response))['tasks'] as { id: string; position: number }[]
    expect(tasks.map((one) => one.id)).toEqual([IDS.t4, IDS.t1])
    expect(tasks.map((one) => one.position)).toEqual([0, 1])
  })

  it('refuses an order naming another group, so the group is read from the body not guessed', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: IDS.f1, taskIds: [IDS.t2, IDS.t3] }),
    })
    expect(response.status).toBe(422)
  })

  it('routes the static segment rather than reading it as a task id', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: null, taskIds: [IDS.t2, IDS.t3] }),
    })
    expect(response.status).toBe(200)
  })

  it('lets a manage link scoped to the project reorder them', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify(rootOrder),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a write link scoped to the project', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: JSON.stringify(rootOrder),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: JSON.stringify(rootOrder),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a partial order rather than dropping the tasks it omits', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderId: null, taskIds: [IDS.t2] }),
    })
    expect(response.status).toBe(422)
  })
})
