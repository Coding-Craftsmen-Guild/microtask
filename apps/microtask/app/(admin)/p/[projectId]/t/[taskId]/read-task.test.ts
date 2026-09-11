import { ApiError, type AdminClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

const read = vi.fn<(ref: { projectId: string; taskId: string }) => Promise<unknown>>()
let signedIn = true

vi.mock('../../../../../../lib/api', () => ({
  apiForSession: (audience: string) =>
    Promise.resolve(signedIn && audience === 'admin' ? ({ tasks: { read } } as unknown as AdminClient) : null),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound()
  },
}))

const { readTask } = await import('./read-task')

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T = '01M240FB4GD6PF6V0PKZVF6FD9'
const LOGIN = `/login?next=${encodeURIComponent(`/p/${P}/t/${T}`)}`

const failure = async (attempt: Promise<unknown>): Promise<unknown> =>
  attempt.then(
    () => null,
    (error: unknown) => error,
  )

const problem = (status: number, detail: string): ApiError =>
  new ApiError({ status, code: 'x', detail, instance: '/v1/microtask/projects' })

let serial = 0
const fresh = (): string => {
  serial += 1
  return `01M240FB4GD6PF6V0PKZVF6G${String(serial).padStart(2, '0')}`
}

beforeEach(() => {
  signedIn = true
  read.mockReset()
})

describe('readTask', () => {
  it('reads the task through the admin client and answers it', async () => {
    const task = { id: T, name: 'Go-live', tabs: [] }
    read.mockResolvedValue(task)
    expect(await readTask(P, T)).toEqual({ ok: true, value: task })
    expect(read).toHaveBeenCalledWith({ projectId: P, taskId: T })
  })

  it('answers 404 for an id the API refuses as not an id, which it answers 422', async () => {
    read.mockRejectedValue(problem(422, 'Invalid param'))
    expect(await failure(readTask(P, fresh()))).toBeInstanceOf(NotFound)
  })

  it('answers 404 when the API does not hold the task', async () => {
    read.mockRejectedValue(problem(404, 'Task not found'))
    expect(await failure(readTask(P, fresh()))).toBeInstanceOf(NotFound)
  })

  it('sends a browser with no admin session to sign in and back to this task', async () => {
    signedIn = false
    const outcome = await failure(readTask(P, T))
    expect(outcome).toBeInstanceOf(Redirected)
    expect((outcome as Redirected).location).toBe(LOGIN)
    expect(read).not.toHaveBeenCalled()
  })

  it('sends an admin whose bearer the API refuses to sign in and back to this task', async () => {
    read.mockRejectedValue(problem(401, 'expired'))
    const outcome = await failure(readTask(P, T))
    expect((outcome as Redirected).location).toBe(LOGIN)
  })

  it('answers any other refusal as its sentence, for the page to show in place of the document', async () => {
    read.mockRejectedValue(problem(500, 'Boom'))
    const id = fresh()
    expect(await readTask(P, id)).toEqual({ ok: false, status: 500, detail: 'Boom' })
  })

  it('answers an unreachable API as the fixed sentence rather than a login loop', async () => {
    read.mockRejectedValue(new TypeError('fetch failed'))
    const outcome = await readTask(P, fresh())
    expect(outcome).toEqual({
      ok: false,
      status: 0,
      detail: 'Microtask could not reach its API. Try again in a moment.',
    })
  })
})
