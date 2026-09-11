import type { LinkClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import { fakeAdmin, problem, Redirected, redirectOf, ulid, type FakeAdmin } from './testing/fake-admin'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'

let fake: FakeAdmin
const presented: string[] = []
const refresh = vi.fn()

vi.mock('../lib/api', () => ({
  apiForLink: (token: string) => {
    presented.push(token)
    return fake as unknown as LinkClient
  },
  apiForSession: () => {
    throw new Error('a link action must never ask for the admin session')
  },
}))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createLinkShareLink, listLinkShareLinks, revokeLinkShareLink, updateLinkShareLink } = await import(
  './link-share-links'
)

const P = ulid(1)
const T = ulid(2)
const MINE = 'tok_MANAGERMANAGERMANAGER'
const THEIRS = 'tok_CLIENTCLIENTCLIENTCLI'
const link = (overrides: Record<string, unknown> = {}) => ({
  token: THEIRS,
  name: 'Jane at ACME',
  role: 'view',
  scope: { kind: 'task', projectId: P, taskId: T },
  createdBy: MINE,
  createdAt: '2026-09-11T10:00:00.000Z',
  ...overrides,
})

beforeEach(() => {
  fake = fakeAdmin()
  presented.length = 0
  refresh.mockReset()
})

describe('listLinkShareLinks', () => {
  it('lists through the caller’s own token, and refreshes nothing', async () => {
    fake.shareLinks.list.mockResolvedValue({ shareLinks: [link()] })
    expect(await listLinkShareLinks(MINE, P, null)).toEqual({ ok: true, value: [link()] })
    expect(presented).toEqual([MINE])
    expect(fake.shareLinks.list).toHaveBeenCalledWith(P)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('narrows to the task asked about on the server, so no other token leaves it', async () => {
    const other = link({ token: 'tok_OTHEROTHEROTHEROTHER', scope: { kind: 'task', projectId: P, taskId: ulid(3) } })
    const whole = link({ token: 'tok_WHOLEWHOLEWHOLEWHOLE', scope: { kind: 'project', projectId: P } })
    fake.shareLinks.list.mockResolvedValue({ shareLinks: [other, link(), whole] })
    expect(await listLinkShareLinks(MINE, P, T)).toEqual({ ok: true, value: [link()] })
  })

  it('reports the 403 a task-scoped manage link gets rather than an empty list', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(403, 'Not permitted: share:read'))
    expect(await listLinkShareLinks(MINE, P, T)).toEqual({ ok: false, status: 403, detail: plainRefusal(403, ACTION_REFUSALS.link) })
  })

  it('sends a revoked caller to the terminal page', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(401))
    expect(await redirectOf(listLinkShareLinks(MINE, P, null))).toBe(LINK_UNAVAILABLE_PATH)
  })
})

describe('the writes', () => {
  it('mints through the caller’s token and refreshes the page', async () => {
    const seat = { name: 'Bob', role: 'view' as const, taskId: T }
    fake.shareLinks.create.mockResolvedValue(link())
    expect(await createLinkShareLink(MINE, P, seat)).toEqual({ ok: true, value: link() })
    expect(presented).toEqual([MINE])
    expect(fake.shareLinks.create).toHaveBeenCalledWith(P, seat)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('changes the link named, through the caller’s token, forwarding only name and role', async () => {
    fake.shareLinks.update.mockResolvedValue(link({ role: 'write' }))
    const sent = { role: 'write', scope: { kind: 'project', projectId: P }, token: 'tok_FORGEDFORGEDFORGEDF' }
    await updateLinkShareLink(MINE, P, THEIRS, sent as never)
    expect(presented).toEqual([MINE])
    expect(fake.shareLinks.update).toHaveBeenCalledWith(P, THEIRS, { role: 'write' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('forwards a rename to blank, which production data already holds', async () => {
    fake.shareLinks.update.mockResolvedValue(link({ name: '' }))
    await updateLinkShareLink(MINE, P, THEIRS, { name: '' })
    expect(fake.shareLinks.update).toHaveBeenCalledWith(P, THEIRS, { name: '' })
  })

  it('revokes the link named through the caller’s token and answers the whole set', async () => {
    fake.shareLinks.revoke.mockResolvedValue({ revoked: [link()] })
    expect(await revokeLinkShareLink(MINE, P, THEIRS)).toEqual({ ok: true, value: [link()] })
    expect(presented).toEqual([MINE])
    expect(fake.shareLinks.revoke).toHaveBeenCalledWith(P, THEIRS)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['create', () => createLinkShareLink(MINE, P, { name: 'x', role: 'view', taskId: T })],
    ['update', () => updateLinkShareLink(MINE, P, THEIRS, { name: 'x' })],
    ['revoke', () => revokeLinkShareLink(MINE, P, THEIRS)],
  ])('refreshes nothing when a %s is refused', async (_label, attempt) => {
    fake.shareLinks.create.mockRejectedValue(problem(403))
    fake.shareLinks.update.mockRejectedValue(problem(403))
    fake.shareLinks.revoke.mockRejectedValue(problem(403))
    expect(await attempt()).toMatchObject({ ok: false, status: 403 })
    expect(refresh).not.toHaveBeenCalled()
  })
})
