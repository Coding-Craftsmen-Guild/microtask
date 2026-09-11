import { describe, expect, it } from 'vitest'
import { ProjectList } from '@repo/contracts'
import { ApiError } from './api-error.js'
import { createTransport } from './transport.js'
import type { Fetcher } from './types.js'

interface Recorded {
  url: string
  init: RequestInit
}

const OPTIONS = { baseUrl: 'https://api.example.test', serviceKey: 'svc-key' }

function recorder(respond: (call: Recorded) => Response): {
  calls: Recorded[]
  fetch: Fetcher
} {
  const calls: Recorded[] = []
  const fetch: Fetcher = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(respond({ url, init }))
  }
  return { calls, fetch }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const problem = (status: number, code: string, detail: string): Response =>
  new Response(JSON.stringify({ type: `/problems/${code}`, status, code, detail, instance: '/x' }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

const headersOf = (call: Recorded): Record<string, string> => {
  const entries = Object.entries(call.init.headers ?? {})
  return Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value)]))
}

describe('the transport carries both credentials ADR 0012 requires', () => {
  it('sends the service key and the principal token on every request', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'principal-token')
    await transport.json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList)
    expect(headersOf(calls[0] ?? { url: '', init: {} })).toMatchObject({
      'x-api-key': 'svc-key',
      authorization: 'Bearer principal-token',
      accept: 'application/json',
    })
  })

  it('sets no content-type when there is no body, so a GET cannot be read as a write', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList)
    expect(headersOf(calls[0] ?? { url: '', init: {} })['content-type']).toBeUndefined()
  })

  it('serialises a body as JSON and says so', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.json(
      { method: 'POST', path: '/v1/microtask/projects', body: { name: 'Launch' } },
      ProjectList,
    )
    const call = calls[0] ?? { url: '', init: {} }
    expect(headersOf(call)['content-type']).toBe('application/json')
    expect(call.init.body).toBe('{"name":"Launch"}')
  })

  it('merges per-call headers such as the conditional-write precondition', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.json(
      { method: 'PUT', path: '/x', body: {}, headers: { 'If-Match': 'stamp' } },
      ProjectList,
    )
    expect(headersOf(calls[0] ?? { url: '', init: {} })['if-match']).toBe('stamp')
  })
})

describe('the transport builds the URL the API answers on', () => {
  it('appends a query string when one is given', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.json({ method: 'GET', path: '/v1/microtask/search', query: { q: 'a b' } }, ProjectList)
    expect(calls[0]?.url).toBe('https://api.example.test/v1/microtask/search?q=a+b')
  })

  it('does not double the separator when the base URL ends in a slash', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, baseUrl: 'https://api.example.test/', fetch }, 't')
    await transport.json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList)
    expect(calls[0]?.url).toBe('https://api.example.test/v1/microtask/projects')
  })
})

describe('the transport decodes through the contract schema, so a drifted response is a failure here', () => {
  it('returns the parsed value', async () => {
    const { fetch } = recorder(() => jsonResponse({ projects: [] }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await expect(
      transport.json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList),
    ).resolves.toEqual({ projects: [] })
  })

  it('rejects a 200 whose body does not match the contract', async () => {
    const { fetch } = recorder(() => jsonResponse({ projects: 'not a list' }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await expect(
      transport.json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList),
    ).rejects.toThrow()
  })

  it('resolves a 204 with no body through empty()', async () => {
    const { fetch } = recorder(() => new Response(null, { status: 204 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await expect(transport.empty({ method: 'DELETE', path: '/v1/microtask/projects/p1' })).resolves
      .toBeUndefined()
  })
})

describe('the transport reports a problem document as an ApiError', () => {
  it('carries the status, the code and the detail the API sent', async () => {
    const { fetch } = recorder(() => problem(403, 'forbidden', 'Not permitted'))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const failure = await transport
      .json({ method: 'GET', path: '/v1/microtask/projects' }, ProjectList)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 403, code: 'forbidden', detail: 'Not permitted' })
  })

  it('reports a conflict, which a conditional write treats as reload-and-retry rather than as a bug', async () => {
    const { fetch } = recorder(() => problem(409, 'conflict', 'Somebody else saved'))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const failure = await transport.empty({ method: 'PUT', path: '/x' }).catch((e: unknown) => e)
    expect(failure).toMatchObject({ status: 409, code: 'conflict' })
  })

  it('still reports a status when the error body is not a problem document at all', async () => {
    const { fetch } = recorder(() => new Response('<html>gateway</html>', { status: 502 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const failure = await transport.empty({ method: 'GET', path: '/x' }).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 502, code: 'http_502', instance: '/x' })
  })
})
