import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ apiForSession: () => Promise.resolve(null) }))
vi.mock('next/cache', () => ({ refresh: () => undefined }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`)
  },
}))

const { ADMIN_PLAN_ACTIONS } = await import('./admin-actions')

describe("the admin surface's writes", () => {
  it("holds every one of them under the action's own name, which a swapped pair would not", () => {
    const wiring = Object.entries(ADMIN_PLAN_ACTIONS).map(([name, call]) => [name, call.name])
    expect(wiring).toEqual(Object.keys(ADMIN_PLAN_ACTIONS).map((name) => [name, name]))
  })

  it('collects a real set of them, so the sweep above is not empty', () => {
    expect(Object.keys(ADMIN_PLAN_ACTIONS).length).toBeGreaterThan(15)
  })
})
