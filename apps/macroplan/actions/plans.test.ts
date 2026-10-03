import { MACROPLAN_PLANS_PATH, planPath, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planScreenModel } from '../components/plan/plan-screen-model'
import { ADMIN_TOKEN, PLAN_A, atlasPlan } from '../components/plan/testing/plan-fixture'
import { PLANS_INDEX_PATH } from '../lib/routes'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { recordingAdmin, wireOf, type RecordingAdmin } from './testing/recording-admin'
import { Redirected, redirectOf } from './testing/redirected'

const held: { api: MacroplanSessionClient | null } = { api: null }
let admin: RecordingAdmin

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(held.api) }))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const refresh = vi.fn()

const { createPlan, deletePlan, renamePlan, retimePlan } = await import('./plans')

const DRAFT = { name: 'ACME Q4 delivery', startDate: '2026-10-05' } as const

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
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

describe('renaming a plan', () => {
  it('sends the name alone, so the request meets plan:rename and never plan:retime as well', async () => {
    await renamePlan(PLAN_A, 'Atlas rebuild')
    expect(wireOf(admin.sent)).toEqual([
      { method: 'PATCH', path: planPath(PLAN_A), body: { name: 'Atlas rebuild' } },
    ])
  })

  // The whole reason this answers a string rather than a plan: the server collapses whitespace runs, so a
  // caller repainting what it typed would show a name the plan does not have.
  it('answers the name the server stored rather than the one that was sent', async () => {
    const result = await renamePlan(PLAN_A, 'Atlas   rebuild')
    expect(result).toEqual({ ok: true, value: atlasPlan().name })
  })

  it('re-renders the page on success, the heading and the list row both naming the plan', async () => {
    await renamePlan(PLAN_A, 'Atlas rebuild')
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('re-renders nothing when it was refused, so the sentence is not replaced by a repaint', async () => {
    admin.refuse(() => true, 403)
    const result = await renamePlan(PLAN_A, 'Atlas rebuild')
    expect(result.ok).toBe(false)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('retiming a plan', () => {
  // The one write in the product that moves every bar and restructures nothing: every date is derived from
  // `startDate` and `sprintLengthDays` (spec §3.4), so it answers the whole plan where the rename answers a
  // string.
  it('sends whichever calendar fields it was given, in one request against one gate', async () => {
    await retimePlan(PLAN_A, { startDate: '2026-02-02', sprintLengthDays: 14 })
    expect(wireOf(admin.sent)).toEqual([
      {
        method: 'PATCH',
        path: planPath(PLAN_A),
        body: { startDate: '2026-02-02', sprintLengthDays: 14 },
      },
    ])
  })

  it('answers the whole plan, because the timeline it comes back with is a different one', async () => {
    const result = await retimePlan(PLAN_A, { timezone: 'Europe/Belgrade' })
    expect(result).toEqual({ ok: true, value: planScreenModel(atlasPlan()) })
  })

  it('carries the admin bearer and no token of any other kind', async () => {
    await retimePlan(PLAN_A, { sprintLengthDays: 14 })
    expect(admin.sent.map((one) => one.bearer)).toEqual([ADMIN_TOKEN])
  })
})

describe('deleting a plan', () => {
  it('sends one DELETE at the plan itself and nothing else', async () => {
    await redirectOf(deletePlan(PLAN_A))
    expect(wireOf(admin.sent)).toEqual([{ method: 'DELETE', path: planPath(PLAN_A), body: undefined }])
  })

  // The mirror of `createPlan` above: a plan that is gone has no page to stay on, so success leaves for
  // the index and there is nothing to answer with.
  it('leaves for the index, which is the only place there is to go', async () => {
    expect(await redirectOf(deletePlan(PLAN_A))).toBe(PLANS_INDEX_PATH)
  })

  it('answers the refusal and stays put when the API refused it', async () => {
    admin.refuse(() => true, 403)
    expect(await deletePlan(PLAN_A)).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.admin),
    })
  })

  // No `refresh` and none needed: `redirect` throws, so nothing after it runs, and the index it lands on
  // is a different route reading its own list.
  it('asks for no re-render, having navigated away from the page it changed', async () => {
    await redirectOf(deletePlan(PLAN_A))
    expect(refresh).not.toHaveBeenCalled()
  })
})
