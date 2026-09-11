import { OpenAPIHono } from '@hono/zod-openapi'
import { MAX_DOCUMENT_BYTES } from '@repo/microtask-domain'
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_BODY_LIMIT_BYTES,
  GLOBAL_BODY_LIMIT_BYTES,
  documentBodyLimit,
  globalBodyLimit,
  jsonBodyLimit,
} from './body-limits.js'
import { errorHandler } from './error-handler.js'
import { PROBLEM_MEDIA_TYPE } from './problem.js'

type Order = 'limit-first' | 'limit-after-the-route'

const buildApp = (
  limit = globalBodyLimit,
  order: Order = 'limit-first',
): OpenAPIHono => {
  const app = new OpenAPIHono()
  if (order === 'limit-first') app.use('*', limit)
  app.post('/upload', async (c) => c.json({ received: (await c.req.text()).length }))
  if (order === 'limit-after-the-route') app.use('*', limit)
  app.onError(errorHandler)
  return app
}

const utf8 = (value: string): number => new TextEncoder().encode(value).length

const post = async (
  app: OpenAPIHono,
  body: string,
  contentLength: string | null = String(utf8(body)),
): Promise<Response> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (contentLength !== null) headers['content-length'] = contentLength
  return app.request('/upload', { method: 'POST', body, headers })
}

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

const atCap = 'x'.repeat(GLOBAL_BODY_LIMIT_BYTES)
const overCap = 'x'.repeat(GLOBAL_BODY_LIMIT_BYTES + 1)

describe('the global body limit', () => {
  it('refuses a body over the cap that carries a truthful content-length, which is the header production trusts', async () => {
    const response = await post(buildApp(), overCap)
    expect(response.status).toBe(413)
  })

  it('answers that 413 as a JSON problem document naming the cap, so a client can act on it', async () => {
    const response = await post(buildApp(), overCap)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({
      status: 413,
      code: 'payload_too_large',
      maxBytes: GLOBAL_BODY_LIMIT_BYTES,
      instance: '/upload',
    })
  })

  it('admits a body of exactly the cap, which is the boundary apps/legacy/server.js:97 draws', async () => {
    const response = await post(buildApp(), atCap)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ received: GLOBAL_BODY_LIMIT_BYTES })
  })

  it('still refuses an oversized body with no content-length at all, by counting the stream', async () => {
    const response = await post(buildApp(), overCap, null)
    expect(response.status).toBe(413)
  })

  it('admits an oversized body that lies about its content-length, which is why the tests above send a truthful one', async () => {
    const response = await post(buildApp(), overCap, '10')
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ received: GLOBAL_BODY_LIMIT_BYTES + 1 })
  })

  it('never runs when it is registered after the route it should protect, and the oversized body is accepted', async () => {
    const response = await post(buildApp(globalBodyLimit, 'limit-after-the-route'), overCap)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ received: GLOBAL_BODY_LIMIT_BYTES + 1 })
  })

  it('matches the legacy transport bound exactly, so no client that works today is refused', () => {
    expect(GLOBAL_BODY_LIMIT_BYTES).toBe(4_000_000)
  })
})

describe('the per-route limits', () => {
  it('is stricter than the global one, because every matching limiter runs and the first rejection wins', () => {
    expect(DOCUMENT_BODY_LIMIT_BYTES).toBeLessThan(GLOBAL_BODY_LIMIT_BYTES)
  })

  it('leaves headroom over the document bound, so a document the domain accepts is never refused in transit', () => {
    expect(DOCUMENT_BODY_LIMIT_BYTES).toBeGreaterThan(MAX_DOCUMENT_BYTES)
  })

  it('refuses a body over the document cap', async () => {
    const app = buildApp(documentBodyLimit)
    const response = await post(app, 'y'.repeat(DOCUMENT_BODY_LIMIT_BYTES + 1))
    expect(response.status).toBe(413)
    expect(await body(response)).toMatchObject({ maxBytes: DOCUMENT_BODY_LIMIT_BYTES })
  })

  it('admits a body the document cap allows, which the global one would also allow', async () => {
    const app = buildApp(documentBodyLimit)
    expect((await post(app, 'y'.repeat(MAX_DOCUMENT_BYTES))).status).toBe(200)
  })

  it('builds a stricter limiter for any route that wants one', async () => {
    const app = buildApp(jsonBodyLimit(64))
    expect((await post(app, 'z'.repeat(65))).status).toBe(413)
    expect((await post(app, 'z'.repeat(64))).status).toBe(200)
  })
})

describe('a strict global cap cannot be loosened per route', () => {
  it('rejects on the global limiter even when a looser one is registered after it', async () => {
    const app = new OpenAPIHono()
    app.use('*', jsonBodyLimit(64))
    app.post('/upload', jsonBodyLimit(GLOBAL_BODY_LIMIT_BYTES), async (c) =>
      c.json({ received: (await c.req.text()).length }),
    )
    app.onError(errorHandler)
    const response = await post(app, 'z'.repeat(65))
    expect(response.status).toBe(413)
    expect(await body(response)).toMatchObject({ maxBytes: 64 })
  })
})
