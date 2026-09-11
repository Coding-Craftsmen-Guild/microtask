import { describe, expect, it } from 'vitest'
import { codeForStatus, PROBLEM_MEDIA_TYPE, problemResponse, titleForStatus } from './problem.js'

const read = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('problemResponse', () => {
  it('answers with the RFC 7807 media type rather than application/json', () => {
    const response = problemResponse({
      status: 403,
      code: 'forbidden',
      detail: 'Not permitted',
      instance: '/v1/microtask/projects/P1',
    })
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
  })

  it('carries the status on the response as well as inside the document', async () => {
    const response = problemResponse({
      status: 409,
      code: 'conflict',
      detail: 'Stale write',
      instance: '/v1',
    })
    expect(response.status).toBe(409)
    expect(await read(response)).toMatchObject({ status: 409, code: 'conflict' })
  })

  it('forbids caching, because a proxy that stored a 403 would serve it to the next caller', () => {
    const response = problemResponse({ status: 403, code: 'forbidden', detail: 'x', instance: '/v1' })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('derives type and title from the status so a code never has two spellings', async () => {
    const body = await read(
      problemResponse({ status: 404, code: 'not_found', detail: 'Project not found', instance: '/v1/p' }),
    )
    expect(body).toEqual({
      type: '/problems/not_found',
      title: 'Not Found',
      status: 404,
      code: 'not_found',
      detail: 'Project not found',
      instance: '/v1/p',
    })
  })

  it('derives type from the code it was given, not from the status, so AppError codes survive', async () => {
    const body = await read(
      problemResponse({ status: 422, code: 'document_too_large', detail: 'x', instance: '/v1' }),
    )
    expect(body.type).toBe('/problems/document_too_large')
    expect(body.code).toBe('document_too_large')
  })

  it('merges extension members alongside the core document', async () => {
    const body = await read(
      problemResponse({ status: 422, code: 'invalid', detail: 'x', instance: '/v1' }, { in: 'query' }),
    )
    expect(body.in).toBe('query')
    expect(body.status).toBe(422)
  })

  it('refuses to let an extension member overwrite a core member', async () => {
    const body = await read(
      problemResponse(
        { status: 403, code: 'forbidden', detail: 'Not permitted', instance: '/v1/secret' },
        { status: 200, code: 'ok', detail: 'leaked', instance: '/elsewhere', title: 'OK', type: 'x' },
      ),
    )
    expect(body).toMatchObject({
      status: 403,
      code: 'forbidden',
      detail: 'Not permitted',
      instance: '/v1/secret',
      title: 'Forbidden',
      type: '/problems/forbidden',
    })
  })

  it('starts from no headers at all, so nothing a handler set can ride along', () => {
    const response = problemResponse({ status: 403, code: 'forbidden', detail: 'x', instance: '/v1' })
    expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
  })
})

describe('titleForStatus and codeForStatus', () => {
  const known: readonly (readonly [number, string, string])[] = [
    [400, 'Bad Request', 'bad_request'],
    [401, 'Unauthorized', 'unauthorized'],
    [403, 'Forbidden', 'forbidden'],
    [404, 'Not Found', 'not_found'],
    [405, 'Method Not Allowed', 'method_not_allowed'],
    [409, 'Conflict', 'conflict'],
    [413, 'Content Too Large', 'payload_too_large'],
    [415, 'Unsupported Media Type', 'unsupported_media_type'],
    [422, 'Unprocessable Content', 'invalid'],
    [429, 'Too Many Requests', 'too_many_requests'],
    [500, 'Internal Server Error', 'internal_error'],
    [503, 'Service Unavailable', 'service_unavailable'],
  ]

  for (const [status, title, code] of known) {
    it(`maps ${status} to "${title}" and "${code}"`, () => {
      expect(titleForStatus(status)).toBe(title)
      expect(codeForStatus(status)).toBe(code)
    })
  }

  it('gives an unmapped status a generic title and code rather than undefined', () => {
    expect(titleForStatus(418)).toBe('Error')
    expect(codeForStatus(418)).toBe('http_error')
  })

  it('agrees with the kernel codes, so one failure never has two names', () => {
    expect(codeForStatus(422)).toBe('invalid')
    expect(codeForStatus(404)).toBe('not_found')
    expect(codeForStatus(403)).toBe('forbidden')
    expect(codeForStatus(409)).toBe('conflict')
  })
})
