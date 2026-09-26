import { MACROPLAN_PLANS_PATH, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_TOKEN, PLAN_A } from '../components/plan/testing/plan-fixture'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { recordingAdmin, wireOf, type RecordingAdmin } from './testing/recording-admin'
import { Redirected, redirectOf } from './testing/redirected'

const held: { api: MacroplanSessionClient | null } = { api: null }
let admin: RecordingAdmin

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(held.api) }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createPlan } = await import('./plans')

const DRAFT = { name: 'ACME Q4 delivery', startDate: '2026-10-05' } as const

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
})

describe('creating a plan', () => {
  it('posts the draft to the collection, which is the one address with no plan id in it', async () => {
    await redirectOf(createPlan(DRAFT))
    expect(wireOf(admin.sent)).toEqual([
      { method: 'POST', path: MACROPLAN_PLANS_PATH, body: DRAFT },
    ])
  })

  it('sends only what was drafted, so the service decides the sprint length and the timezone', async () => {
    await redirectOf(createPlan(DRAFT))
    expect(Object.keys(admin.sent[0]?.body as object).sort()).toEqual(['name', 'startDate'])
  })

  it('opens the plan it made, whose id exists for the first time in that answer', async () => {
    expect(await redirectOf(createPlan(DRAFT))).toBe(`/plans/${PLAN_A}`)
  })

  it('answers the refusal instead of navigating, so the form keeps what was typed', async () => {
    admin.refuse(() => true, 422)
    expect(await createPlan(DRAFT)).toEqual({
      ok: false,
      status: 422,
      detail: plainRefusal(422, ACTION_REFUSALS.admin),
    })
  })

  it('presents the admin bearer, this being the one write on the surface no seat can make', async () => {
    await redirectOf(createPlan(DRAFT))
    expect(admin.sent.map((one) => one.bearer)).toEqual([ADMIN_TOKEN])
  })
})
