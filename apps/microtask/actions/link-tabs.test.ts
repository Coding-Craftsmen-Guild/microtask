import type { LinkClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import { STALE_ORDER } from './permutation'
import { problem, Redirected, redirectOf, ulid } from './testing/fake-admin'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'

type AnyCall = Mock<(...args: never[]) => Promise<unknown>>

interface FakeTabsClient {
  readonly credential: 'link'
  readonly tabs: Record<'create' | 'rename' | 'remove' | 'reorder', AnyCall>
  readonly tasks: Record<'read', AnyCall>
}

let fake: FakeTabsClient
const presented: string[] = []

vi.mock('../lib/api', () => ({
  apiForLink: (token: string) => {
    presented.push(token)
    return token.startsWith('tok_') ? (fake as unknown as LinkClient) : null
  },
  apiForSession: () => {
    throw new Error('a link action must never ask for the admin session')
  },
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createLinkTab, deleteLinkTab, renameLinkTab, reorderLinkTabs } = await import('./link-tabs')

const TOKEN = 'tok_CLIENTSOWNTOKEN_0001'
const P = ulid(1)
const T = ulid(2)
const [A, B, C] = [ulid(10), ulid(11), ulid(12)]
const TASK = { projectId: P, taskId: T }
const tab = (id: string, position = 0) => ({
  id,
  name: id,
  position,
  document: { type: 'doc', content: [] },
  createdAt: 'S0',
  updatedAt: 'S1',
})

beforeEach(() => {
  presented.length = 0
  fake = {
    credential: 'link',
    tabs: { create: vi.fn(), rename: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
    tasks: { read: vi.fn() },
  }
  fake.tasks.read.mockResolvedValue({ id: T, tabs: [tab(A, 0), tab(B, 1), tab(C, 2)] })
})

describe('every link tab action presents the token it was handed, and no other authority', () => {
  it('creates the tab through that token and answers it', async () => {
    fake.tabs.create.mockResolvedValue(tab(C, 2))
    expect(await createLinkTab(TOKEN, TASK, 'Client notes')).toEqual({ ok: true, value: tab(C, 2) })
    expect(presented).toEqual([TOKEN])
    expect(fake.tabs.create).toHaveBeenCalledWith(TASK, 'Client notes')
  })

  it('renames through that token and answers the stored tab, stamp included', async () => {
    const renamed = { ...tab(B, 1), name: 'DNS', updatedAt: 'S2' }
    fake.tabs.rename.mockResolvedValue(renamed)
    expect(await renameLinkTab(TOKEN, { ...TASK, tabId: B }, 'DNS')).toEqual({ ok: true, value: renamed })
    expect(presented).toEqual([TOKEN])
    expect(fake.tabs.rename).toHaveBeenCalledWith({ ...TASK, tabId: B }, 'DNS')
  })

  it('deletes through that token', async () => {
    fake.tabs.remove.mockResolvedValue(undefined)
    expect(await deleteLinkTab(TOKEN, { ...TASK, tabId: B })).toEqual({ ok: true, value: null })
    expect(presented).toEqual([TOKEN])
    expect(fake.tabs.remove).toHaveBeenCalledWith({ ...TASK, tabId: B })
  })

  it('reorders through that token once the order names every tab exactly once', async () => {
    fake.tabs.reorder.mockResolvedValue({ tabs: [tab(C, 0), tab(A, 1), tab(B, 2)] })
    expect(await reorderLinkTabs(TOKEN, TASK, [C, A, B])).toEqual({ ok: true, value: [tab(C, 0), tab(A, 1), tab(B, 2)] })
    expect(presented).toEqual([TOKEN])
    expect(fake.tabs.reorder).toHaveBeenCalledWith(TASK, [C, A, B])
  })
})

describe('what the API refuses a link comes back to be shown', () => {
  it('answers the 403 a write link gets for a delete, rather than an empty success', async () => {
    fake.tabs.remove.mockRejectedValue(problem(403, 'Not permitted: tab:delete'))
    expect(await deleteLinkTab(TOKEN, { ...TASK, tabId: B })).toEqual({ ok: false, status: 403, detail: plainRefusal(403, ACTION_REFUSALS.link) })
  })

  it('answers the 403 a view link gets for a create', async () => {
    fake.tabs.create.mockRejectedValue(problem(403, 'Not permitted: tab:create'))
    expect(await createLinkTab(TOKEN, TASK, 'x')).toMatchObject({ ok: false, status: 403 })
  })

  it('refuses a stale order before sending it', async () => {
    expect(await reorderLinkTabs(TOKEN, TASK, [B, A])).toEqual({ ok: false, status: 409, detail: STALE_ORDER })
    expect(fake.tabs.reorder).not.toHaveBeenCalled()
  })

  it('sends a revoked link to the terminal page, never to /login', async () => {
    fake.tabs.rename.mockRejectedValue(problem(401))
    expect(await redirectOf(renameLinkTab(TOKEN, { ...TASK, tabId: A }, 'x'))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('sends a token that cannot be one to the terminal page with no request', async () => {
    expect(await redirectOf(createLinkTab('forged', TASK, 'x'))).toBe(LINK_UNAVAILABLE_PATH)
    expect(fake.tabs.create).not.toHaveBeenCalled()
  })
})
