import type { AdminClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { STALE_ORDER } from './permutation'
import { problem, Redirected, redirectOf, ulid } from './testing/fake-admin'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'

type AnyCall = Mock<(...args: never[]) => Promise<unknown>>

interface FakeTabsClient {
  readonly tabs: Record<'create' | 'rename' | 'remove' | 'reorder', AnyCall>
  readonly tasks: Record<'read', AnyCall>
}

let fake: FakeTabsClient
let signedIn = true

vi.mock('../lib/api', () => ({
  apiForSession: () => Promise.resolve(signedIn ? (fake as unknown as AdminClient) : null),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createTab, deleteTab, renameTab, reorderTabs } = await import('./tabs')

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
  signedIn = true
  fake = {
    tabs: { create: vi.fn(), rename: vi.fn(), remove: vi.fn(), reorder: vi.fn() },
    tasks: { read: vi.fn() },
  }
  fake.tasks.read.mockResolvedValue({ id: T, tabs: [tab(A, 0), tab(B, 1), tab(C, 2)] })
})

describe('createTab', () => {
  it('creates the tab in the task named and answers it, so the page can open it', async () => {
    fake.tabs.create.mockResolvedValue(tab(C, 2))
    expect(await createTab(TASK, 'Client tasks')).toEqual({ ok: true, value: tab(C, 2) })
    expect(fake.tabs.create).toHaveBeenCalledWith(TASK, 'Client tasks')
  })

  it('answers the API’s refusal as a failure the page can show', async () => {
    fake.tabs.create.mockRejectedValue(problem(422, 'Too many tabs'))
    expect(await createTab(TASK, 'x')).toEqual({ ok: false, status: 422, detail: plainRefusal(422, ACTION_REFUSALS.admin) })
  })
})

describe('renameTab', () => {
  it('renames the tab named and answers the tab the server stored, stamp included', async () => {
    const renamed = { ...tab(B, 1), name: 'DNS cutover', updatedAt: 'S2' }
    fake.tabs.rename.mockResolvedValue(renamed)
    expect(await renameTab({ ...TASK, tabId: B }, ' DNS  cutover ')).toEqual({ ok: true, value: renamed })
    expect(fake.tabs.rename).toHaveBeenCalledWith({ ...TASK, tabId: B }, ' DNS  cutover ')
  })
})

describe('deleteTab', () => {
  it('deletes the tab named', async () => {
    fake.tabs.remove.mockResolvedValue(undefined)
    expect(await deleteTab({ ...TASK, tabId: B })).toEqual({ ok: true, value: null })
    expect(fake.tabs.remove).toHaveBeenCalledWith({ ...TASK, tabId: B })
  })

  it('answers the refusal of a task’s last tab as a failure', async () => {
    fake.tabs.remove.mockRejectedValue(problem(422, 'A task must keep at least one tab'))
    expect(await deleteTab({ ...TASK, tabId: A })).toEqual({
      ok: false,
      status: 422,
      detail: plainRefusal(422, ACTION_REFUSALS.admin),
    })
  })
})

describe('reorderTabs', () => {
  it('sends a permutation of the task’s tabs and answers the tabs in their new order', async () => {
    const ordered = [tab(B, 0), tab(A, 1), tab(C, 2)]
    fake.tabs.reorder.mockResolvedValue({ tabs: ordered })
    expect(await reorderTabs(TASK, [B, A, C])).toEqual({ ok: true, value: ordered })
    expect(fake.tabs.reorder).toHaveBeenCalledWith(TASK, [B, A, C])
  })

  it('checks the order against a fresh read of that task, not against the page', async () => {
    fake.tabs.reorder.mockResolvedValue({ tabs: [] })
    await reorderTabs(TASK, [B, A, C])
    expect(fake.tasks.read).toHaveBeenCalledWith(TASK)
  })

  it.each([
    ['partial', [B, A]],
    ['duplicated', [B, A, A]],
    ['padded with a stranger', [B, A, C, ulid(20)]],
    ['a stranger in place of a tab', [B, A, ulid(20)]],
  ])('refuses a %s order before it reaches the API', async (_name, order) => {
    expect(await reorderTabs(TASK, order)).toEqual({ ok: false, status: 409, detail: STALE_ORDER })
    expect(fake.tabs.reorder).not.toHaveBeenCalled()
  })
})

describe('authority', () => {
  it('sends an admin whose session the API refuses to sign in, back to this task', async () => {
    fake.tabs.create.mockRejectedValue(problem(401, 'expired'))
    expect(await redirectOf(createTab(TASK, 'x'))).toBe(`/login?next=${encodeURIComponent(`/p/${P}/t/${T}`)}`)
  })

  it.each([
    ['createTab', () => createTab(TASK, 'x'), () => fake.tabs.create],
    ['renameTab', () => renameTab({ ...TASK, tabId: A }, 'x'), () => fake.tabs.rename],
    ['deleteTab', () => deleteTab({ ...TASK, tabId: A }), () => fake.tabs.remove],
    ['reorderTabs', () => reorderTabs(TASK, [A, B, C]), () => fake.tabs.reorder],
  ] as const)('%s sends an admin the API refuses back to this task after signing in', async (_name, run, call) => {
    call().mockRejectedValue(problem(401, 'expired'))
    expect(await redirectOf(run())).toBe(`/login?next=${encodeURIComponent(`/p/${P}/t/${T}`)}`)
  })

  it('sends a browser with no admin session to sign in without calling the API', async () => {
    signedIn = false
    expect(await redirectOf(deleteTab({ ...TASK, tabId: A }))).toBe(
      `/login?next=${encodeURIComponent(`/p/${P}/t/${T}`)}`,
    )
    expect(fake.tabs.remove).not.toHaveBeenCalled()
  })
})
