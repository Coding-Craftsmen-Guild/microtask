import { describe, expect, it } from 'vitest'
import { ApiError } from './api-error.js'
import { createMacroplanAdminClient } from './macroplan-clients.js'
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

describe('every macroplan operation addresses the path the API actually serves', () => {
  const macroplan = createMacroplanAdminClient(OPTIONS, 'admin-token')

  const sent = async (act: () => Promise<unknown>): Promise<Recorded> => {
    calls.length = 0
    await act().catch(() => undefined)
    return calls[0] ?? { url: '', init: {} }
  }

  it('lists plans under its own product prefix, not the microtask one', async () => {
    expect((await sent(() => macroplan.plans.list())).url).toBe(
      'https://api.example.test/v1/macroplan/plans',
    )
  })

  it('percent-encodes a plan id rather than letting it change the path', async () => {
    expect((await sent(() => macroplan.plans.read('p 1'))).url).toBe(
      'https://api.example.test/v1/macroplan/plans/p%201',
    )
  })

  it('addresses one item through the plan that owns it, encoding both segments', async () => {
    expect((await sent(() => macroplan.plans.readItem('p 1', 'i 2'))).url).toBe(
      'https://api.example.test/v1/macroplan/plans/p%201/items/i%202',
    )
  })

  it('asks the plan bootstrap route, which is its own product and not a shared one', async () => {
    expect((await sent(() => macroplan.currentShare())).url).toBe(
      'https://api.example.test/v1/macroplan/shares/current',
    )
  })

  it('creates a plan with POST against the collection, which names no plan', async () => {
    const call = await sent(() => macroplan.plans.create({ name: 'Q3', startDate: '2026-01-05' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/macroplan/plans',
      '{"name":"Q3","startDate":"2026-01-05"}',
    ])
  })

  it('retimes a plan with PATCH on the plan itself, sending only what it was given', async () => {
    const call = await sent(() => macroplan.plans.update('p1', { startDate: '2026-02-02' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1',
      '{"startDate":"2026-02-02"}',
    ])
  })

  it('removes a plan with DELETE on the plan itself, sending no body at all', async () => {
    const call = await sent(() => macroplan.plans.remove('p1'))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'DELETE',
      'https://api.example.test/v1/macroplan/plans/p1',
      undefined,
    ])
  })

  it('adds a rail with POST against the collection, which carries no placement', async () => {
    const call = await sent(() => macroplan.epics.create('p1', { name: 'Platform' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/macroplan/plans/p1/epics',
      '{"name":"Platform"}',
    ])
  })

  it('renames or recolours a rail with PATCH on the rail itself', async () => {
    const call = await sent(() => macroplan.epics.update('p1', 'e1', { colour: '#1f2a37' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/epics/e1',
      '{"colour":"#1f2a37"}',
    ])
  })

  it('moves a rail through its own placement segment, sending the wire shape and not a number', async () => {
    const call = await sent(() => macroplan.epics.place('p1', 'e1', { railOrder: 2 }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/epics/e1/placement',
      '{"railOrder":2}',
    ])
  })

  it('removes a rail with DELETE, percent-encoding every id it was handed', async () => {
    const call = await sent(() => macroplan.epics.remove('p 1', 'e 1'))
    expect([call.init.method, call.url]).toEqual([
      'DELETE',
      'https://api.example.test/v1/macroplan/plans/p%201/epics/e%201',
    ])
  })

  it('adds a feature with POST against the collection, naming its rail in the body', async () => {
    const call = await sent(() => macroplan.features.create('p1', { epicId: 'e1', name: 'Login' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/macroplan/plans/p1/features',
      '{"epicId":"e1","name":"Login"}',
    ])
  })

  it('clears an estimate with an explicit null, which is not the same as omitting it', async () => {
    const call = await sent(() => macroplan.features.update('p1', 'f1', { estimateDays: null }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/features/f1',
      '{"estimateDays":null}',
    ])
    const omitted = await sent(() => macroplan.features.update('p1', 'f1', { name: 'Sign in' }))
    expect(omitted.init.body).toBe('{"name":"Sign in"}')
  })

  it('moves a feature through its own placement segment, sending both rail and position', async () => {
    const call = await sent(() =>
      macroplan.features.place('p1', 'f1', { epicId: 'e2', position: 3 }),
    )
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/features/f1/placement',
      '{"epicId":"e2","position":3}',
    ])
  })

  it('replaces an edge list with PUT, wrapping the ids in the one field the body has', async () => {
    const call = await sent(() => macroplan.features.setDependencies('p1', 'f1', ['f2', 'f3']))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PUT',
      'https://api.example.test/v1/macroplan/plans/p1/features/f1/dependencies',
      '{"dependsOn":["f2","f3"]}',
    ])
  })

  it('sends an empty list as an empty array, which is how every edge is dropped', async () => {
    const call = await sent(() => macroplan.features.setDependencies('p1', 'f1', []))
    expect(call.init.body).toBe('{"dependsOn":[]}')
  })

  it('removes a feature with DELETE, percent-encoding every id it was handed', async () => {
    const call = await sent(() => macroplan.features.remove('p 1', 'f 1'))
    expect([call.init.method, call.url]).toEqual([
      'DELETE',
      'https://api.example.test/v1/macroplan/plans/p%201/features/f%201',
    ])
  })

  it('adds an item with POST against the collection, naming its feature in the body', async () => {
    const call = await sent(() => macroplan.items.create('p1', { featureId: 'f1', name: 'Sign in' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/macroplan/plans/p1/items',
      '{"featureId":"f1","name":"Sign in"}',
    ])
  })

  it('clears an item estimate with an explicit null, which is not the same as omitting it', async () => {
    const call = await sent(() => macroplan.items.update('p1', 'i1', { estimateDays: null }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/items/i1',
      '{"estimateDays":null}',
    ])
  })

  it('moves an item through its own placement segment, sending the 0-based position with it', async () => {
    const call = await sent(() =>
      macroplan.items.place('p1', 'i1', { featureId: 'f2', position: 0 }),
    )
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/items/i1/placement',
      '{"featureId":"f2","position":0}',
    ])
  })

  it('replaces a description with PUT, wrapping the text in the one field the body has', async () => {
    const call = await sent(() => macroplan.items.describe('p1', 'i1', 'Ship behind a flag'))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PUT',
      'https://api.example.test/v1/macroplan/plans/p1/items/i1/description',
      '{"description":"Ship behind a flag"}',
    ])
  })

  it('removes an item with DELETE against the item itself', async () => {
    const call = await sent(() => macroplan.items.remove('p1', 'i1'))
    expect([call.init.method, call.url]).toEqual([
      'DELETE',
      'https://api.example.test/v1/macroplan/plans/p1/items/i1',
    ])
  })

  it('percent-encodes both ids on the deepest item path it builds', async () => {
    expect((await sent(() => macroplan.items.describe('p 1', 'i 2', 'x'))).url).toBe(
      'https://api.example.test/v1/macroplan/plans/p%201/items/i%202/description',
    )
  })

  it('mints a seat with POST against the seats collection of one plan', async () => {
    const call = await sent(() => macroplan.shareLinks.create('p1', { name: 'Jane', role: 'view' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'POST',
      'https://api.example.test/v1/macroplan/plans/p1/share-links',
      '{"name":"Jane","role":"view"}',
    ])
  })

  it('changes a seat role with PATCH on the token, which the route leaves as it was', async () => {
    const call = await sent(() => macroplan.shareLinks.update('p1', 'tok', { role: 'write' }))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'PATCH',
      'https://api.example.test/v1/macroplan/plans/p1/share-links/tok',
      '{"role":"write"}',
    ])
  })

  it('revokes a seat with DELETE on the token, sending no body at all', async () => {
    const call = await sent(() => macroplan.shareLinks.revoke('p1', 'tok'))
    expect([call.init.method, call.url, call.init.body]).toEqual([
      'DELETE',
      'https://api.example.test/v1/macroplan/plans/p1/share-links/tok',
      undefined,
    ])
  })

  it('percent-encodes the plan and the token both, the two segments a seat path has', async () => {
    expect((await sent(() => macroplan.shareLinks.revoke('p 1', 'to k'))).url).toBe(
      'https://api.example.test/v1/macroplan/plans/p%201/share-links/to%20k',
    )
  })
})

describe('a dependency cycle reaches the caller as an ApiError it can read', () => {
  const CYCLE_DETAIL = 'These features would wait on each other: f1, f3'

  const conflicting: Fetcher = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve(
      new Response(
        JSON.stringify({
          type: '/problems/conflict',
          title: 'Conflict',
          status: 409,
          code: 'conflict',
          detail: CYCLE_DETAIL,
          instance: '/v1/macroplan/plans/p1/features/f1/dependencies',
        }),
        { status: 409, headers: { 'content-type': 'application/problem+json' } },
      ),
    )
  }

  it('carries the 409 out of the dependencies route with the sentence naming both features', async () => {
    const client = createMacroplanAdminClient({ ...OPTIONS, fetch: conflicting }, 'admin-token')
    calls.length = 0
    const failure = await client.features
      .setDependencies('p1', 'f1', ['f3'])
      .then(() => null)
      .catch((error: unknown) => error)
    expect([calls[0]?.init.method, calls[0]?.url]).toEqual([
      'PUT',
      'https://api.example.test/v1/macroplan/plans/p1/features/f1/dependencies',
    ])
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 409, code: 'conflict', detail: CYCLE_DETAIL })
  })
})
