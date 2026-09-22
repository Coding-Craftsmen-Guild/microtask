import type { Clock, ProjectScope, Role } from '@repo/kernel'
import type { ProjectManifest, ShareLink } from '@repo/microtask-domain'
import { ShareIndex } from '@repo/microtask-domain'
import { MemoryProjectStore, manifest, STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { AdminVerifier } from './admin-verifier.js'
import { PrincipalResolver } from './principal-resolver.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAR'
const TASK = '01M240ERCRWWCN16Q5AHP1FZB1'

const P1_VIEW = 'shr_p1_view_seat_token'
const P1_MANAGE = 'shr_p1_manage_seat_tok'
const P1_TASK = 'shr_p1_taskscoped_tok'
const P2_VIEW = 'shr_p2_view_seat_token'
const UNKNOWN = 'shr_never_minted_token'

const clock: Clock = { now: () => STAMP }

const link = (token: string, role: Role, scope: ProjectScope): ShareLink => ({
  token,
  name: 'A seat',
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const project = (id: string, links: readonly ShareLink[]): ProjectManifest =>
  manifest(id, { shareLinks: links })

interface World {
  readonly store: MemoryProjectStore
  readonly tokens: ShareIndex
  readonly resolver: PrincipalResolver
  readonly verifier: AdminVerifier
  save: (m: ProjectManifest) => Promise<void>
}

const world = async (): Promise<World> => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const verifier = new AdminVerifier({
    config: {
      sessionSecret: 'session-secret-of-at-least-32-chars!',
      adminTokenTtlSeconds: 3600,
      adminPassword: 'correct horse battery staple',
    },
    clock,
  })
  const save = async (m: ProjectManifest): Promise<void> => {
    await store.saveManifest('microtask', m)
    tokens.add('microtask', m)
  }
  await save(
    project(P1, [
      link(P1_VIEW, 'view', { kind: 'project', projectId: P1 }),
      link(P1_MANAGE, 'manage', { kind: 'project', projectId: P1 }),
      link(P1_TASK, 'write', { kind: 'task', projectId: P1, taskId: TASK }),
    ]),
  )
  await save(project(P2, [link(P2_VIEW, 'view', { kind: 'project', projectId: P2 })]))
  return {
    store,
    tokens,
    verifier,
    save,
    resolver: new PrincipalResolver({ admin: verifier, tokens, store }),
  }
}

describe('PrincipalResolver', () => {
  it('resolves an admin token this API minted to the admin principal', async () => {
    const { resolver, verifier } = await world()
    expect(await resolver.resolve(verifier.issue().token)).toEqual({ kind: 'admin' })
  })

  it('resolves a share token to a link principal carrying the role and scope the manifest records', async () => {
    const { resolver } = await world()
    expect(await resolver.resolve(P1_VIEW)).toEqual({
      kind: 'link',
      role: 'view',
      scope: { kind: 'project', projectId: P1 },
      token: P1_VIEW,
    })
  })

  it('carries a task scope through unchanged, so the policy sees the narrow scope not the project', async () => {
    const { resolver } = await world()
    expect(await resolver.resolve(P1_TASK)).toEqual({
      kind: 'link',
      role: 'write',
      scope: { kind: 'task', projectId: P1, taskId: TASK },
      token: P1_TASK,
    })
  })

  it('resolves a token belonging to a different project against that project, not the first one', async () => {
    const { resolver } = await world()
    expect(await resolver.resolve(P2_VIEW)).toMatchObject({
      scope: { kind: 'project', projectId: P2 },
    })
  })

  it('resolves nothing for a token no project has ever held', async () => {
    const { resolver } = await world()
    expect(await resolver.resolve(UNKNOWN)).toBeNull()
  })

  it('resolves nothing for the empty string', async () => {
    const { resolver } = await world()
    expect(await resolver.resolve('')).toBeNull()
  })

  it('re-reads the role from the manifest on every call, so a downgrade takes effect at once', async () => {
    const { resolver, save } = await world()
    expect(await resolver.resolve(P1_MANAGE)).toMatchObject({ role: 'manage' })
    await save(
      project(P1, [
        link(P1_VIEW, 'view', { kind: 'project', projectId: P1 }),
        link(P1_MANAGE, 'view', { kind: 'project', projectId: P1 }),
        link(P1_TASK, 'write', { kind: 'task', projectId: P1, taskId: TASK }),
      ]),
    )
    expect(await resolver.resolve(P1_MANAGE)).toMatchObject({ role: 'view' })
  })

  it('resolves nothing once the link is revoked, even while the index still names the project', async () => {
    const { resolver, store, tokens } = await world()
    await store.saveManifest('microtask', project(P1, []))
    expect(tokens.find(P1_VIEW)).not.toBeNull()
    expect(await resolver.resolve(P1_VIEW)).toBeNull()
  })

  it('resolves nothing once the project itself is gone', async () => {
    const { resolver, store } = await world()
    await store.deleteProject('microtask', P1)
    expect(await resolver.resolve(P1_VIEW)).toBeNull()
  })

  it('checks the admin token before the share index, so a share token is never mistaken for admin', async () => {
    const { resolver, verifier } = await world()
    const admin = verifier.issue().token
    expect(await resolver.resolve(admin)).toEqual({ kind: 'admin' })
    expect(await resolver.resolve(P1_VIEW)).toMatchObject({ kind: 'link' })
  })

  it('resolves nothing for an expired admin token rather than falling back to a share lookup', async () => {
    const { store, tokens } = await world()
    let at = Date.parse(STAMP)
    const moving: Clock = { now: () => new Date(at).toISOString() }
    const verifier = new AdminVerifier({
      config: {
        sessionSecret: 'session-secret-of-at-least-32-chars!',
        adminTokenTtlSeconds: 60,
        adminPassword: 'correct horse battery staple',
      },
      clock: moving,
    })
    const resolver = new PrincipalResolver({ admin: verifier, tokens, store })
    const token = verifier.issue().token
    at += 61_000
    expect(await resolver.resolve(token)).toBeNull()
  })
})
