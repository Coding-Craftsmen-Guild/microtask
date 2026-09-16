import { describe, expect, it } from 'vitest'
import { ImportStagedChunk, ProjectList } from '@repo/contracts'
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

const lazyBody = (produce: () => string): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(produce()))
        controller.close()
      },
    },
    { highWaterMark: 0 },
  )

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

describe('the transport sends raw bytes verbatim, which a chunked upload needs (ADR 0044)', () => {
  it('sends the body untouched rather than JSON-stringified', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ path: 'a/b', chunkBytes: 3, sessionBytes: 3 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const chunk = new Uint8Array([1, 2, 3])
    await transport.bytes({ method: 'POST', path: '/v1/x/files', bytes: chunk }, ImportStagedChunk)
    expect(calls[0]?.init.body).toBe(chunk)
  })

  it('declares the body a byte stream, so the API reads it as bytes and not as a document', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ path: 'a', chunkBytes: 0, sessionBytes: 0 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.bytes({ method: 'POST', path: '/v1/x/files', bytes: new Uint8Array() }, ImportStagedChunk)
    expect(headersOf(calls[0] ?? { url: '', init: {} })['content-type']).toBe('application/octet-stream')
  })

  it('carries the query string the chunk is addressed by, offset and all', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ path: 'a', chunkBytes: 1, sessionBytes: 1 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await transport.bytes(
      { method: 'POST', path: '/v1/x/files', query: { path: 'a/b.json', offset: '1000000' }, bytes: new Uint8Array([7]) },
      ImportStagedChunk,
    )
    expect(calls[0]?.url).toBe(`${OPTIONS.baseUrl}/v1/x/files?path=a%2Fb.json&offset=1000000`)
  })

  it('decodes the answer through the contract schema, so a drifted body fails here', async () => {
    const { fetch } = recorder(() => jsonResponse({ path: 'a', chunkBytes: 'three', sessionBytes: 3 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    await expect(
      transport.bytes({ method: 'POST', path: '/v1/x/files', bytes: new Uint8Array() }, ImportStagedChunk),
    ).rejects.toThrow()
  })

  it('reports a refusal as an ApiError carrying the cap a 413 named', async () => {
    const { fetch } = recorder(
      () =>
        new Response(
          JSON.stringify({ status: 413, code: 'too_large', detail: 'no', instance: '/x', maxBytes: 1_000_000 }),
          { status: 413, headers: { 'content-type': 'application/problem+json' } },
        ),
    )
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const error = await transport
      .bytes({ method: 'POST', path: '/v1/x/files', bytes: new Uint8Array() }, ImportStagedChunk)
      .catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).maxBytes).toBe(1_000_000)
  })

  it('rejects before the fetcher is reached when the call is already cancelled', async () => {
    const { calls, fetch } = recorder(() => jsonResponse({ path: 'a', chunkBytes: 0, sessionBytes: 0 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const aborted = AbortSignal.abort()
    await expect(
      transport.bytes(
        { method: 'POST', path: '/v1/x/files', bytes: new Uint8Array(), signal: aborted },
        ImportStagedChunk,
      ),
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('the transport hands back an unread response, which a download proxy needs (ADR 0041)', () => {
  it('returns the response itself, with its body still unread', async () => {
    const { fetch } = recorder(() => jsonResponse({ format: 'microtask-bundle' }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const response = await transport.stream({ method: 'GET', path: '/v1/microtask/export' })
    expect(response.bodyUsed).toBe(false)
    expect(await response.json()).toEqual({ format: 'microtask-bundle' })
  })

  it('settles without pulling a single byte of the body, so nothing buffers it', async () => {
    let pulls = 0
    const body = lazyBody(() => {
      pulls += 1
      return '{"a":1}'
    })
    const { fetch } = recorder(() => new Response(body, { status: 200 }))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const response = await transport.stream({ method: 'GET', path: '/v1/microtask/export' })
    expect(pulls).toBe(0)
    expect(await response.text()).toBe('{"a":1}')
    expect(pulls).toBe(1)
  })

  it('reports a refusal as an ApiError rather than a response with bytes to stream', async () => {
    const { fetch } = recorder(() => problem(403, 'forbidden', 'no'))
    const transport = createTransport({ ...OPTIONS, fetch }, 'token')
    const error = await transport
      .stream({ method: 'GET', path: '/v1/microtask/export' })
      .catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
  })
})
