import { ApiError, type ClientOptions } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { clientFor } from './api'

interface Sent {
  readonly url: string
  readonly init: RequestInit
}

const headerOf = (sent: Sent, name: string): string | undefined =>
  (sent.init.headers as Record<string, string> | undefined)?.[name]

const optionsAnswering = (sent: Sent[], response: () => Response): ClientOptions => ({
  baseUrl: 'http://api.internal:4321',
  serviceKey: 'the-service-key',
  fetch: (url, init) => {
    sent.push({ url, init })
    return Promise.resolve(response())
  },
})

const ok = (): Response =>
  new Response(JSON.stringify({ projects: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const refusal = (code: string): (() => Response) => () =>
  new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code,
      detail: 'This request carried no bearer token.',
      instance: '/v1/microtask/projects',
    }),
    { status: 401, headers: { 'content-type': 'application/problem+json' } },
  )

describe('clientFor', () => {
  it('sends the service key and the bearer together for an admin principal', async () => {
    const sent: Sent[] = []
    const client = clientFor({ kind: 'admin', token: 'admin.99.sig' }, optionsAnswering(sent, ok))
    await client.projects.list()
    expect(sent).toHaveLength(1)
    const only = sent[0]
    if (only === undefined) throw new Error('no request was sent')
    expect(headerOf(only, 'x-api-key')).toBe('the-service-key')
    expect(headerOf(only, 'authorization')).toBe('Bearer admin.99.sig')
  })

  it('sends the service key and the share token together for a link principal', async () => {
    const sent: Sent[] = []
    const client = clientFor({ kind: 'link', token: 'sharetoken' }, optionsAnswering(sent, ok))
    await client.projects.list()
    const only = sent[0]
    if (only === undefined) throw new Error('no request was sent')
    expect(headerOf(only, 'x-api-key')).toBe('the-service-key')
    expect(headerOf(only, 'authorization')).toBe('Bearer sharetoken')
  })

  it('brands the two clients so neither can stand in for the other', () => {
    const sent: Sent[] = []
    const options = optionsAnswering(sent, ok)
    expect(clientFor({ kind: 'admin', token: 'a' }, options).credential).toBe('admin')
    expect(clientFor({ kind: 'link', token: 'a' }, options).credential).toBe('link')
  })

  it('never sends a request carrying the service key alone', async () => {
    const sent: Sent[] = []
    const client = clientFor({ kind: 'admin', token: 'a' }, optionsAnswering(sent, ok))
    await client.projects.list()
    await client.projects.list()
    expect(sent).toHaveLength(2)
    for (const one of sent) expect(headerOf(one, 'authorization')).toBe('Bearer a')
  })

  it.each(['no_principal', 'unknown_principal', 'unknown_service'])(
    'lets a %s 401 reach the caller instead of papering over it',
    async (code) => {
      const sent: Sent[] = []
      const client = clientFor({ kind: 'admin', token: 'a' }, optionsAnswering(sent, refusal(code)))
      const failure = await client.projects.list().catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ApiError)
      expect(failure).toMatchObject({ status: 401, code })
      expect(sent).toHaveLength(1)
    },
  )
})
