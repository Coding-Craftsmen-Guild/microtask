import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { notFoundHandler } from './not-found.js'
import { PROBLEM_MEDIA_TYPE } from './problem.js'

const build = (): OpenAPIHono => {
  const root = new OpenAPIHono()
  const child = new OpenAPIHono()
  child.get('/known', (c) => c.json({ ok: true }))
  root.route('/v1', child)
  root.notFound(notFoundHandler)
  return root
}

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('notFoundHandler', () => {
  it('answers an unmatched path as a 404 problem document', async () => {
    const response = await build().request('/v1/nope')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({ status: 404, code: 'not_found', title: 'Not Found' })
  })

  it('applies under a mounted child, not only at the root', async () => {
    expect((await build().request('/v1/microtask/projects/P1')).status).toBe(404)
  })

  it('says only that no route matched, never whether a resource exists', async () => {
    const document = JSON.stringify(await body(await build().request('/v1/nope')))
    expect(document).not.toContain('exist')
    expect(document).toContain('No route')
  })

  it('records the unmatched path as the instance, echoing back only what the caller sent', async () => {
    expect(await body(await build().request('/v1/nope'))).toMatchObject({ instance: '/v1/nope' })
  })

  it('leaves a matched route alone', async () => {
    expect((await build().request('/v1/known')).status).toBe(200)
  })

  it('sets no header beyond the two the problem response owns', async () => {
    const response = await build().request('/v1/nope')
    expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
  })
})
