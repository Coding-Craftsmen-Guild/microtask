import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, problem, ulid, type FakeAdmin } from '../../../../actions/testing/fake-admin'

let fake: FakeAdmin
let signedIn = true

vi.mock('../../../../lib/api', () => ({
  apiForSession: () => Promise.resolve(signedIn ? asClient(fake) : null),
}))

const { GET } = await import('./route')

const ORIGIN = 'https://microtask.example'
const P = ulid(1)
const T = ulid(2)
const OTHER = ulid(3)

const visit = (projectId: string, query = ''): Promise<Response> =>
  GET(new Request(`${ORIGIN}/admin/projects/${encodeURIComponent(projectId)}${query}`), {
    params: Promise.resolve({ projectId }),
  })

const locationOf = (response: Response): string | null => response.headers.get('location')

interface LegacyFile {
  readonly id: string
  readonly tabs: readonly { readonly id: string }[]
}

/**
 * The two legacy project files the production volume holds, neutralised — the same fixtures
 * `packages/microtask-domain/src/import/legacy.test.ts` converts, reached the same way, by
 * relative path because `@repo/contracts` publishes only `"."`.
 *
 * They are read here so that no id in the drift block below is written by hand: the project id
 * and the tab ids this redirect is asserted to use are the ones the real files carry, and
 * `legacy.test` "keeps the project id and every tab id of a real legacy file" is what pins the
 * importer to those same ids. `apps/microtask` cannot import the converter itself — its own
 * `eslint.config.js` bans `@repo/microtask-domain` outright (ADR 0014, 0027) — so the fixture is
 * the shared fact, and ADR 0046 records what that does and does not buy.
 */
const FIXTURES = [
  new URL('../../../../../../packages/contracts/src/testing/legacy-project.fixture.json', import.meta.url),
  new URL('../../../../../../packages/contracts/src/testing/legacy-project-2.fixture.json', import.meta.url),
] as const

const legacyFile = (fixture: URL): LegacyFile => JSON.parse(readFileSync(fixture, 'utf8')) as LegacyFile

/** The project §7.6 converts a legacy file into: one task filed under the file's own id. */
const imported = (file: LegacyFile): object => ({ id: file.id, tasks: [{ id: file.id }] })

const holding = (...taskIds: readonly string[]): void => {
  fake.projects.read.mockResolvedValue({ id: P, tasks: taskIds.map((id) => ({ id })) })
}

beforeEach(() => {
  fake = fakeAdmin()
  signedIn = true
})

describe('GET /admin/projects/<projectId>, the legacy admin address (parity route R3)', () => {
  it('answers the task page of the project’s own id, which is the tab strip the old page showed', async () => {
    holding(P)
    const response = await visit(P)
    expect(locationOf(response)).toBe(`/p/${P}/t/${P}`)
    expect(fake.projects.read).toHaveBeenCalledWith(P)
  })

  it('is answered 307 and never 308, both targets being chosen from data that can change', async () => {
    holding(P)
    expect((await visit(P)).status).toBe(307)
  })

  it('answers a path rather than an absolute URL, so it names no host the proxy did not', async () => {
    holding(P)
    expect(locationOf(await visit(P))?.startsWith('/p/')).toBe(true)
  })

  it('encodes the segment it did not validate, so it cannot become a second path segment', async () => {
    fake.projects.read.mockResolvedValue({ id: 'a/../p', tasks: [{ id: 'a/../p' }] })
    expect(locationOf(await visit('a/../p'))).toBe('/p/a%2F..%2Fp/t/a%2F..%2Fp')
  })

  it('encodes it in the fallback too, where the project answers for no such task', async () => {
    holding()
    expect(locationOf(await visit('a/../p'))).toBe('/p/a%2F..%2Fp')
  })

  it('keeps an admin-gated answer out of every shared cache', async () => {
    holding(P)
    expect((await visit(P)).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('a legacy ?tab=, which names an inner tab again (spec §7.6 as corrected)', () => {
  it('carries the tab id onto the task page rather than consuming it into the path', async () => {
    holding(P)
    expect(locationOf(await visit(P, `?tab=${T}`))).toBe(`/p/${P}/t/${P}?tab=${T}`)
  })

  it('drops every other query parameter, only ?tab= naming anything the target can use', async () => {
    holding(P)
    expect(locationOf(await visit(P, `?tab=${T}&foo=bar`))).toBe(`/p/${P}/t/${P}?tab=${T}`)
  })

  it('carries a tab id the task no longer holds through all the same, the page falling back', async () => {
    holding(P)
    expect(locationOf(await visit(P, `?tab=${OTHER}`))).toBe(`/p/${P}/t/${P}?tab=${OTHER}`)
  })

  it('encodes a tab id it did not validate, so it cannot become a second query parameter', async () => {
    holding(P)
    expect(locationOf(await visit(P, '?tab=a%26b%3Dc'))).toBe(`/p/${P}/t/${P}?tab=a%26b%3Dc`)
  })

  it('treats a blank ?tab= as no tab at all, rather than naming an empty one', async () => {
    holding(P)
    expect(locationOf(await visit(P, '?tab='))).toBe(`/p/${P}/t/${P}`)
  })

  it('carries the same no-store as the plain address, both now depending on a read', async () => {
    holding(P)
    expect((await visit(P, `?tab=${T}`)).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('a project that cannot answer for that task is a project page, never a dead end', () => {
  it('falls back for a project holding no task of its own id, which is any not imported from legacy', async () => {
    holding(T)
    const response = await visit(P, `?tab=${T}`)
    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe(`/p/${P}`)
  })

  it('falls back for a project holding no tasks at all', async () => {
    holding()
    expect(locationOf(await visit(P))).toBe(`/p/${P}`)
  })

  it.each([[401], [403], [404], [409], [500]])(
    'falls back on a %i, leaving the remedy to the project page rather than answering it here',
    async (status) => {
      fake.projects.read.mockRejectedValue(problem(status))
      const response = await visit(P, `?tab=${T}`)
      expect(response.status).toBe(307)
      expect(locationOf(response)).toBe(`/p/${P}`)
    },
  )

  it('falls back when the API cannot be reached at all, rather than throwing into a 500', async () => {
    fake.projects.read.mockRejectedValue(new TypeError('fetch failed'))
    expect(locationOf(await visit(P, `?tab=${T}`))).toBe(`/p/${P}`)
  })

  it('falls back when this browser presents no admin session, so /login carries /p/<id>', async () => {
    signedIn = false
    const response = await visit(P, `?tab=${T}`)
    expect(locationOf(response)).toBe(`/p/${P}`)
    expect(fake.projects.read).not.toHaveBeenCalled()
  })
})

describe('the ids the redirect uses are the ids the importer preserves (spec §7.6)', () => {
  it.each([0, 1])('sends the legacy address of fixture %i to its own project id, twice over', async (index) => {
    const file = legacyFile(FIXTURES[index] ?? FIXTURES[0])
    fake.projects.read.mockResolvedValue(imported(file))
    expect(locationOf(await visit(file.id))).toBe(`/p/${file.id}/t/${file.id}`)
  })

  it.each([0, 1])('maps every tab of fixture %i onto that one task page, as its ?tab=', async (index) => {
    const file = legacyFile(FIXTURES[index] ?? FIXTURES[0])
    fake.projects.read.mockResolvedValue(imported(file))
    expect(file.tabs.length).toBeGreaterThan(0)
    for (const tab of file.tabs) {
      expect(locationOf(await visit(file.id, `?tab=${tab.id}`))).toBe(
        `/p/${file.id}/t/${file.id}?tab=${tab.id}`,
      )
    }
  })

  it('sends a legacy address whose project was imported as a copy to that project’s page', async () => {
    const file = legacyFile(FIXTURES[0])
    fake.projects.read.mockResolvedValue({ id: file.id, tasks: [{ id: OTHER }] })
    expect(locationOf(await visit(file.id, `?tab=${OTHER}`))).toBe(`/p/${file.id}`)
  })
})
