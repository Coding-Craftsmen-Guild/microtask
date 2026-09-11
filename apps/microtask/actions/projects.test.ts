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

const { createProject, deleteProject, renameProject } = await import('./projects')

const P = ulid(1)

beforeEach(() => {
  fake = fakeAdmin()
  refresh.mockReset()
})

describe('createProject', () => {
  it('creates the project and opens it', async () => {
    fake.projects.create.mockResolvedValue({ id: P, name: 'ACME' })
    expect(await redirectOf(createProject('ACME'))).toBe(`/p/${P}`)
    expect(fake.projects.create).toHaveBeenCalledWith('ACME')
  })

  it('answers a refusal without navigating, so the form keeps what was typed', async () => {
    fake.projects.create.mockRejectedValue(problem(422, 'Name is required'))
    expect(await createProject(' ')).toEqual({ ok: false, status: 422, detail: 'Name is required' })
  })

  it('sends an expired session to sign in, back to the index', async () => {
    fake.projects.create.mockRejectedValue(problem(401))
    expect(await redirectOf(createProject('ACME'))).toBe('/login')
  })
})

describe('renameProject', () => {
  it('answers the name the server stored, which may differ from the one sent', async () => {
    fake.projects.rename.mockResolvedValue({ id: P, name: 'a b' })
    expect(await renameProject(P, 'a    b')).toEqual({ ok: true, value: 'a b' })
    expect(fake.projects.rename).toHaveBeenCalledWith(P, 'a    b')
  })

  it('refreshes the page after a rename, and not after a refusal', async () => {
    fake.projects.rename.mockResolvedValue({ id: P, name: 'x' })
    await renameProject(P, 'x')
    expect(refresh).toHaveBeenCalledTimes(1)
    fake.projects.rename.mockRejectedValue(problem(409, 'Conflict'))
    expect(await renameProject(P, 'y')).toEqual({ ok: false, status: 409, detail: 'Conflict' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('sends an expired session back to this project after signing in', async () => {
    fake.projects.rename.mockRejectedValue(problem(401))
    expect(await redirectOf(renameProject(P, 'x'))).toBe(`/login?next=%2Fp%2F${P}`)
  })
})

describe('deleteProject', () => {
  it('deletes the project and refreshes the index', async () => {
    fake.projects.remove.mockResolvedValue(undefined)
    expect(await deleteProject(P)).toEqual({ ok: true, value: null })
    expect(fake.projects.remove).toHaveBeenCalledWith(P)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reports a project already gone, and refreshes nothing', async () => {
    fake.projects.remove.mockRejectedValue(problem(404, 'Project not found'))
    expect(await deleteProject(P)).toEqual({ ok: false, status: 404, detail: 'Project not found' })
    expect(refresh).not.toHaveBeenCalled()
  })
})
