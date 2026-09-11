import { OpenAPIHono } from '@hono/zod-openapi'
import type { Principal } from '@repo/kernel'
import { describe, expect, it } from 'vitest'
import type { ApiEnv } from './env.js'

const principalFor = (projectId: string): Principal => ({
  kind: 'link',
  role: 'view',
  scope: { kind: 'project', projectId },
  token: `shr_${projectId}`,
})

const threeDeep = (): OpenAPIHono<ApiEnv> => {
  const root = new OpenAPIHono<ApiEnv>()
  const v1 = new OpenAPIHono<ApiEnv>()
  const product = new OpenAPIHono<ApiEnv>()
  v1.use('*', async (c, next) => {
    c.set('principal', principalFor(c.req.query('as') ?? 'P1'))
    c.set('service', 'microtask')
    await next()
  })
  product.get('/deep', (c) => {
    const principal: Principal = c.get('principal')
    return c.json({ kind: principal.kind, scope: principal.kind === 'link' ? principal.scope : null, service: c.get('service') })
  })
  v1.route('/microtask', product)
  root.route('/v1', v1)
  return root
}

describe('ApiEnv', () => {
  it('carries the principal from a middleware three mounts above the handler that reads it', async () => {
    const response = await threeDeep().request('/v1/microtask/deep?as=P7')
    expect(await response.json()).toEqual({
      kind: 'link',
      scope: { kind: 'project', projectId: 'P7' },
      service: 'microtask',
    })
  })

  it('names exactly two variables, principal and service, which is the whole request identity', async () => {
    const app = new OpenAPIHono<ApiEnv>()
    app.get('/names', (c) => {
      c.set('principal', { kind: 'admin' })
      c.set('service', 'microtask')
      return c.json({ principal: c.get('principal'), service: c.get('service') })
    })
    expect(Object.keys((await (await app.request('/names')).json()) as object).sort()).toEqual([
      'principal',
      'service',
    ])
  })

  it('keeps one request principal out of another, which is the assumption the gate rests on', async () => {
    const app = threeDeep()
    const ids = Array.from({ length: 40 }, (_, index) => `P${String(index)}`)
    const seen = await Promise.all(
      ids.map(async (id) => {
        const response = await app.request(`/v1/microtask/deep?as=${id}`)
        const parsed = (await response.json()) as { scope: { projectId: string } }
        return parsed.scope.projectId
      }),
    )
    expect(seen).toEqual(ids)
  })

  it('is a Hono Env, so a middleware typed for it composes with an untyped one', async () => {
    const app = new OpenAPIHono<ApiEnv>()
    app.use('*', async (c, next) => {
      c.set('principal', { kind: 'admin' })
      await next()
    })
    app.use('*', async (_c, next) => {
      await next()
    })
    app.get('/x', (c) => c.json({ kind: c.get('principal').kind }))
    expect(await (await app.request('/x')).json()).toEqual({ kind: 'admin' })
  })
})
