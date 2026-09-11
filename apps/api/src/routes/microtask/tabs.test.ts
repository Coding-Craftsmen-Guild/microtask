import { STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_BODY_LIMIT_BYTES } from '../../http/body-limits.js'
import {
  GUARDED_PREFIX,
  IDS,
  TOKENS,
  admin,
  adminJson,
  body,
  buildApp,
  linkJson,
  tickingClock,
} from '../../testing/harness.js'

const TASK = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t1}`
const DOCUMENT = `${TASK}/tabs/${IDS.tab1}/document`
const SIBLING = `${GUARDED_PREFIX}/projects/${IDS.p1}/tasks/${IDS.t2}/tabs/${IDS.tab2}/document`

const checklist = (done: number): string =>
  JSON.stringify({
    type: 'doc',
    content: Array.from({ length: 4 }, (_, i) => ({
      type: 'taskItem',
      attrs: { checked: i < done },
    })),
  })

const withMatch = (headers: Record<string, string>, value: string): Record<string, string> => ({
  ...headers,
  'if-match': value,
})

const put = (
  headers: Record<string, string>,
  content = checklist(1),
): { method: string; headers: Record<string, string>; body: string } => ({
  method: 'PUT',
  headers,
  body: content,
})

const tally = (responses: readonly Response[]): Record<string, number> => {
  const counted: Record<string, number> = {}
  for (const response of responses) {
    const key = String(response.status)
    counted[key] = (counted[key] ?? 0) + 1
  }
  return counted
}

const twentyConcurrent = async (app: Awaited<ReturnType<typeof buildApp>>): Promise<Record<string, number>> => {
  const headers = withMatch(adminJson(), STAMP)
  const inFlight = Array.from({ length: 20 }, (_, i) =>
    app.request(DOCUMENT, put(headers, checklist(i % 4))),
  )
  const settled = await Promise.allSettled(inFlight)
  const rejected = settled.filter((one) => one.status === 'rejected')
  expect(rejected).toEqual([])
  return tally(
    settled.flatMap((one) => (one.status === 'fulfilled' ? [one.value] : [])),
  )
}

describe('PUT /v1/microtask/projects/{projectId}/tasks/{taskId}/tabs/{tabId}/document', () => {
  it('replaces the document when If-Match names the stamp the tab carries', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP)))
    expect(response.status).toBe(200)
    const saved = await body(response)
    expect(typeof saved['updatedAt']).toBe('string')
    expect(saved['updatedAt']).not.toBe(STAMP)
  })

  it('stores what it was sent, so a later read sees the new document', async () => {
    const app = await buildApp(tickingClock())
    await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP), checklist(3)))
    const read = await body(await app.request(TASK, { headers: admin() }))
    expect(read['progress']).toEqual({ done: 3, total: 4 })
  })

  it('hands back the stamp the next write has to carry', async () => {
    const app = await buildApp(tickingClock())
    const first = await body(await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP))))
    const next = await app.request(DOCUMENT, put(withMatch(adminJson(), String(first['updatedAt']))))
    expect(next.status).toBe(200)
  })

  it('answers 409 when If-Match names a stamp the tab no longer carries', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(adminJson(), '1999-01-01T00:00:00.000Z')))
    expect(response.status).toBe(409)
    expect(await body(response)).toMatchObject({ code: 'conflict' })
  })

  it('leaves the stored document alone when it refuses a stale write', async () => {
    const app = await buildApp(tickingClock())
    await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP), checklist(2)))
    await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP), checklist(4)))
    const read = await body(await app.request(TASK, { headers: admin() }))
    expect(read['progress']).toEqual({ done: 2, total: 4 })
  })

  it('answers a missing If-Match as a schema failure, never as a conflict', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(adminJson()))
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid', in: 'header' })
  })

  it('answers an empty If-Match as a schema failure too, rather than matching nothing', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(adminJson(), '')))
    expect(response.status).toBe(422)
  })

  it('lets a write link scoped to the project save', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(linkJson(TOKENS.p1Write), STAMP)))
    expect(response.status).toBe(200)
  })

  it('lets the link scoped to that one task save its own tab', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(linkJson(TOKENS.t1Manage), STAMP)))
    expect(response.status).toBe(200)
  })

  it('refuses a view link scoped to the project, because writing is write authority', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(linkJson(TOKENS.p1View), STAMP)))
    expect(response.status).toBe(403)
  })

  it('refuses that task-scoped link a sibling task’s tab', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(SIBLING, put(withMatch(linkJson(TOKENS.t1Manage), STAMP)))
    expect(response.status).toBe(403)
  })

  it('refuses a link scoped to another project', async () => {
    const app = await buildApp(tickingClock())
    const response = await app.request(DOCUMENT, put(withMatch(linkJson(TOKENS.p2Manage), STAMP)))
    expect(response.status).toBe(403)
  })

  it('reports a well-formed tab id that names nothing as 404, after the gate and not before', async () => {
    const app = await buildApp(tickingClock())
    const missing = `${TASK}/tabs/${IDS.missing}/document`
    const response = await app.request(missing, put(withMatch(adminJson(), STAMP)))
    expect(response.status).toBe(404)
  })

  it('refuses an unsafe document before it reads anything, whatever If-Match says', async () => {
    const app = await buildApp(tickingClock())
    const unsafe = JSON.stringify({
      type: 'doc',
      content: [{ type: 'text', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
    })
    const response = await app.request(DOCUMENT, put(withMatch(adminJson(), STAMP), unsafe))
    expect(response.status).toBe(422)
  })

  it('refuses a body over this route’s own cap, which is stricter than the global one', async () => {
    const app = await buildApp(tickingClock())
    const oversized = 'x'.repeat(DOCUMENT_BODY_LIMIT_BYTES + 1)
    const response = await app.request(DOCUMENT, {
      method: 'PUT',
      headers: {
        ...withMatch(adminJson(), STAMP),
        'content-length': String(oversized.length),
      },
      body: oversized,
    })
    expect(response.status).toBe(413)
  })
})

describe('twenty concurrent writes on one If-Match', () => {
  it('accepts exactly one and refuses nineteen as conflicts', async () => {
    expect(await twentyConcurrent(await buildApp(tickingClock()))).toEqual({ '200': 1, '409': 19 })
  })

  it('accepts all twenty when the clock never advances, which is ADR 0016’s recorded limit', async () => {
    expect(await twentyConcurrent(await buildApp())).toEqual({ '200': 20 })
  })
})
