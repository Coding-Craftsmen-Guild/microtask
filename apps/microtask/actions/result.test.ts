import { beforeEach, describe, expect, it, vi } from 'vitest'
import { asClient, fakeAdmin, problem, Redirected, redirectOf, type FakeAdmin } from './testing/fake-admin'

let fake: FakeAdmin
let session: 'present' | 'absent' = 'present'
const audiences: string[] = []

vi.mock('../lib/api', () => ({
  apiForSession: (audience: string) => {
    audiences.push(audience)
    return Promise.resolve(session === 'present' ? asClient(fake) : null)
  },
}))

class NotFound extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('notFound')
  },
}))

const { adminCall, adminRead, rejected } = await import('./result')

beforeEach(() => {
  fake = fakeAdmin()
  session = 'present'
  audiences.length = 0
})

describe('adminCall', () => {
  it('answers the value the call produced', async () => {
    expect(await adminCall('/p/x', () => Promise.resolve(42))).toEqual({ ok: true, value: 42 })
  })

  it('asks for the admin session and nothing else, on every call', async () => {
    await adminCall('/', () => Promise.resolve(1))
    await adminCall('/', () => Promise.resolve(2))
    expect(audiences).toEqual(['admin', 'admin'])
  })

  it('hands the call the client the session resolved', async () => {
    fake.projects.list.mockResolvedValue('listed')
    const result = await adminCall('/', (api) => api.projects.list())
    expect(result).toEqual({ ok: true, value: 'listed' })
  })

  it('sends a browser with no session to sign in, keeping where it was', async () => {
    session = 'absent'
    const call = vi.fn(() => Promise.resolve(1))
    expect(await redirectOf(adminCall('/p/01ABC', call))).toBe('/login?next=%2Fp%2F01ABC')
    expect(call).not.toHaveBeenCalled()
  })

  it('sends a 401 to sign in, keeping where it was', async () => {
    const location = await redirectOf(adminCall('/p/01ABC', () => Promise.reject(problem(401))))
    expect(location).toBe('/login?next=%2Fp%2F01ABC')
  })

  it('answers a 403 as a failure the user sees, never as a success', async () => {
    const result = await adminCall('/', () => Promise.reject(problem(403, 'Not yours.')))
    expect(result).toEqual({ ok: false, status: 403, detail: 'Not yours.' })
  })

  it('answers a 409 once, as a conflict, and never retries it', async () => {
    const call = vi.fn(() => Promise.reject(problem(409, 'Someone else changed this.')))
    const result = await adminCall('/', call)
    expect(result).toEqual({ ok: false, status: 409, detail: 'Someone else changed this.' })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('answers an unreachable API as a failure with status 0', async () => {
    const result = await adminCall('/', () => Promise.reject(new TypeError('fetch failed')))
    expect(result).toMatchObject({ ok: false, status: 0 })
  })
})

describe('rejected', () => {
  it('is a failure carrying the given status and detail', () => {
    expect(rejected(409, 'Stale.')).toEqual({ ok: false, status: 409, detail: 'Stale.' })
  })
})

describe('adminRead', () => {
  const outcomeOf = (attempt: Promise<unknown>): Promise<unknown> =>
    attempt.then(
      (value) => value,
      (error: unknown) => error,
    )

  it('answers the value the read produced', async () => {
    expect(await adminRead('/p/x', () => Promise.resolve('read'))).toEqual({ ok: true, value: 'read' })
  })

  it.each([404, 422])('renders not-found for a %i, the missing thing and the id that is not an id', async (status) => {
    expect(await outcomeOf(adminRead('/p/x', () => Promise.reject(problem(status))))).toBeInstanceOf(NotFound)
  })

  it('answers any other refusal as its sentence, for the page to show', async () => {
    const result = await adminRead('/p/x', () => Promise.reject(problem(500, 'Boom.')))
    expect(result).toEqual({ ok: false, status: 500, detail: 'Boom.' })
  })

  it('sends a 401 to sign in, back to the page it reads for', async () => {
    const location = await redirectOf(adminRead('/p/01ABC', () => Promise.reject(problem(401))))
    expect(location).toBe('/login?next=%2Fp%2F01ABC')
  })
})
