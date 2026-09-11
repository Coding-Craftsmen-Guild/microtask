import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { AppError, Conflict, Forbidden, Invalid, NotFound } from '@repo/kernel'
import { describe, expect, it } from 'vitest'
import { errorHandler } from './error-handler.js'
import { PROBLEM_MEDIA_TYPE } from './problem.js'

type Prepare = (set: (name: string, value: string) => void) => void

const appThrowing = (thrown: unknown, prepare?: Prepare): Hono => {
  const app = new Hono()
  app.get('/v1/microtask/projects/:projectId', (c) => {
    prepare?.((name, value) => {
      c.header(name, value)
    })
    throw thrown
  })
  app.onError(errorHandler)
  return app
}

const call = async (thrown: unknown, prepare?: Prepare): Promise<Response> =>
  appThrowing(thrown, prepare).request('/v1/microtask/projects/P1')

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('errorHandler', () => {
  describe('the AppError branch', () => {
    const cases = [
      [new NotFound('Project not found'), 404, 'not_found'],
      [new Forbidden('Not permitted'), 403, 'forbidden'],
      [new Invalid('Name is required'), 422, 'invalid'],
      [new Conflict('Stale write'), 409, 'conflict'],
    ] as const

    for (const [error, status, code] of cases) {
      it(`renders ${error.name} as ${status} with code "${code}" and its own message`, async () => {
        const response = await call(error)
        expect(response.status).toBe(status)
        expect(await body(response)).toMatchObject({ status, code, detail: error.message })
      })
    }

    it('takes the code from the error rather than from the status, so a new AppError needs no map entry', async () => {
      class TooLarge extends AppError {
        readonly status = 422
        readonly code = 'document_too_large'
      }
      expect(await body(await call(new TooLarge('2 MB cap')))).toMatchObject({
        status: 422,
        code: 'document_too_large',
        type: '/problems/document_too_large',
      })
    })

    it('cannot be defeated by narrowing an existing AppError code, because the kernel pins it as a literal', () => {
      const invalid: Invalid = new Invalid('x')
      expect(invalid.code).toBe('invalid')
    })

    it('records the request path as the problem instance', async () => {
      expect(await body(await call(new Forbidden('no')))).toMatchObject({
        instance: '/v1/microtask/projects/P1',
      })
    })
  })

  describe('the HTTPException branch', () => {
    it('keys on .status, not on the message, for the malformed-JSON exception hono throws', async () => {
      const thrown = new HTTPException(400, { message: 'Malformed JSON in request body' })
      expect(thrown.name).toBe('Error')
      const response = await call(thrown)
      expect(response.status).toBe(400)
      expect(await body(response)).toMatchObject({
        code: 'bad_request',
        detail: 'Malformed JSON in request body',
      })
    })

    it('routes by status even when the message is one another status owns', async () => {
      const response = await call(new HTTPException(409, { message: 'Malformed JSON in request body' }))
      expect(response.status).toBe(409)
      expect(await body(response)).toMatchObject({ code: 'conflict' })
    })

    it('does not consult .name, which HTTPException never sets and which therefore reads "Error"', async () => {
      const thrown = new HTTPException(415, { message: 'Unsupported Media Type' })
      expect(thrown.name).toBe('Error')
      expect(await body(await call(thrown))).toMatchObject({ code: 'unsupported_media_type' })
    })

    it('falls back to the status title when the exception carries no message', async () => {
      expect(await body(await call(new HTTPException(429)))).toMatchObject({
        status: 429,
        code: 'too_many_requests',
        detail: 'Too Many Requests',
      })
    })

    it('gives an unmapped status a generic code rather than undefined', async () => {
      expect(await body(await call(new HTTPException(418, { message: 'teapot' })))).toMatchObject({
        status: 418,
        code: 'http_error',
        title: 'Error',
      })
    })
  })

  describe('the 500 branch', () => {
    it('answers 500 for an error that is neither an AppError nor an HTTPException', async () => {
      const response = await call(new Error('boom'))
      expect(response.status).toBe(500)
      expect(await body(response)).toMatchObject({ status: 500, code: 'internal_error' })
    })

    it('never repeats the thrown message, because an unexpected error often quotes a secret', async () => {
      const secret = 'postgres://admin:hunter2@db.internal:5432'
      const document = JSON.stringify(await body(await call(new Error(`connect ${secret}`))))
      expect(document).not.toContain(secret)
      expect(document).not.toContain('hunter2')
    })

    it('never repeats a TypeError message either, so the branch is by kind and not by wording', async () => {
      const document = JSON.stringify(await body(await call(new TypeError('x.y is not a function'))))
      expect(document).not.toContain('is not a function')
    })
  })

  describe('fact 12: a header set before the throw must not ride along', () => {
    it('answers 403 with no etag, because the response is built fresh rather than from the context', async () => {
      const response = await call(new Forbidden('Not permitted'), (set) => {
        set('etag', 'W/"a3f9c1"')
        set('x-leak', 'exists')
      })
      expect(response.status).toBe(403)
      expect(response.headers.get('etag')).toBeNull()
      expect(response.headers.get('x-leak')).toBeNull()
      expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    })

    it('carries only the two headers the problem response sets itself', async () => {
      const response = await call(new NotFound('gone'), (set) => {
        set('etag', 'W/"a3f9c1"')
        set('x-total-count', '17')
        set('last-modified', 'Wed, 10 Sep 2026 12:00:00 GMT')
      })
      expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
    })
  })

  describe('fact 13: only Error subclasses reach onError at all', () => {
    it('lets a thrown string escape the dispatcher instead of becoming a problem document', async () => {
      await expect(call('a bare string')).rejects.toBe('a bare string')
    })

    it('lets a thrown plain object escape too', async () => {
      const thrown = { status: 403 }
      await expect(call(thrown)).rejects.toBe(thrown)
    })
  })
})
