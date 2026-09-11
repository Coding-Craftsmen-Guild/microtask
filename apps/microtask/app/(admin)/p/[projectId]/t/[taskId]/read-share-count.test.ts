import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asClient,
  fakeAdmin,
  problem,
  Redirected,
  redirectOf,
  ulid,
  type FakeAdmin,
} from '../../../../../../actions/testing/fake-admin'

let fake: FakeAdmin

vi.mock('../../../../../../lib/api', () => ({ apiForSession: () => Promise.resolve(asClient(fake)) }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { readShareCount } = await import('./read-share-count')

const P = ulid(1)
const T = ulid(2)
const seat = (token: string, scope: Record<string, string>) => ({
  token,
  name: token,
  role: 'view',
  scope,
  createdBy: null,
  createdAt: '2026-09-11T10:00:00.000Z',
})

beforeEach(() => {
  fake = fakeAdmin()
})

describe('readShareCount', () => {
  it('counts the links scoped to this task, and neither another task’s nor a project link', async () => {
    fake.shareLinks.list.mockResolvedValue({
      shareLinks: [
        seat('tok_AAAAAAAAAAAAAAAAAAAAAAAA', { kind: 'task', projectId: P, taskId: T }),
        seat('tok_BBBBBBBBBBBBBBBBBBBBBBBB', { kind: 'task', projectId: P, taskId: ulid(3) }),
        seat('tok_CCCCCCCCCCCCCCCCCCCCCCCC', { kind: 'project', projectId: P }),
        seat('tok_DDDDDDDDDDDDDDDDDDDDDDDD', { kind: 'task', projectId: P, taskId: T }),
      ],
    })
    expect(await readShareCount(P, T)).toBe(2)
    expect(fake.shareLinks.list).toHaveBeenCalledWith(P)
  })

  it('answers a count and never a link, so no token can be handed to the page', async () => {
    fake.shareLinks.list.mockResolvedValue({
      shareLinks: [seat('tok_AAAAAAAAAAAAAAAAAAAAAAAA', { kind: 'task', projectId: P, taskId: T })],
    })
    expect(JSON.stringify(await readShareCount(P, T))).toBe('1')
  })

  it('answers undefined when the links could not be read, so the page says nothing rather than a zero', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(403, 'Not allowed'))
    expect(await readShareCount(P, T)).toBeUndefined()
  })

  it('sends an expired admin to sign in, back to this task', async () => {
    fake.shareLinks.list.mockRejectedValue(problem(401))
    expect(await redirectOf(readShareCount(P, T))).toBe(`/login?next=%2Fp%2F${P}%2Ft%2F${T}`)
  })
})
