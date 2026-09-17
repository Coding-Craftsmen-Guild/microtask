import { describe, expect, it } from 'vitest'
import { ExportBundle } from '@repo/contracts'
import { Forbidden, type Principal } from '@repo/kernel'
import { STAMP } from '@repo/microtask-domain/testing'
import type { MemoryProjectStore } from '@repo/microtask-domain/testing'
import { createApp } from '../../app.js'
import { clearedDisposition, exportProject, exportWorkspace } from './export/handlers.js'
import {
  GUARDED_PREFIX,
  IDS,
  TOKENS,
  admin,
  asLink,
  body,
  buildApp,
  buildDeps,
} from '../../testing/harness.js'

const WORKSPACE = `${GUARDED_PREFIX}/export`
const PROJECT = `${GUARDED_PREFIX}/projects/${IDS.p1}/export`
const ABSENT = `${GUARDED_PREFIX}/projects/${IDS.missing}/export`

const EVERY_TOKEN = [
  TOKENS.p1View,
  TOKENS.p1Write,
  TOKENS.p1Manage,
  TOKENS.t1Manage,
  TOKENS.p2Manage,
]

const SEAT = { name: 'A seat', createdBy: null, createdAt: STAMP } as const

const P1_SEATS = [
  { ...SEAT, token: TOKENS.p1View, role: 'view', scope: { kind: 'project', projectId: IDS.p1 } },
  { ...SEAT, token: TOKENS.p1Write, role: 'write', scope: { kind: 'project', projectId: IDS.p1 } },
  { ...SEAT, token: TOKENS.p1Manage, role: 'manage', scope: { kind: 'project', projectId: IDS.p1 } },
  {
    ...SEAT,
    token: TOKENS.t1Manage,
    role: 'manage',
    scope: { kind: 'task', projectId: IDS.p1, taskId: IDS.t1 },
  },
]

const P2_SEATS = [
  { ...SEAT, token: TOKENS.p2Manage, role: 'manage', scope: { kind: 'project', projectId: IDS.p2 } },
]

interface Seat {
  readonly token: string
  readonly role: string
  readonly name: string
  readonly scope: unknown
}

interface Bundled {
  readonly id: string
  readonly shareLinks: readonly Seat[]
  readonly taskDocuments: readonly { readonly id: string }[]
}

const answered = async (
  path: string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> => {
  const response = await (await buildApp()).request(path, { headers })
  expect([path, response.status]).toEqual([path, 200])
  return body(response)
}

const refusal = async (path: string, headers: Record<string, string>): Promise<unknown[]> => {
  const response = await (await buildApp()).request(path, { headers })
  return [response.status, (await body(response))['code']]
}

const projects = (bundle: Record<string, unknown>): readonly Bundled[] =>
  bundle['projects'] as readonly Bundled[]

const project = (bundle: Record<string, unknown>, id: string): Bundled | undefined =>
  projects(bundle).find((one) => one.id === id)

const seatsOf = (bundle: Record<string, unknown>, id: string): readonly Seat[] | undefined =>
  project(bundle, id)?.shareLinks

const withUnreadableTask = async (): Promise<Awaited<ReturnType<typeof buildApp>>> => {
  const deps = await buildDeps()
  ;(deps.store as MemoryProjectStore).putRawTask('microtask', IDS.p1, IDS.t1, '{ "id": "truncated"')
  return createApp(deps)
}

const conflict = async (path: string): Promise<Record<string, unknown>> => {
  const response = await (await withUnreadableTask()).request(path, { headers: admin() })
  expect([path, response.status]).toEqual([path, 409])
  return body(response)
}

describe('GET /v1/microtask/export', () => {
  it('answers the admin with every project in the product, each carrying its documents', async () => {
    const bundle = await answered(WORKSPACE, admin())
    expect(projects(bundle).map((one) => one.id).sort()).toEqual([IDS.p1, IDS.p2].sort())
    expect(project(bundle, IDS.p1)?.taskDocuments.map((one) => one.id).sort()).toEqual(
      [IDS.t1, IDS.t2, IDS.t3, IDS.t4].sort(),
    )
    expect(project(bundle, IDS.p2)?.taskDocuments).toEqual([])
  })

  it('answers a body that parses against the ExportBundle its route declares', async () => {
    const parsed = ExportBundle.safeParse(await answered(WORKSPACE, admin()))
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('refuses a project-scoped manage holder, a workspace export being admin authority', async () => {
    expect(await refusal(WORKSPACE, asLink(TOKENS.p1Manage))).toEqual([403, 'forbidden'])
  })

  it('refuses a tokens value it does not offer, rather than falling back to a disposition', async () => {
    const response = await (await buildApp()).request(`${WORKSPACE}?tokens=maybe`, {
      headers: admin(),
    })
    expect(response.status).toBe(422)
    expect(await body(response)).toMatchObject({ code: 'invalid', in: 'query' })
  })
})

describe('tokens=preserve carries every seat by value, for the admin who asks', () => {
  it('answers each project’s links with the token, role, scope and name the fixture holds', async () => {
    const bundle = await answered(`${WORKSPACE}?tokens=preserve`, admin())
    expect(seatsOf(bundle, IDS.p1)).toEqual(P1_SEATS)
    expect(seatsOf(bundle, IDS.p2)).toEqual(P2_SEATS)
  })

  it('answers the same links on the project route, which is the migration path itself', async () => {
    const bundle = await answered(`${PROJECT}?tokens=preserve`, admin())
    expect(seatsOf(bundle, IDS.p1)).toEqual(P1_SEATS)
  })
})

describe('stripping is what a request that names no disposition gets', () => {
  it('omits every link from a workspace export asking for nothing', async () => {
    const bundle = await answered(WORKSPACE, admin())
    expect(projects(bundle).map((one) => one.shareLinks)).toEqual([[], []])
  })

  it('leaves no token substring anywhere in that body', async () => {
    const text = JSON.stringify(await answered(WORKSPACE, admin()))
    for (const seat of EVERY_TOKEN) expect(text).not.toContain(seat)
  })

  it('omits them on the project route too, and with tokens=strip spelled out', async () => {
    const bundle = await answered(`${PROJECT}?tokens=strip`, admin())
    expect(seatsOf(bundle, IDS.p1)).toEqual([])
    expect(JSON.stringify(bundle)).not.toContain(TOKENS.p1View)
  })

  it('changes nothing else, so a stripped project differs from a preserved one only there', async () => {
    const stripped = project(await answered(PROJECT, admin()), IDS.p1)
    const preserved = project(await answered(`${PROJECT}?tokens=preserve`, admin()), IDS.p1)
    expect(stripped).toEqual({ ...preserved, shareLinks: [] })
  })
})

describe('GET /v1/microtask/projects/{projectId}/export', () => {
  it('answers the one project addressed and nothing else', async () => {
    const bundle = await answered(PROJECT, admin())
    expect(projects(bundle).map((one) => one.id)).toEqual([IDS.p1])
  })

  it('answers a project-scoped manage holder, that being what export:run grants', async () => {
    const bundle = await answered(PROJECT, asLink(TOKENS.p1Manage))
    expect(seatsOf(bundle, IDS.p1)).toEqual([])
  })

  it('refuses that same holder tokens=preserve, rather than quietly stripping a 200', async () => {
    expect(await refusal(`${PROJECT}?tokens=preserve`, asLink(TOKENS.p1Manage))).toEqual([
      403,
      'forbidden',
    ])
  })

  it('answers it the same 403 at the workspace address, which the admin-only gate produces there', async () => {
    const asking = await refusal(`${WORKSPACE}?tokens=preserve`, asLink(TOKENS.p1Manage))
    expect(asking).toEqual([403, 'forbidden'])
    expect(asking).toEqual(await refusal(WORKSPACE, asLink(TOKENS.p1Manage)))
  })

  it('discloses nothing by that refusal: the same holder already reads all four tokens', async () => {
    const read = await answered(`${GUARDED_PREFIX}/projects/${IDS.p1}`, asLink(TOKENS.p1Manage))
    expect((read['shareLinks'] as readonly Seat[]).map((one) => one.token)).toEqual(
      P1_SEATS.map((one) => one.token),
    )
  })

  it('refuses a view holder, export:run needing manage', async () => {
    expect(await refusal(PROJECT, asLink(TOKENS.p1View))).toEqual([403, 'forbidden'])
  })

  it('refuses a task-scoped manage holder, as share:read and share:revoke do', async () => {
    expect(await refusal(PROJECT, asLink(TOKENS.t1Manage))).toEqual([403, 'forbidden'])
  })

  it('refuses a manage holder scoped to the other project, so the refusal is the scope', async () => {
    expect(await refusal(PROJECT, asLink(TOKENS.p2Manage))).toEqual([403, 'forbidden'])
  })

  it('answers a project id naming nothing with the 404 every project route gives', async () => {
    expect(await refusal(ABSENT, admin())).toEqual([404, 'not_found'])
  })
})

describe('a manifest entry whose task file will not read is a 409', () => {
  it('refuses the workspace export, naming the project and the task', async () => {
    const problem = await conflict(WORKSPACE)
    expect(problem['code']).toBe('conflict')
    expect(problem['detail']).toContain(IDS.p1)
    expect(problem['detail']).toContain(IDS.t1)
  })

  it('refuses the project export the same way, and not with the 404 a missing id gets', async () => {
    const problem = await conflict(PROJECT)
    expect(problem['code']).toBe('conflict')
    expect(problem['detail']).toContain(IDS.t1)
  })
})

describe('the one condition that decides whether a response may carry live credentials', () => {
  const ADMIN: Principal = { kind: 'admin' }
  const LINK: Principal = {
    kind: 'link',
    role: 'manage',
    scope: { kind: 'project', projectId: IDS.p1 },
    token: TOKENS.p1Manage,
  }

  const refused = (principal: Principal): Error => {
    try {
      clearedDisposition(principal, 'preserve')
    } catch (error) {
      if (error instanceof Error) return error
      throw error
    }
    throw new Error('the disposition was cleared, so there is no refusal to inspect')
  }

  it('hands the admin the preserve it asked for', () => {
    expect(clearedDisposition(ADMIN, 'preserve')).toBe('preserve')
  })

  it('refuses a link holder that same preserve, which the workspace route cannot demonstrate', () => {
    const error = refused(LINK)
    expect(error).toBeInstanceOf(Forbidden)
    expect(error).toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('hands both of them strip untouched, so the refusal is the disposition and not the caller', () => {
    expect([clearedDisposition(ADMIN, 'strip'), clearedDisposition(LINK, 'strip')]).toEqual([
      'strip',
      'strip',
    ])
  })
})

describe('both export handlers run that condition, and each body says so for itself', () => {
  const CALLS_BUNDLER = /bundle[A-Za-z]*\)?\(/u

  const bundlerCall = (source: string): string =>
    source.split('\n').find((line) => CALLS_BUNDLER.test(line)) ?? ''

  const disposed = (source: string): boolean =>
    bundlerCall(source).includes('clearedDisposition(principal, tokens)')

  it('reads the condition’s own result off the line that calls the bundler, in both handlers', async () => {
    const ctx = await buildDeps()
    expect([
      disposed(String(exportWorkspace(ctx))),
      disposed(String(exportProject(ctx))),
    ]).toEqual([true, true])
  })

  it('refuses a body that calls it and discards the answer, which a substring check cannot tell apart', () => {
    const discarded = [
      'async (c) => {',
      '  clearedDisposition(principal, tokens);',
      '  return c.json(await bundleWorkspace(ctx, PRODUCT, tokens), 200);',
      '}',
    ].join('\n')
    expect(discarded.includes('clearedDisposition(')).toBe(true)
    expect(disposed(discarded)).toBe(false)
  })
})
