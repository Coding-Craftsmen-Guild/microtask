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

const COLLECTION = `${GUARDED_PREFIX}/projects`
const ONE = `${COLLECTION}/${IDS.p1}`

const named = (name: string): string => JSON.stringify({ name })

describe('GET /v1/microtask/projects', () => {
  it('lists every project for the admin', async () => {
    const response = await (await buildApp()).request(COLLECTION, { headers: admin() })
    expect(response.status).toBe(200)
    const listed = (await body(response))['projects'] as { id: string }[]
    expect(listed.map((one) => one.id).sort()).toEqual([IDS.p1, IDS.p2].sort())
  })

  it('refuses a link scoped to another project, which is the gate and not the guard', async () => {
    const response = await (await buildApp()).request(COLLECTION, {
      headers: asLink(TOKENS.p2Manage),
    })
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })
})

describe('POST /v1/microtask/projects', () => {
  it('creates a project and answers 201, not 200', async () => {
    const response = await (await buildApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: named('Rebrand'),
    })
    expect(response.status).toBe(201)
    expect(await body(response)).toMatchObject({ name: 'Rebrand', folders: [], tasks: [] })
  })

  it('puts the created project in the list', async () => {
    const app = await buildApp()
    await app.request(COLLECTION, { method: 'POST', headers: adminJson(), body: named('Rebrand') })
    const listed = (await body(await app.request(COLLECTION, { headers: admin() })))['projects']
    expect((listed as { name: string }[]).map((one) => one.name)).toContain('Rebrand')
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(COLLECTION, {
      method: 'POST',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Rebrand'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a nameless body with a 422 rather than inventing a name', async () => {
    const response = await (await buildApp()).request(COLLECTION, {
      method: 'POST',
      headers: adminJson(),
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'json' })
  })
})

describe('GET /v1/microtask/projects/{projectId}', () => {
  it('serves the project to the admin', async () => {
    const response = await (await buildApp()).request(ONE, { headers: admin() })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.p1, name: 'Launch' })
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, { headers: asLink(TOKENS.p2Manage) })
    expect(response.status).toBe(403)
  })

  it('reports a well-formed id that names nothing as 404, not as 422', async () => {
    const response = await (await buildApp()).request(`${COLLECTION}/${IDS.missing}`, {
      headers: admin(),
    })
    expect(response.status).toBe(404)
  })
})

describe('PATCH /v1/microtask/projects/{projectId}', () => {
  it('renames the project for the admin', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: adminJson(),
      body: named('Launch II'),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: IDS.p1, name: 'Launch II' })
  })

  it('renames it for a manage link scoped to it', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1Manage),
      body: named('Launch II'),
    })
    expect(response.status).toBe(200)
  })

  it('refuses a view link scoped to it, because renaming is manage authority', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p1View),
      body: named('Launch II'),
    })
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const response = await (await buildApp()).request(ONE, {
      method: 'PATCH',
      headers: linkJson(TOKENS.p2Manage),
      body: named('Launch II'),
    })
    expect(response.status).toBe(403)
  })
})

describe('DELETE /v1/microtask/projects/{projectId}', () => {
  it('removes the project and answers 204 with no body', async () => {
    const app = await buildApp()
    const response = await app.request(ONE, { method: 'DELETE', headers: admin() })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect((await app.request(ONE, { headers: admin() })).status).toBe(404)
  })

  it('refuses a write link scoped to it, because deleting is manage authority', async () => {
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

  it('leaves the other project reachable, so the refusal above is about scope', async () => {
    const app = await buildApp()
    const mine = `${COLLECTION}/${IDS.p2}`
    expect((await app.request(mine, { method: 'DELETE', headers: asLink(TOKENS.p2Manage) })).status).toBe(204)
  })
})

describe('the project list ships no share token, asserted on the bytes (ADR 0033)', () => {
  const listed = async (): Promise<string> => {
    const response = await (await buildApp()).request(COLLECTION, { headers: admin() })
    expect(response.status).toBe(200)
    return response.text()
  }

  it('seeds a fixture whose project really does hold live links, or this proves nothing', async () => {
    const response = await (await buildApp()).request(ONE, { headers: admin() })
    const read = await response.text()
    for (const token of Object.values(TOKENS)) {
      if (token === TOKENS.p2Manage) continue
      expect(read, token).toContain(token)
    }
  })

  it('contains none of those token strings anywhere in the serialised list', async () => {
    const payload = await listed()
    for (const token of Object.values(TOKENS)) {
      expect(payload, token).not.toContain(token)
    }
  })

  it('carries no shareLinks key either, so nothing can be read out of an empty one', async () => {
    expect(await listed()).not.toContain('shareLinks')
  })

  it('carries the count instead, which is what the row renders', async () => {
    const rows = (await body(
      await (await buildApp()).request(COLLECTION, { headers: admin() }),
    ))['projects'] as { id: string; shareLinkCount?: number }[]
    const counts = Object.fromEntries(rows.map((row) => [row.id, row.shareLinkCount]))
    expect(counts).toEqual({ [IDS.p1]: 4, [IDS.p2]: 1 })
  })

  it('omits the count for a caller refused the links, matching what read does with the block', async () => {
    const asOne = async (path: string): Promise<Record<string, unknown>> =>
      body(await (await buildApp()).request(path, { headers: asLink(TOKENS.p1View) }))
    const read = await asOne(ONE)
    expect(read).not.toHaveProperty('shareLinks')
    const link = await (await buildApp()).request(COLLECTION, { headers: asLink(TOKENS.p1View) })
    expect(link.status).toBe(403)
  })

  it('carries each task entry cache a row renders, rather than making the row read the task', async () => {
    const rows = (await body(
      await (await buildApp()).request(COLLECTION, { headers: admin() }),
    ))['projects'] as { id: string; tasks: Record<string, unknown>[] }[]
    const one = rows.find((row) => row.id === IDS.p1)?.tasks[0]
    expect(one).toMatchObject({ tabCount: 1, tabNames: ['General'] })
    expect(typeof one?.['updatedAt']).toBe('string')
  })
})
