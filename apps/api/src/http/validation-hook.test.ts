import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { errorHandler } from './error-handler.js'
import { PROBLEM_MEDIA_TYPE } from './problem.js'
import { validationHook } from './validation-hook.js'

const route = createRoute({
  method: 'post',
  path: '/projects/{projectId}',
  request: {
    params: z.object({ projectId: z.string().min(6) }),
    query: z.object({ view: z.enum(['full', 'brief']) }),
    body: { content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } } },
  },
  responses: { 200: { description: 'ok' } },
})

const build = (): OpenAPIHono => {
  const app = new OpenAPIHono({ defaultHook: validationHook })
  app.openapi(route, (c) => c.json({ reached: true, name: c.req.valid('json').name }, 200))
  app.onError(errorHandler)
  return app
}

const post = async (path: string, payload: unknown): Promise<Response> =>
  build().request(path, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  })

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('validationHook', () => {
  it('returns nothing on a successful validation, so the handler still runs', async () => {
    const response = await post('/projects/PROJECT1?view=full', { name: 'Hollowmere' })
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ reached: true, name: 'Hollowmere' })
  })

  it('fires on success too, which is why the first line must be a success guard', async () => {
    const targets: string[] = []
    const app = new OpenAPIHono({
      defaultHook: (result, c) => {
        targets.push(`${result.target}:${String(result.success)}`)
        return validationHook(result, c)
      },
    })
    app.openapi(route, (c) => c.json({ reached: true, name: c.req.valid('json').name }, 200))
    const response = await app.request('/projects/PROJECT1?view=full', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hollowmere' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
    expect(targets).toEqual(['query:true', 'param:true', 'json:true'])
  })

  it('answers 422 as a problem document rather than the raw 400 hono would otherwise send', async () => {
    const response = await post('/projects/PROJECT1?view=sideways', { name: 'Hollowmere' })
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({ status: 422, code: 'invalid', title: 'Unprocessable Content' })
  })

  it('names the failing target in "in", because validation short-circuits at the first one', async () => {
    expect(await body(await post('/projects/PROJECT1?view=sideways', { name: 'Hollowmere' }))).toMatchObject({
      in: 'query',
    })
  })

  it('reports only the first failing target, in the order query then param then json', async () => {
    const allBad = await body(await post('/projects/P?view=sideways', { name: '' }))
    expect(allBad.in).toBe('query')
    const paramAndJson = await body(await post('/projects/P?view=full', { name: '' }))
    expect(paramAndJson.in).toBe('param')
    const jsonOnly = await body(await post('/projects/PROJECT1?view=full', { name: '' }))
    expect(jsonOnly.in).toBe('json')
  })

  it('lists every issue within that one target, with a dotted path and the zod code', async () => {
    const failure = await body(await post('/projects/PROJECT1?view=full', { name: 42 }))
    expect(failure.errors).toEqual([
      { path: 'name', message: expect.any(String), code: 'invalid_type' },
    ])
  })

  it('joins a nested path with dots rather than reporting an array', async () => {
    const nested = createRoute({
      method: 'post',
      path: '/n',
      request: {
        body: {
          content: {
            'application/json': { schema: z.object({ tabs: z.array(z.object({ id: z.string() })) }) },
          },
        },
      },
      responses: { 200: { description: 'ok' } },
    })
    const app = new OpenAPIHono({ defaultHook: validationHook })
    app.openapi(nested, (c) => c.json({ ok: true }, 200))
    const response = await app.request('/n', {
      method: 'POST',
      body: JSON.stringify({ tabs: [{ id: 1 }] }),
      headers: { 'content-type': 'application/json' },
    })
    expect((await body(response)).errors).toEqual([
      { path: 'tabs.0.id', message: expect.any(String), code: 'invalid_type' },
    ])
  })

  it('records the request path as the instance', async () => {
    expect(await body(await post('/projects/P?view=full', { name: 'x' }))).toMatchObject({
      instance: '/projects/P',
    })
  })

  it('works as the third positional argument to openapi(), which is where a per-route hook goes', async () => {
    const app = new OpenAPIHono()
    app.openapi(route, (c) => c.json({ reached: true, name: c.req.valid('json').name }, 200), validationHook)
    const response = await app.request('/projects/PROJECT1?view=sideways', {
      method: 'POST',
      body: JSON.stringify({ name: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ in: 'query' })
  })
})

describe('fact 11: a validation failure never reaches onError', () => {
  it('returns hono raw 400 with the ZodError stringified when no hook is registered', async () => {
    const app = new OpenAPIHono()
    app.openapi(route, (c) => c.json({ reached: true, name: c.req.valid('json').name }, 200))
    app.onError(errorHandler)
    const response = await app.request('/projects/PROJECT1?view=sideways', {
      method: 'POST',
      body: JSON.stringify({ name: 'x' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).not.toBe(PROBLEM_MEDIA_TYPE)
    expect(JSON.stringify(await body(response))).toContain('ZodError')
  })
})
