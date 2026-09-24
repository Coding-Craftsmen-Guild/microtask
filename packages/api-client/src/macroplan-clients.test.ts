import { describe, expect, it } from 'vitest'
import {
  createMacroplanAdminClient,
  createMacroplanLinkClient,
  type MacroplanAdminClient,
  type MacroplanLinkClient,
  type MacroplanSessionClient,
} from './macroplan-clients.js'
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
  NotAssignable<MacroplanLinkClient, MacroplanAdminClient>,
  NotAssignable<MacroplanAdminClient, MacroplanLinkClient>,
]

const NOT_INTERCHANGEABLE: Interchangeability = [true, true]

type SeatHolds = readonly [
  NotAssignable<MacroplanSessionClient, MacroplanAdminClient>,
  NotAssignable<MacroplanSessionClient, MacroplanLinkClient>,
]

const EITHER_CREDENTIAL: SeatHolds = [true, true]

describe('the two macroplan clients are not interchangeable', () => {
  it('keeps each brand unassignable to the other, which is what the compiler checks', () => {
    expect(NOT_INTERCHANGEABLE).toEqual([true, true])
  })

  it('refuses the session union where either member is expected, so a page must ask which it holds', () => {
    expect(EITHER_CREDENTIAL).toEqual([true, true])
  })

  it('brands each client at runtime as well as in the type, so a mix-up is visible in a log', () => {
    expect(createMacroplanAdminClient(OPTIONS, 'admin-token').credential).toBe('admin')
    expect(createMacroplanLinkClient(OPTIONS, 'share-token').credential).toBe('link')
  })

  it('gives both the same operations, so the brand is the only thing separating them', () => {
    const admin: Record<string, unknown> = { ...createMacroplanAdminClient(OPTIONS, 'a') }
    const link: Record<string, unknown> = { ...createMacroplanLinkClient(OPTIONS, 'b') }
    const surfaceOf = (client: Record<string, unknown>): readonly string[] =>
      Object.keys(client)
        .filter((key) => key !== 'credential')
        .sort()
    expect(surfaceOf(admin)).toEqual(surfaceOf(link))
    expect(surfaceOf(admin).length).toBeGreaterThan(0)
  })
})

describe('each macroplan client presents its own principal token and the shared service key', () => {
  it('sends the admin token as the bearer', async () => {
    calls.length = 0
    await createMacroplanAdminClient(OPTIONS, 'admin-token')
      .plans.list()
      .catch(() => undefined)
    expect(authOf(calls[0])).toBe('Bearer admin-token')
    expect(apiKeyOf(calls[0])).toBe('svc-key')
  })

  it('sends the plan seat token as the bearer', async () => {
    calls.length = 0
    await createMacroplanLinkClient(OPTIONS, 'share-token')
      .currentShare()
      .catch(() => undefined)
    expect(authOf(calls[0])).toBe('Bearer share-token')
    expect(apiKeyOf(calls[0])).toBe('svc-key')
  })
})

describe('the macroplan surface reaches no microtask operation', () => {
  it('holds plans, their rails and the bootstrap, and nothing a project could be read through', () => {
    const admin: Record<string, unknown> = { ...createMacroplanAdminClient(OPTIONS, 'a') }
    expect(Object.keys(admin).sort()).toEqual([
      'credential',
      'currentShare',
      'epics',
      'features',
      'items',
      'plans',
    ])
  })

  it('reads a plan through GET, the only method phase 2 needs', async () => {
    calls.length = 0
    await createMacroplanAdminClient(OPTIONS, 'a')
      .plans.read('p1')
      .catch(() => undefined)
    expect(calls[0]?.init.method).toBe('GET')
  })
})
