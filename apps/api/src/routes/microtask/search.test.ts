import { can, type Principal, type Scope } from '@repo/kernel'
import { describe, expect, it } from 'vitest'
import { GUARDED_PREFIX, IDS, TOKENS, admin, asLink, body, buildApp } from '../../testing/harness.js'
import { searchGate } from './search/handlers.js'

const SEARCH = `${GUARDED_PREFIX}/search`

interface Row {
  readonly kind: string
  readonly projectId: string
  readonly name: string
}

const rows = async (headers: Record<string, string>, query = 'h'): Promise<readonly Row[]> => {
  const response = await (await buildApp()).request(`${SEARCH}?q=${query}`, { headers })
  expect(response.status).toBe(200)
  return (await body(response))['results'] as Row[]
}

const named = (found: readonly Row[]): string[] => found.map((one) => one.name).sort()

describe('GET /v1/microtask/search', () => {
  it('matches names across every project for the admin', async () => {
    expect(named(await rows(admin()))).toEqual(
      ['Archive', 'Draft the brief', 'Launch', 'Other', 'Ship it', 'Write the spec'].sort(),
    )
  })

  it('matches a project, a folder and a task, each carrying enough to fetch it', async () => {
    const found = await rows(admin())
    expect(found.filter((one) => one.kind === 'project').map((one) => one.projectId).sort()).toEqual(
      [IDS.p1, IDS.p2].sort(),
    )
    expect(found.some((one) => one.kind === 'folder')).toBe(true)
    expect(found.some((one) => one.kind === 'task')).toBe(true)
  })

  it('answers a project-scoped link, rather than refusing it an admin-only action', async () => {
    const response = await (await buildApp()).request(`${SEARCH}?q=h`, {
      headers: asLink(TOKENS.p1View),
    })
    expect(response.status).toBe(200)
  })

  it('keeps another project’s names out of a project-scoped link’s results', async () => {
    const found = await rows(asLink(TOKENS.p1View))
    expect(named(found)).toEqual(['Archive', 'Draft the brief', 'Launch', 'Ship it', 'Write the spec'])
    expect(found.every((one) => one.projectId === IDS.p1)).toBe(true)
  })

  it('gives a task-scoped link its own task and its project, and no folder or sibling', async () => {
    expect(named(await rows(asLink(TOKENS.t1Manage)))).toEqual(['Launch', 'Write the spec'])
  })

  it('gives a link scoped to the other project only that project’s names', async () => {
    expect(named(await rows(asLink(TOKENS.p2Manage)))).toEqual(['Other'])
  })

  it('answers a term that reduces to nothing with no rows rather than with everything', async () => {
    expect(await rows(admin(), '%20%20')).toEqual([])
  })

  it('answers an empty term the same way, so two spellings of nothing do not differ', async () => {
    expect(await rows(admin(), '')).toEqual([])
  })

  it('refuses a request that names no term at all', async () => {
    const response = await (await buildApp()).request(SEARCH, { headers: admin() })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid', in: 'query' })
  })

  it('refuses a term longer than any name could be', async () => {
    const response = await (await buildApp()).request(`${SEARCH}?q=${'x'.repeat(81)}`, {
      headers: admin(),
    })
    expect(response.status).toBe(422)
  })
})

describe('what the search gate asks the policy, per principal (ADR 0009)', () => {
  const link = (scope: Scope): Principal => ({
    kind: 'link',
    role: 'view',
    scope,
    token: TOKENS.p1View,
  })

  const projectLink = link({ kind: 'project', projectId: IDS.p1 })
  const taskLink = link({ kind: 'task', projectId: IDS.p1, taskId: IDS.t1 })
  const adminPrincipal: Principal = { kind: 'admin' }

  it('asks the admin for workspace:search on the workspace', () => {
    expect(searchGate(adminPrincipal)).toEqual({
      action: 'workspace:search',
      target: { kind: 'workspace' },
    })
  })

  it('asks a project-scoped link for project:read on its own project', () => {
    expect(searchGate(projectLink)).toEqual({
      action: 'project:read',
      target: { kind: 'project', projectId: IDS.p1 },
    })
  })

  it('asks a task-scoped link for task:read on its own task', () => {
    expect(searchGate(taskLink)).toEqual({
      action: 'task:read',
      target: { kind: 'task', projectId: IDS.p1, taskId: IDS.t1 },
    })
  })

  it('asks a question the policy answers yes to for every principal kind', () => {
    for (const principal of [adminPrincipal, projectLink, taskLink]) {
      const { action, target } = searchGate(principal)
      expect({ principal: principal.kind, allowed: can(principal, action, target) }).toEqual({
        principal: principal.kind,
        allowed: true,
      })
    }
  })

  it('would refuse both link kinds if it asked the admin-only action instead', () => {
    for (const principal of [projectLink, taskLink]) {
      expect(can(principal, 'workspace:search', { kind: 'workspace' })).toBe(false)
    }
  })
})
