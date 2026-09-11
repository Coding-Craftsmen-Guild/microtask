import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, problem, Redirected, redirectOf, ulid, type FakeAdmin } from './testing/fake-admin'

let fake: FakeAdmin
const refresh = vi.fn()

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(asClient(fake)) }))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createShareLink, listShareLinks, revokeShareLink, updateShareLink } = await import('./share-links')

const P = ulid(1)
const T = ulid(2)
const TOKEN = 'tok_AAAAAAAAAAAAAAAAAAAAAAAA'
const link = (overrides: Record<string, unknown> = {}) => ({
  token: TOKEN,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'task', projectId: P, taskId: T },
  createdBy: null,
  createdAt: '2026-09-11T10:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  fake = fakeAdmin()
  refresh.mockReset()
})

describe('listShareLinks', () => {
  it('answers the links of the project, and refreshes nothing', async () => {
    fake.shareLinks.list.mockResolvedValue({ shareLinks: [link()] })
    expect(await listShareLinks(P)).toEqual({ ok: true, value: [link()] })
    expect(fake.shareLinks.list).toHaveBeenCalledWith(P)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reports a refusal rather than an empty list', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(403, 'Not allowed'))
    expect(await listShareLinks(P)).toEqual({ ok: false, status: 403, detail: 'Not allowed' })
  })

  it('sends an expired session to sign in, back to this project', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(401))
    expect(await redirectOf(listShareLinks(P))).toBe(`/login?next=%2Fp%2F${P}`)
  })
})

describe('createShareLink', () => {
  it('mints the seat asked for and answers it, token and all', async () => {
    const seat = { name: 'Jane', role: 'write', scope: { kind: 'task', projectId: P, taskId: T } } as const
    fake.shareLinks.create.mockResolvedValue(link({ name: 'Jane', role: 'write' }))
    const result = await createShareLink(P, seat)
    expect(result).toEqual({ ok: true, value: link({ name: 'Jane', role: 'write' }) })
    expect(fake.shareLinks.create).toHaveBeenCalledWith(P, seat)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports the cap the API hit', async () => {
    fake.shareLinks.create.mockRejectedValue(problem(422, 'Too many share links'))
    const seat = { name: 'x', role: 'view', scope: { kind: 'project', projectId: P } } as const
    expect(await createShareLink(P, seat)).toEqual({ ok: false, status: 422, detail: 'Too many share links' })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('updateShareLink', () => {
  it('patches the same token and answers the link with that token', async () => {
    fake.shareLinks.update.mockResolvedValue(link({ name: '' }))
    const result = await updateShareLink(P, TOKEN, { name: '' })
    expect(result).toEqual({ ok: true, value: link({ name: '' }) })
    expect(fake.shareLinks.update).toHaveBeenCalledWith(P, TOKEN, { name: '' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('forwards a role change and nothing else the browser put beside it', async () => {
    fake.shareLinks.update.mockResolvedValue(link({ role: 'view' }))
    const hostile = { role: 'view', scope: { kind: 'project', projectId: P }, token: 'other' }
    await updateShareLink(P, TOKEN, hostile as never)
    expect(fake.shareLinks.update).toHaveBeenCalledWith(P, TOKEN, { role: 'view' })
  })
})

describe('revokeShareLink', () => {
  it('answers every link the revocation took, the cascade included', async () => {
    const child = link({ token: 'tok_BBBBBBBBBBBBBBBBBBBBBBBB', createdBy: TOKEN })
    fake.shareLinks.revoke.mockResolvedValue({ revoked: [link(), child] })
    expect(await revokeShareLink(P, TOKEN)).toEqual({ ok: true, value: [link(), child] })
    expect(fake.shareLinks.revoke).toHaveBeenCalledWith(P, TOKEN)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports a link already gone', async () => {
    fake.shareLinks.revoke.mockRejectedValue(problem(404, 'Share link not found'))
    expect(await revokeShareLink(P, TOKEN)).toEqual({ ok: false, status: 404, detail: 'Share link not found' })
  })
})
