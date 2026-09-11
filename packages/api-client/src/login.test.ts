import { describe, expect, it } from 'vitest'
import { ApiError } from './api-error.js'
import { login } from './login.js'
import type { Fetcher } from './types.js'

interface Recorded {
  url: string
  init: RequestInit
}

const SESSION = { token: 'admin-token', expiresAt: '2026-09-11T00:00:00.000Z', expiresInSeconds: 3600 }

function recorder(respond: () => Response): { calls: Recorded[]; fetch: Fetcher } {
  const calls: Recorded[] = []
  const fetch: Fetcher = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(respond())
  }
  return { calls, fetch }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('login mints the credential an admin client is built with', () => {
  it('posts the password to the login route and decodes the session through the contract', async () => {
    const { calls, fetch } = recorder(() => jsonResponse(SESSION))
    const session = await login(
      { baseUrl: 'https://api.example.test', serviceKey: 'svc-key', fetch },
      'hunter2',
    )
    expect(session).toEqual(SESSION)
    expect(calls[0]?.url).toBe('https://api.example.test/v1/auth/login')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.body).toBe('{"password":"hunter2"}')
  })

  it('names the calling app and presents no bearer, because the bearer is what it is asking for', async () => {
    const { calls, fetch } = recorder(() => jsonResponse(SESSION))
    await login({ baseUrl: 'https://api.example.test', serviceKey: 'svc-key', fetch }, 'hunter2')
    const headers: Record<string, unknown> = { ...calls[0]?.init.headers }
    expect(headers['x-api-key']).toBe('svc-key')
    expect(headers['authorization']).toBeUndefined()
  })

  it('reports a refusal as an ApiError rather than as a value the caller might read as a session', async () => {
    const { fetch } = recorder(() =>
      jsonResponse(
        { status: 401, code: 'unauthorized', detail: 'The credentials presented were not accepted.' },
        401,
      ),
    )
    const failure = await login(
      { baseUrl: 'https://api.example.test', serviceKey: 'svc-key', fetch },
      'wrong',
    ).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 401, code: 'unauthorized' })
  })
})
