import { describe, expect, it } from 'vitest'
import { ApiError, createAdminClient, createLinkClient } from '@repo/api-client'
import type { Fetcher, MicrotaskApi } from '@repo/api-client'
import { LIMITS } from '@repo/contracts'
import { AdminVerifier } from '../auth/admin-verifier.js'
import { IDS, SERVICE_KEY, TOKENS, buildApp, testConfig } from '../testing/harness.js'
import { fixedClock } from '@repo/microtask-domain/testing'
import { STAMP } from '@repo/microtask-domain/testing'

const BASE = 'https://api.example.test'

const adminToken = (): string =>
  new AdminVerifier({ config: testConfig, clock: fixedClock(STAMP) }).issue().token

/** Sends the client's request into the real app rather than onto a socket. */
const overApp = async (): Promise<Fetcher> => {
  const app = await buildApp()
  return async (url, init) => app.request(url.slice(BASE.length), init)
}

const asAdmin = async (): Promise<MicrotaskApi> =>
  createAdminClient({ baseUrl: BASE, serviceKey: SERVICE_KEY, fetch: await overApp() }, adminToken())

const asLink = async (token: string): Promise<MicrotaskApi> =>
  createLinkClient({ baseUrl: BASE, serviceKey: SERVICE_KEY, fetch: await overApp() }, token)

const refused = async (call: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await call()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('the call succeeded, so there is no error to inspect')
}

describe('a 422 from the real API round-trips into a field a form can point at (ADR 0036)', () => {
  it('carries in: json and the path of the field that failed', async () => {
    const client = await asAdmin()
    const error = await refused(() => client.projects.create('x'.repeat(81)))
    expect(error.status).toBe(422)
    expect(error.code).toBe('invalid')
    expect(error.in).toBe('json')
    expect(error.errors.map((one) => one.path)).toEqual(['name'])
    expect(error.errors[0]?.code).toBe('too_big')
  })

  it('names the nested path for a field inside a body, not just the top-level key', async () => {
    const client = await asAdmin()
    const error = await refused(() => client.tasks.reorder(IDS.p1, null, ['not-a-ulid']))
    expect(error.in).toBe('json')
    expect(error.errors.map((one) => one.path)).toEqual(['taskIds.0'])
  })

  it('names param when the path segment is what failed, so the UI blames the right thing', async () => {
    const client = await asAdmin()
    const error = await refused(() => client.projects.read('../../etc/passwd'))
    expect([error.status, error.in]).toEqual([422, 'param'])
    expect(error.errors.map((one) => one.path)).toEqual(['projectId'])
  })

  it('names query for a search term the route refuses, the term being a query parameter', async () => {
    const client = await asAdmin()
    const error = await refused(() => client.search('x'.repeat(LIMITS.nameLength + 1)))
    expect([error.status, error.in]).toEqual([422, 'query'])
    expect(error.errors.map((one) => one.path)).toEqual(['q'])
  })

  it('accepts a term that reduces to nothing, which is a question with no answer (ADR 0021)', async () => {
    const client = await asAdmin()
    expect((await client.search('')).results).toEqual([])
  })
})

describe('a 413 from the real API round-trips into the cap it hit', () => {
  it('carries maxBytes, so the UI can name the number instead of saying "too large"', async () => {
    const client = await asAdmin()
    const huge = { type: 'doc' as const, content: [{ type: 'text', text: 'x'.repeat(3_000_000) }] }
    const ref = { projectId: IDS.p1, taskId: IDS.t1, tabId: IDS.tab1 }
    const error = await refused(() => client.tabs.writeDocument(ref, huge, STAMP))
    expect(error.status).toBe(413)
    expect(error.code).toBe('payload_too_large')
    expect(error.maxBytes).toBeGreaterThan(2_000_000)
    expect(error.detail).toContain(String(error.maxBytes))
  })
})

describe('an ordinary refusal round-trips with the extensions absent', () => {
  it('reads a 403 with no in, no errors and no cap', async () => {
    const client = await asLink(TOKENS.p1View)
    const error = await refused(() => client.projects.list())
    expect([error.status, error.code, error.in, error.maxBytes]).toEqual([403, 'forbidden', null, null])
    expect(error.errors).toEqual([])
  })

  it('reads a 401 cause code, which is how the app tells a dead link from no cookie', async () => {
    const client = await asLink('shr_names_nobody_at_all')
    const error = await refused(() => client.currentShare())
    expect([error.status, error.code]).toEqual([401, 'unknown_principal'])
  })
})

describe('the client can rename a share link through the real route (ADR 0035)', () => {
  it('keeps the token and returns the link as it now is', async () => {
    const client = await asAdmin()
    const updated = await client.shareLinks.update(IDS.p1, TOKENS.p1View, { name: 'Jane (ACME)' })
    expect(updated).toMatchObject({ token: TOKENS.p1View, name: 'Jane (ACME)' })
  })

  it('reports a 403 as an ApiError when the caller may not administer the seats', async () => {
    const client = await asLink(TOKENS.t1Manage)
    const error = await refused(() =>
      client.shareLinks.update(IDS.p1, TOKENS.p1View, { role: 'view' }),
    )
    expect([error.status, error.code]).toEqual([403, 'forbidden'])
  })
})

describe('the list the client decodes carries no share token (ADR 0033)', () => {
  it('parses into rows with a count and no links', async () => {
    const client = await asAdmin()
    const listed = await client.projects.list()
    const row = listed.projects.find((one) => one.id === IDS.p1)
    expect(row).not.toHaveProperty('shareLinks')
    expect(row?.shareLinkCount).toBe(4)
    expect(JSON.stringify(listed)).not.toContain(TOKENS.p1View)
  })

  it('still decodes the read shape with its links, which is where a token belongs', async () => {
    const client = await asAdmin()
    const read = await client.projects.read(IDS.p1)
    expect(read.shareLinks?.map((one) => one.token)).toContain(TOKENS.p1View)
  })
})
