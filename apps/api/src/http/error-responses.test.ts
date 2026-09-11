import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { problemSchema, validationProblemSchema } from './error-schemas.js'
import { COMMON_ERROR_STATUSES, problemResponses, type ProblemResponseSpec } from './error-responses.js'
import { PROBLEM_MEDIA_TYPE } from './problem.js'

const emit = (responses: Record<number, ProblemResponseSpec>): Record<string, unknown> => {
  const app = new OpenAPIHono()
  app.openapi(
    createRoute({
      method: 'get',
      path: '/thing',
      responses: { 200: { description: 'ok' }, ...responses },
    }),
    (c) => c.json({ ok: true }, 200),
  )
  return app.getOpenAPI31Document({ openapi: '3.1.0', info: { title: 't', version: '1' } }) as unknown as Record<
    string,
    unknown
  >
}

const operation = (document: Record<string, unknown>): Record<string, Record<string, unknown>> => {
  const paths = document.paths as Record<string, Record<string, Record<string, Record<string, unknown>>>>
  return paths['/thing']?.get?.responses as unknown as Record<string, Record<string, unknown>>
}

describe('problemResponses', () => {
  it('declares the statuses every guarded route can answer with', () => {
    expect(Object.keys(problemResponses()).map(Number).sort((a, b) => a - b)).toEqual([...COMMON_ERROR_STATUSES])
  })

  it('includes 401, 403, 404, 422 and 500, which are the four gates plus the catch-all', () => {
    expect([...COMMON_ERROR_STATUSES]).toEqual([401, 403, 404, 422, 500])
  })

  it('adds the extra statuses a particular route needs without losing the common ones', () => {
    const keys = Object.keys(problemResponses([409, 413])).map(Number).sort((a, b) => a - b)
    expect(keys).toEqual([401, 403, 404, 409, 413, 422, 500])
  })

  it('gives every status a description taken from the status title', () => {
    const entries = problemResponses([409]) as Record<number, { description: string }>
    expect(entries[409]?.description).toBe('Conflict')
    expect(entries[403]?.description).toBe('Forbidden')
  })

  it('documents each error under the problem media type, never application/json', () => {
    const responses = operation(emit(problemResponses()))
    for (const status of COMMON_ERROR_STATUSES) {
      const content = responses[String(status)]?.content as Record<string, unknown>
      expect(Object.keys(content)).toEqual([PROBLEM_MEDIA_TYPE])
    }
  })

  it('uses the richer validation schema for 422 and the plain one everywhere else', () => {
    const responses = operation(emit(problemResponses()))
    const schemaAt = (status: number): Record<string, unknown> => {
      const content = responses[String(status)]?.content as Record<string, { schema: Record<string, unknown> }>
      return content[PROBLEM_MEDIA_TYPE]?.schema as Record<string, unknown>
    }
    expect(schemaAt(422).$ref).toBe('#/components/schemas/ValidationProblem')
    expect(schemaAt(403).$ref).toBe('#/components/schemas/Problem')
  })
})

describe('the problem schemas', () => {
  it('accepts a document the problem builder would actually emit', () => {
    expect(
      problemSchema.safeParse({
        type: '/problems/forbidden',
        title: 'Forbidden',
        status: 403,
        code: 'forbidden',
        detail: 'Not permitted',
        instance: '/v1/microtask/projects/P1',
      }).success,
    ).toBe(true)
  })

  it('requires the validation document to name its target and list its issues', () => {
    const parsed = validationProblemSchema.safeParse({
      type: '/problems/invalid',
      title: 'Unprocessable Content',
      status: 422,
      code: 'invalid',
      detail: 'The request did not validate',
      instance: '/v1',
      in: 'query',
      errors: [{ path: 'view', message: 'Invalid option', code: 'invalid_value' }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects a validation document with no target, so "in" cannot quietly go missing', () => {
    expect(
      validationProblemSchema.safeParse({
        type: '/problems/invalid',
        title: 'Unprocessable Content',
        status: 422,
        code: 'invalid',
        detail: 'x',
        instance: '/v1',
        errors: [],
      }).success,
    ).toBe(false)
  })

  it('emits both schemas as named components rather than inlining them at every use', () => {
    const components = emit(problemResponses()).components as Record<string, Record<string, unknown>>
    expect(Object.keys(components.schemas ?? {}).sort()).toEqual(['Problem', 'ValidationProblem'])
  })
})
