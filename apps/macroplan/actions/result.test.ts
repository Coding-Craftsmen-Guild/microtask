import { ApiError, type AdminClient } from '@repo/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SERVICE_UNAVAILABLE } from '../lib/problem'
import { ACTION_REFUSALS } from '../lib/refusal'

const held: { api: AdminClient | null } = { api: null }

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(held.api) }))

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('not found')
  },
}))

const { adminCall, adminRead } = await import('./result')

const api = {} as AdminClient

const refusal = (status: number): ApiError =>
  new ApiError({ status, code: 'x', detail: 'the API said so', instance: '/v1/macroplan/plans' })

beforeEach(() => {
  held.api = api
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('adminCall', () => {
  it('answers the value the call returned', async () => {
    expect(await adminCall('/plans', () => Promise.resolve(7))).toEqual({ ok: true, value: 7 })
  })

  it('hands the call the client the cookie named, and nothing else', async () => {
    const seen: unknown[] = []
    await adminCall('/plans', (client) => {
      seen.push(client)
      return Promise.resolve(null)
    })
    expect(seen).toEqual([api])
  })

  it('redirects to /login with the deep link when this browser holds no session', async () => {
    held.api = null
    await expect(adminCall('/plans/01H', () => Promise.resolve(1))).rejects.toThrow(Redirected)
  })

  it('makes no call at all when this browser holds no session', async () => {
    held.api = null
    const called = vi.fn(() => Promise.resolve(1))
    await adminCall('/plans', called).catch(() => undefined)
    expect(called).not.toHaveBeenCalled()
  })

  it('redirects a 401 rather than returning it, so an expired admin signs in again', async () => {
    const outcome = await adminCall('/plans/01H', () => Promise.reject(refusal(401))).catch(
      (error: unknown) => error,
    )
    expect(outcome).toBeInstanceOf(Redirected)
    expect((outcome as Redirected).location).toBe('/login?next=%2Fplans%2F01H')
  })

  it.each([403, 409, 413])('returns a %i as this surface own sentence, never the API detail', async (status) => {
    const result = await adminCall('/plans', () => Promise.reject(refusal(status)))
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('the API said so')
  })

  it('returns an unreachable API as status 0 with the product sentence', async () => {
    const result = await adminCall('/plans', () => Promise.reject(new TypeError('fetch failed')))
    expect(result).toEqual({ ok: false, status: 0, detail: SERVICE_UNAVAILABLE })
  })

  it('uses this app copy tables and not another product', async () => {
    const result = await adminCall('/plans', () => Promise.reject(refusal(409)))
    expect(result).toEqual({ ok: false, status: 409, detail: ACTION_REFUSALS.conflict })
  })
})

describe('adminRead', () => {
  it.each([404, 422])('renders the route not-found page for a %i', async (status) => {
    await expect(adminRead('/plans', () => Promise.reject(refusal(status)))).rejects.toThrow(NotFound)
  })

  it('lets every other refusal through as a sentence the page can show', async () => {
    const result = await adminRead('/plans', () => Promise.reject(refusal(403)))
    expect(result).toEqual({ ok: false, status: 403, detail: ACTION_REFUSALS.forbidden })
  })

  it('answers a successful read as a value', async () => {
    expect(await adminRead('/plans', () => Promise.resolve('ok'))).toEqual({ ok: true, value: 'ok' })
  })
})
