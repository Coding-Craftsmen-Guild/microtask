import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, problem, Redirected, redirectOf, ulid, type FakeAdmin } from './testing/fake-admin'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'

let fake: FakeAdmin
const refresh = vi.fn()

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(asClient(fake)) }))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createFolder, deleteFolder, renameFolder, reorderFolders } = await import('./folders')

const P = ulid(1)
const [A, B, C] = [ulid(10), ulid(11), ulid(12)]
const folder = (id: string) => ({ id, name: id, position: 0, createdAt: 'x', updatedAt: 'x' })

beforeEach(() => {
  fake = fakeAdmin()
  refresh.mockReset()
  fake.folders.list.mockResolvedValue({ folders: [folder(A), folder(B), folder(C)] })
})

describe('createFolder', () => {
  it('creates the folder and refreshes the page', async () => {
    fake.folders.create.mockResolvedValue(folder(A))
    expect(await createFolder(P, 'ACME')).toEqual({ ok: true, value: null })
    expect(fake.folders.create).toHaveBeenCalledWith(P, 'ACME')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('shows a 403 rather than pretending it worked', async () => {
    fake.folders.create.mockRejectedValue(problem(403, 'Not allowed'))
    expect(await createFolder(P, 'ACME')).toEqual({ ok: false, status: 403, detail: plainRefusal(403, ACTION_REFUSALS.admin) })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('renameFolder', () => {
  it('answers the name the server stored', async () => {
    fake.folders.rename.mockResolvedValue({ ...folder(A), name: 'Beta Co' })
    expect(await renameFolder(P, A, 'Beta   Co')).toEqual({ ok: true, value: 'Beta Co' })
    expect(fake.folders.rename).toHaveBeenCalledWith(P, A, 'Beta   Co')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('deleteFolder', () => {
  it('deletes the folder and refreshes', async () => {
    fake.folders.remove.mockResolvedValue(undefined)
    expect(await deleteFolder(P, A)).toEqual({ ok: true, value: null })
    expect(fake.folders.remove).toHaveBeenCalledWith(P, A)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('reorderFolders', () => {
  it('sends a strict permutation of the folders that exist now', async () => {
    fake.folders.reorder.mockResolvedValue({ folders: [] })
    expect(await reorderFolders(P, [C, A, B])).toEqual({ ok: true, value: null })
    expect(fake.folders.reorder).toHaveBeenCalledWith(P, [C, A, B])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refuses a partial list before it reaches the API', async () => {
    const result = await reorderFolders(P, [C, A])
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(fake.folders.reorder).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refuses a duplicated list before it reaches the API', async () => {
    const result = await reorderFolders(P, [A, A, B])
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(fake.folders.reorder).not.toHaveBeenCalled()
  })

  it('checks against a fresh read, not against anything the browser sent', async () => {
    await reorderFolders(P, [C, A, B])
    expect(fake.folders.list).toHaveBeenCalledWith(P)
  })

  it('sends an expired session to sign in from the read', async () => {
    fake.folders.list.mockRejectedValue(problem(401))
    expect(await redirectOf(reorderFolders(P, [A]))).toBe(`/login?next=%2Fp%2F${P}`)
  })
})
