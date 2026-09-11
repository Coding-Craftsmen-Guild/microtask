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

const { createTask, deleteTask, moveTask, renameTask, reorderTasks } = await import('./tasks')

const P = ulid(1)
const F = ulid(2)
const [T1, T2, T3, R1] = [ulid(10), ulid(11), ulid(12), ulid(13)]
const entry = (id: string, folderId: string | null) => ({ id, name: id, folderId })

beforeEach(() => {
  fake = fakeAdmin()
  refresh.mockReset()
  fake.projects.read.mockResolvedValue({
    id: P,
    tasks: [entry(T1, F), entry(R1, null), entry(T2, F), entry(T3, F)],
  })
})

describe('createTask', () => {
  it('creates the task in the folder named and opens it', async () => {
    fake.tasks.create.mockResolvedValue(entry(T1, F))
    expect(await redirectOf(createTask(P, 'Go-live', F))).toBe(`/p/${P}/t/${T1}`)
    expect(fake.tasks.create).toHaveBeenCalledWith(P, { name: 'Go-live', folderId: F })
  })

  it('creates at the project root when given no folder', async () => {
    fake.tasks.create.mockResolvedValue(entry(T1, null))
    await redirectOf(createTask(P, 'Notes', null))
    expect(fake.tasks.create).toHaveBeenCalledWith(P, { name: 'Notes', folderId: null })
  })

  it('answers a refusal without navigating', async () => {
    fake.tasks.create.mockRejectedValue(problem(422, 'Too many tasks'))
    expect(await createTask(P, 'x', null)).toEqual({ ok: false, status: 422, detail: plainRefusal(422, ACTION_REFUSALS.admin) })
  })
})

describe('renameTask', () => {
  it('answers the name the server stored and refreshes', async () => {
    fake.tasks.rename.mockResolvedValue({ ...entry(T1, F), name: 'DNS cutover' })
    expect(await renameTask(P, T1, ' DNS  cutover ')).toEqual({ ok: true, value: 'DNS cutover' })
    expect(fake.tasks.rename).toHaveBeenCalledWith({ projectId: P, taskId: T1 }, ' DNS  cutover ')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('deleteTask', () => {
  it('deletes the task and refreshes', async () => {
    fake.tasks.remove.mockResolvedValue(undefined)
    expect(await deleteTask(P, T1)).toEqual({ ok: true, value: null })
    expect(fake.tasks.remove).toHaveBeenCalledWith({ projectId: P, taskId: T1 })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('moveTask', () => {
  it('moves the task to the folder named, or to the root for null', async () => {
    fake.tasks.move.mockResolvedValue(entry(T1, null))
    expect(await moveTask(P, T1, null)).toEqual({ ok: true, value: null })
    expect(fake.tasks.move).toHaveBeenCalledWith({ projectId: P, taskId: T1 }, null)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('reorderTasks', () => {
  it('sends a strict permutation of the one folder group named', async () => {
    fake.tasks.reorder.mockResolvedValue({ tasks: [] })
    expect(await reorderTasks(P, F, [T3, T1, T2])).toEqual({ ok: true, value: null })
    expect(fake.tasks.reorder).toHaveBeenCalledWith(P, F, [T3, T1, T2])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('reads the root group as the tasks with no folder', async () => {
    fake.tasks.reorder.mockResolvedValue({ tasks: [] })
    expect(await reorderTasks(P, null, [R1])).toEqual({ ok: true, value: null })
    expect(fake.tasks.reorder).toHaveBeenCalledWith(P, null, [R1])
  })

  it('refuses a partial list before it reaches the API', async () => {
    expect(await reorderTasks(P, F, [T1, T2])).toMatchObject({ ok: false, status: 409 })
    expect(fake.tasks.reorder).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refuses a duplicated list before it reaches the API', async () => {
    expect(await reorderTasks(P, F, [T1, T1, T2])).toMatchObject({ ok: false, status: 409 })
    expect(fake.tasks.reorder).not.toHaveBeenCalled()
  })

  it('refuses a task from another group, even as a whole-length list', async () => {
    expect(await reorderTasks(P, F, [T1, T2, R1])).toMatchObject({ ok: false, status: 409 })
    expect(fake.tasks.reorder).not.toHaveBeenCalled()
  })

  it('checks against a fresh read of the project', async () => {
    fake.tasks.reorder.mockResolvedValue({ tasks: [] })
    await reorderTasks(P, F, [T3, T1, T2])
    expect(fake.projects.read).toHaveBeenCalledWith(P)
  })
})
