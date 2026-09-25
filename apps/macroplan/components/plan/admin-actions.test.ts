import { describe, expect, it, vi } from 'vitest'
import { Redirected } from '../../actions/testing/redirected'

vi.mock('../../lib/api', () => ({ apiForSession: () => Promise.resolve(null) }))
vi.mock('next/cache', () => ({ refresh: () => undefined }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { ADMIN_PLAN_ACTIONS } = await import('./admin-actions')

describe("the admin surface's writes", () => {
  it("holds every one of them under the action's own name, which a swapped pair would not", () => {
    const wiring = Object.entries(ADMIN_PLAN_ACTIONS).map(([name, call]) => [name, call.name])
    expect(wiring).toEqual(Object.keys(ADMIN_PLAN_ACTIONS).map((name) => [name, name]))
  })

  it('collects all twenty-three of them, so the sweep above is neither empty nor short of one', () => {
    expect(Object.keys(ADMIN_PLAN_ACTIONS).length).toBe(23)
  })
})
