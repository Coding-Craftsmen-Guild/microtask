import { describe, expect, it } from 'vitest'
import { ValidationProblem } from '@repo/contracts'
import { ApiError, errorFrom } from './api-error.js'

const PROBLEM_MEDIA_TYPE = 'application/problem+json'

const INSTANCE = '/v1/microtask/projects/01M240ERCRWWCN16Q5AHP1FZAQ/tasks'

const sent = (status: number, document: unknown): Response =>
  new Response(JSON.stringify(document), {
    status,
    headers: { 'content-type': PROBLEM_MEDIA_TYPE },
  })

const validation = {
  type: '/problems/invalid',
  title: 'Unprocessable Content',
  status: 422,
  code: 'invalid',
  detail: 'The request did not match the schema for this route.',
  instance: INSTANCE,
  in: 'json',
  errors: [
    { path: 'name', message: 'Too big: expected string to have <=80 characters', code: 'too_big' },
    { path: 'folderId', message: 'Invalid input: expected string', code: 'invalid_type' },
  ],
}

const tooLarge = {
  type: '/problems/payload_too_large',
  title: 'Content Too Large',
  status: 413,
  code: 'payload_too_large',
  detail: 'This request body is larger than the 2500000 bytes this route accepts.',
  instance: `${INSTANCE}/t1/tabs/b1/document`,
  maxBytes: 2_500_000,
}

describe('errorFrom keeps the half of a problem document the UI acts on (ADR 0036)', () => {
  it('reads a 422 into the target and the field paths a form puts messages on', async () => {
    const error = await errorFrom(sent(422, validation), INSTANCE)
    expect(error.in).toBe('json')
    expect(error.errors.map((one) => one.path)).toEqual(['name', 'folderId'])
    expect(error.errors[0]?.message).toContain('<=80 characters')
    expect(error.errors[1]?.code).toBe('invalid_type')
  })

  it('is a document the published ValidationProblem schema accepts, not one invented here', () => {
    expect(ValidationProblem.safeParse(validation).error?.issues ?? []).toEqual([])
  })

  it('reads a 413 into the cap it hit, so the UI can name the number', async () => {
    const error = await errorFrom(sent(413, tooLarge), INSTANCE)
    expect(error.maxBytes).toBe(2_500_000)
    expect(error.status).toBe(413)
  })

  it('leaves all three absent on an ordinary failure rather than inventing them', async () => {
    const forbidden = { status: 403, code: 'forbidden', detail: 'Not permitted', instance: INSTANCE }
    const error = await errorFrom(sent(403, forbidden), INSTANCE)
    expect(error.in).toBeNull()
    expect(error.errors).toEqual([])
    expect(error.maxBytes).toBeNull()
  })

  it('still reads status, code, detail and instance, which it always did', async () => {
    const error = await errorFrom(sent(409, {
      status: 409,
      code: 'conflict',
      detail: 'This tab changed elsewhere',
      instance: INSTANCE,
    }), '/fallback')
    expect([error.status, error.code, error.detail, error.instance]).toEqual([
      409,
      'conflict',
      'This tab changed elsewhere',
      INSTANCE,
    ])
  })
})

describe('errorFrom survives a body written by something other than this API', () => {
  it('reports the status when a gateway sends HTML, rather than throwing a SyntaxError', async () => {
    const page = new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 })
    const error = await errorFrom(page, INSTANCE)
    expect([error.status, error.code, error.in, error.maxBytes]).toEqual([502, 'http_502', null, null])
  })

  it('ignores an "in" the API could never send, so a stranger cannot widen the union', async () => {
    const error = await errorFrom(sent(422, { ...validation, in: 'body' }), INSTANCE)
    expect(error.in).toBeNull()
  })

  it('ignores errors that is not an array', async () => {
    const error = await errorFrom(sent(422, { ...validation, errors: 'name is wrong' }), INSTANCE)
    expect(error.errors).toEqual([])
  })

  it('keeps the well-formed field errors and drops the malformed ones beside them', async () => {
    const mixed = { ...validation, errors: [validation.errors[0], 'nope', { path: 7 }] }
    const error = await errorFrom(sent(422, mixed), INSTANCE)
    expect(error.errors).toEqual([validation.errors[0]])
  })

  it('ignores a maxBytes that is not a finite number', async () => {
    for (const value of ['2500000', null, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = await errorFrom(sent(413, { ...tooLarge, maxBytes: value }), INSTANCE)
      expect(error.maxBytes, JSON.stringify(value)).toBeNull()
    }
  })
})

describe('ApiError carries the extensions on the error itself', () => {
  it('defaults them when nothing is supplied, so a caller need not check for the fields', () => {
    const error = new ApiError({ status: 500, code: 'internal_error', detail: 'x', instance: '/v1' })
    expect([error.in, error.errors, error.maxBytes]).toEqual([null, [], null])
  })

  it('is still an Error, so it survives a dispatcher that guards on instanceof', () => {
    const error = new ApiError({ status: 404, code: 'not_found', detail: 'Gone', instance: '/v1' })
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('404 not_found: Gone')
  })
})
