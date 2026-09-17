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

/** The project §7.6 converts a legacy file into, as `projects.read` would answer it. */
const imported = (file: LegacyFile): object => ({ id: file.id, tasks: file.tabs.map((tab) => ({ id: tab.id })) })

const holding = (...taskIds: readonly string[]): void => {
  fake.projects.read.mockResolvedValue({ id: P, tasks: taskIds.map((id) => ({ id })) })
}

beforeEach(() => {
  fake = fakeAdmin()
  signedIn = true
})

describe('GET /admin/projects/<projectId>, the legacy admin address (parity route R3)', () => {
  it('answers 308 to /p/<projectId>, the mapping §7.6 makes permanent by preserving project ids', async () => {
    const response = await visit(P)
    expect(response.status).toBe(308)
    expect(locationOf(response)).toBe(`/p/${P}`)
  })

  it('reads nothing to answer an address with no ?tab=, that target depending on no data', async () => {
    await visit(P)
    expect(fake.projects.read).not.toHaveBeenCalled()
  })

  it('answers a path rather than an absolute URL, so it names no host the proxy did not', async () => {
    expect(locationOf(await visit(P))?.startsWith('/p/')).toBe(true)
  })

  it('encodes the segment it did not validate, so it cannot become a second path segment', async () => {
    expect(locationOf(await visit('a/../p'))).toBe('/p/a%2F..%2Fp')
  })

  it('keeps an admin-gated answer out of every shared cache', async () => {
    expect((await visit(P)).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('a legacy ?tab=, which is now a task id (spec §7.6, Task 3)', () => {
  it('maps onto /p/<projectId>/t/<tabId>, the task that tab became', async () => {
    holding(T)
    const response = await visit(P, `?tab=${T}`)
    expect(locationOf(response)).toBe(`/p/${P}/t/${T}`)
    expect(fake.projects.read).toHaveBeenCalledWith(P)
  })

  it('is answered 307 and never 308, the target having been chosen from data that can change', async () => {
    holding(T)
    expect((await visit(P, `?tab=${T}`)).status).toBe(307)
  })

  it('drops every query parameter, the consumed ?tab= included, so the target names no tab', async () => {
    holding(T)
    expect(locationOf(await visit(P, `?tab=${T}&foo=bar`))).toBe(`/p/${P}/t/${T}`)
  })

  it('carries the same no-store as the plain address, the target now depending on a read', async () => {
    holding(T)
    expect((await visit(P, `?tab=${T}`)).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('a ?tab= the project cannot answer for is a project page, never a dead end', () => {
  it('falls back when ?tab= names a tab this project does not hold', async () => {
    holding(T)
    const response = await visit(P, `?tab=${OTHER}`)
    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe(`/p/${P}`)
  })

  it('falls back for a project holding no tasks at all', async () => {
    holding()
    expect(locationOf(await visit(P, `?tab=${T}`))).toBe(`/p/${P}`)
  })

  it('treats a blank ?tab= as no tab at all, and reads nothing for it', async () => {
    const response = await visit(P, '?tab=')
    expect(response.status).toBe(308)
    expect(locationOf(response)).toBe(`/p/${P}`)
    expect(fake.projects.read).not.toHaveBeenCalled()
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
  it.each([0, 1])('sends the legacy address of fixture %i to its own project id', async (index) => {
    const file = legacyFile(FIXTURES[index] ?? FIXTURES[0])
    expect(locationOf(await visit(file.id))).toBe(`/p/${file.id}`)
  })

  it.each([0, 1])('maps every tab of fixture %i onto the task page of its own id', async (index) => {
    const file = legacyFile(FIXTURES[index] ?? FIXTURES[0])
    fake.projects.read.mockResolvedValue(imported(file))
    expect(file.tabs.length).toBeGreaterThan(0)
    for (const tab of file.tabs) {
      expect(locationOf(await visit(file.id, `?tab=${tab.id}`))).toBe(`/p/${file.id}/t/${tab.id}`)
    }
  })

  it('sends a tab id no converted project carries to that project’s page', async () => {
    const file = legacyFile(FIXTURES[0])
    fake.projects.read.mockResolvedValue(imported(file))
    expect(locationOf(await visit(file.id, `?tab=${OTHER}`))).toBe(`/p/${file.id}`)
  })
})
