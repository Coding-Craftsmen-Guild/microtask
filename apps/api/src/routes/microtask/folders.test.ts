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

const FOLDERS = `${GUARDED_PREFIX}/projects/${IDS.p1}/folders`
const ONE = `${FOLDERS}/${IDS.f1}`
const REORDER = `${FOLDERS}/reorder`

const named = (name: string): string => JSON.stringify({ name })

const folderNames = async (response: Response): Promise<string[]> =>
  ((await body(response))['folders'] as { name: string }[]).map((one) => one.name)

describe('GET /v1/microtask/projects/{projectId}/folders', () => {
  it('lists the folders in order for the admin', async () => {
    const response = await (await buildApp()).request(FOLDERS, { headers: admin() })
    expect(response.status).toBe(200)
    expect(await folderNames(response)).toEqual(['Inbox', 'Archive'])
  })

  it('serves them to a view link scoped to the project, because listing is a read', async () => {
    const response = await (await buildApp()).request(FOLDERS, { headers: asLink(TOKENS.p1View) })
    expect(response.status).toBe(200)
  })

  it('refuses a task-scoped link, which must not learn the name of any folder', async () => {
    const response = await (await buildApp()).request(FOLDERS, { headers: asLink(TOKENS.t1Manage) })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(FOLDERS, { headers: asLink(TOKENS.p2Manage) })
    expect(response.status).toBe(403)
  })
})

describe('POST /v1/microtask/projects/{projectId}/folders', () => {
  it('creates a folder at the end of the order and answers 201', async () => {
    const app = await buildApp()
    const response = await app.request(FOLDERS, {
      method: 'POST',
      headers: adminJson(),
      body: named('Blocked'),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ name: 'Blocked', position: 2 })
  })

  it('lets a write link scoped to the project create one', async () => {
    const response = await (await buildApp()).request(FOLDERS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: named('Blocked'),
    })
    expect(response.status).toBe(201)
  })

  it('refuses a view link scoped to the project', async () => {
    const response = await (await buildApp()).request(FOLDERS, {
      method: 'POST',
      headers: linkJson(TOKENS.p1View),
      body: named('Blocked'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(FOLDERS, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Blocked'),
    })
    expect(response.status).toBe(403)
  })
})

describe('PATCH /v1/microtask/projects/{projectId}/folders/{folderId}', () => {
  it('renames the folder for the admin', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Triage'),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.f1, name: 'Triage', position: 0 })
  })

  it('lets a write link scoped to the project rename one', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1Write),
      body: named('Triage'),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Triage'),
    })
    expect(response.status).toBe(403)
  })

  it('reports an unknown folder as 404', async () => {
    const response = await (await buildApp()).request(`${FOLDERS}/${IDS.missing}`, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Triage'),
    })
    expect(response.status).toBe(404)
  })
})

describe('DELETE /v1/microtask/projects/{projectId}/folders/{folderId}', () => {
  it('removes the folder and moves the tasks it held to the project root', async () => {
    const app = await buildApp()
    const response = await app.request(ONE, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(204)
    expect(await folderNames(await app.request(FOLDERS, { headers: admin() }))).toEqual(['Archive'])
    const project = await body(await app.request(`${GUARDED_PREFIX}/projects/${IDS.p1}`, { headers: admin() }))
    const tasks = project['tasks'] as { id: string; folderId: string | null }[]
    expect(tasks.find((one) => one.id === IDS.t1)?.folderId).toBeNull()
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

describe('POST /v1/microtask/projects/{projectId}/folders/reorder', () => {
  it('renumbers the folders into the order given', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderIds: [IDS.f2, IDS.f1] }),
    })
    expect(response.status).toBe(200)
    expect(await folderNames(response)).toEqual(['Archive', 'Inbox'])
  })

  it('routes the static segment rather than reading it as a folder id', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderIds: [IDS.f1, IDS.f2] }),
    })
    expect(response.status).toBe(200)
  })

  it('lets a manage link scoped to the project reorder them', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Manage),
      body: JSON.stringify({ folderIds: [IDS.f2, IDS.f1] }),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a write link scoped to the project, because reordering is manage authority', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p1Write),
      body: JSON.stringify({ folderIds: [IDS.f2, IDS.f1] }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: JSON.stringify({ folderIds: [IDS.f2, IDS.f1] }),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a partial order rather than dropping the folders it omits', async () => {
    const response = await (await buildApp()).request(REORDER, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({ folderIds: [IDS.f1] }),
    })
    expect(response.status).toBe(422)
  })
})
