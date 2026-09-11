import { describe, expect, it } from 'vitest'
import { createAdminClient, type AdminClient } from './admin-client.js'
import { createLinkClient, type LinkClient } from './link-client.js'
import type { Fetcher } from './types.js'

interface Recorded {
  url: string
  init: RequestInit
}

const calls: Recorded[] = []

const fetch: Fetcher = (url, init) => {
  calls.push({ url, init })
  return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
}

const OPTIONS = { baseUrl: 'https://api.example.test', serviceKey: 'svc-key', fetch }

const authOf = (call: Recorded | undefined): string =>
  String(Object.fromEntries(Object.entries(call?.init.headers ?? {}))['authorization'] ?? '')

const apiKeyOf = (call: Recorded | undefined): string =>
  String(Object.fromEntries(Object.entries(call?.init.headers ?? {}))['x-api-key'] ?? '')

type NotAssignable<From, To> = [From] extends [To] ? never : true

type Interchangeability = readonly [
  NotAssignable<LinkClient, AdminClient>,
  NotAssignable<AdminClient, LinkClient>,
]

const NOT_INTERCHANGEABLE: Interchangeability = [true, true]

function wantsAdmin(client: AdminClient): AdminClient {
  return client
}

describe('the two clients are not interchangeable', () => {
  it('refuses a link client where an admin client is expected, at compile time', () => {
    const link = createLinkClient(OPTIONS, 'share-token')
    // @ts-expect-error a LinkClient must never satisfy a parameter expecting an AdminClient
    const forged: AdminClient = wantsAdmin(link)
    expect(forged.credential).toBe('link')
    expect(NOT_INTERCHANGEABLE).toEqual([true, true])
  })

  it('brands each client at runtime as well as in the type, so a mix-up is visible in a log', () => {
    expect(createAdminClient(OPTIONS, 'admin-token').credential).toBe('admin')
    expect(createLinkClient(OPTIONS, 'share-token').credential).toBe('link')
  })

  it('gives both clients the same operations, so the brand is the only thing that separates them', () => {
    const admin: Record<string, unknown> = { ...createAdminClient(OPTIONS, 'a') }
    const link: Record<string, unknown> = { ...createLinkClient(OPTIONS, 'b') }
    const surfaceOf = (client: Record<string, unknown>): readonly string[] =>
      Object.keys(client)
        .filter((key) => key !== 'credential')
        .sort()
    expect(surfaceOf(admin)).toEqual(surfaceOf(link))
    expect(surfaceOf(admin).length).toBeGreaterThan(0)
  })
})

describe('each client presents its own principal token and the shared service key', () => {
  it('sends the admin token as the bearer', async () => {
    calls.length = 0
    await createAdminClient(OPTIONS, 'admin-token').projects.list().catch(() => undefined)
    expect(authOf(calls[0])).toBe('Bearer admin-token')
    expect(apiKeyOf(calls[0])).toBe('svc-key')
  })

  it('sends the share token as the bearer', async () => {
    calls.length = 0
    await createLinkClient(OPTIONS, 'share-token').currentShare().catch(() => undefined)
    expect(authOf(calls[0])).toBe('Bearer share-token')
    expect(apiKeyOf(calls[0])).toBe('svc-key')
  })

  it('cannot be built without a service key, because a bearer alone is a 401 (ADR 0012)', () => {
    const built = createAdminClient(OPTIONS, 'admin-token')
    expect(Object.keys(built)).toContain('credential')
  })
})

describe('every operation addresses the path the API actually serves', () => {
  const client = createAdminClient(OPTIONS, 'admin-token')
  const ref = { projectId: 'p 1', taskId: 't1', tabId: 'b1' }

  const sent = async (act: () => Promise<unknown>): Promise<Recorded> => {
    calls.length = 0
    await act().catch(() => undefined)
    return calls[0] ?? { url: '', init: {} }
  }

  it('lists projects', async () => {
    expect((await sent(() => client.projects.list())).url).toBe(
      'https://api.example.test/v1/microtask/projects',
    )
  })

  it('percent-encodes an id rather than letting it change the path', async () => {
    expect((await sent(() => client.projects.read('p 1'))).url).toBe(
      'https://api.example.test/v1/microtask/projects/p%201',
    )
  })

  it('renames a folder with PATCH', async () => {
    const call = await sent(() => client.folders.rename('p1', 'f1', 'Phase one'))
    expect([call.init.method, call.url]).toEqual([
      'PATCH',
      'https://api.example.test/v1/microtask/projects/p1/folders/f1',
    ])
  })

  it('moves a task', async () => {
    const call = await sent(() => client.tasks.move({ projectId: 'p1', taskId: 't1' }, null))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/microtask/projects/p1/tasks/t1/move',
      '{"folderId":null}',
    ])
  })

  it('writes a tab document conditionally, carrying If-Match', async () => {
    const call = await sent(() =>
      client.tabs.writeDocument(ref, { type: 'doc', content: [] }, 'stamp'),
    )
    const headers = Object.fromEntries(Object.entries(call.init.headers ?? {}))
    expect([call.init.method, call.url, headers['If-Match']]).toEqual([
      'PUT',
      'https://api.example.test/v1/microtask/projects/p%201/tasks/t1/tabs/b1/document',
      'stamp',
    ])
  })

  it('revokes a share link by token', async () => {
    const call = await sent(() => client.shareLinks.revoke('p1', 'tok'))
    expect([call.init.method, call.url]).toEqual([
      'DELETE',
      'https://api.example.test/v1/microtask/projects/p1/share-links/tok',
    ])
  })

  it('searches with the term in the query string', async () => {
    expect((await sent(() => client.search('go live'))).url).toBe(
      'https://api.example.test/v1/microtask/search?q=go+live',
    )
  })

  it('asks the bootstrap route about the caller own credential', async () => {
    expect((await sent(() => client.currentShare())).url).toBe(
      'https://api.example.test/v1/microtask/shares/current',
    )
  })
})
