import { planPath, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_TOKEN, EPIC_1, PLAN_A, atlasPlan } from '../components/plan/testing/plan-fixture'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { carries, recordingAdmin, wireOf, type RecordingAdmin } from './testing/recording-admin'
import { Redirected, redirectOf } from './testing/redirected'

const held: { api: MacroplanSessionClient | null } = { api: null }
const refresh = vi.fn()
let admin: RecordingAdmin

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(held.api) }))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createEpic, recolourEpic, removeEpic, renameEpic, reorderEpic } = await import('./epics')

const WIRE = `${planPath(PLAN_A)}/epics/${EPIC_1}`

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
})

describe('a rail edit', () => {
  it('sends a name and a colour as two requests, so neither can be sent as an empty body', async () => {
    await renameEpic(PLAN_A, EPIC_1, 'Platform work')
    await recolourEpic(PLAN_A, EPIC_1, '#ef4444')

    expect(wireOf(admin.sent)).toEqual([
      { method: 'PATCH', path: WIRE, body: { name: 'Platform work' } },
      { method: 'PATCH', path: WIRE, body: { colour: '#ef4444' } },
    ])
  })

  it('answers the whole plan to each of them, so the second answer is the one to render', async () => {
    expect(await renameEpic(PLAN_A, EPIC_1, 'Platform work')).toEqual({
      ok: true,
      value: atlasPlan(),
    })
    expect(await recolourEpic(PLAN_A, EPIC_1, '#ef4444')).toEqual({ ok: true, value: atlasPlan() })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('leaves a rename written when the recolour behind it is refused, which is what splitting costs', async () => {
    admin.refuse(carries('colour'), 422)

    expect(await renameEpic(PLAN_A, EPIC_1, 'Platform work')).toMatchObject({ ok: true })
    expect(await recolourEpic(PLAN_A, EPIC_1, '#ef4444')).toEqual({
      ok: false,
      status: 422,
      detail: plainRefusal(422, ACTION_REFUSALS.admin),
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('the rest of the rail writes', () => {
  it('adds a rail with no placement, because the API puts it at the bottom', async () => {
    await createEpic(PLAN_A, { name: 'Billing' })
    expect(wireOf(admin.sent)).toEqual([
      { method: 'POST', path: `${planPath(PLAN_A)}/epics`, body: { name: 'Billing' } },
    ])
  })

  it('adds a rail with the colour its draft carries, which a positional argument could not omit', async () => {
    await createEpic(PLAN_A, { name: 'Billing', colour: '#22c55e' })
    expect(admin.sent.map((sent) => sent.body)).toEqual([
      { name: 'Billing', colour: '#22c55e' },
    ])
  })

  it('reorders a rail on its own route, because the API gates that as epic:reorder', async () => {
    await reorderEpic(PLAN_A, EPIC_1, 2)
    expect(wireOf(admin.sent)).toEqual([
      { method: 'PATCH', path: `${WIRE}/placement`, body: { railOrder: 2 } },
    ])
  })

  it('removes a rail with no body at all', async () => {
    await removeEpic(PLAN_A, EPIC_1)
    expect(wireOf(admin.sent)).toEqual([{ method: 'DELETE', path: WIRE, body: undefined }])
  })
})

describe('the authority every one of them runs under', () => {
  it("presents the admin's bearer on every request, which a link client would not", async () => {
    await renameEpic(PLAN_A, EPIC_1, 'Platform work')
    await removeEpic(PLAN_A, EPIC_1)

    expect(admin.sent.map((sent) => sent.bearer)).toEqual([ADMIN_TOKEN, ADMIN_TOKEN])
  })

  it('sends an expired admin back to the plan page they were on, named from the id alone', async () => {
    held.api = null
    expect(await redirectOf(removeEpic(PLAN_A, EPIC_1))).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
    expect(admin.sent).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })
})
