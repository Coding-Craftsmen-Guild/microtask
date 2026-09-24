import { planPath, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EPIC_1, FEATURE_1, PLAN_A, atlasPlan } from '../components/plan/testing/plan-fixture'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { Redirected, recordingAdmin, redirectOf, type RecordingAdmin } from './testing/recording-admin'

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

const { createFeature, estimateFeature, pinFeature, placeFeature, removeFeature, renameFeature } =
  await import('./features')

const WIRE = `${planPath(PLAN_A)}/features/${FEATURE_1}`

const carries = (field: string) => (sent: { readonly body: unknown }) =>
  typeof sent.body === 'object' && sent.body !== null && field in sent.body

const refused = (status: number) => ({
  ok: false,
  status,
  detail: plainRefusal(status, ACTION_REFUSALS.admin),
})

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
})

describe('a feature edit that touches two fields', () => {
  it('leaves the estimate written when the pin beside it is refused, because they travelled apart', async () => {
    admin.refuse(carries('pinSprint'), 403)

    const estimated = await estimateFeature(PLAN_A, FEATURE_1, 8)
    const pinned = await pinFeature(PLAN_A, FEATURE_1, 3)

    expect(estimated).toMatchObject({ ok: true })
    expect(pinned).toEqual(refused(403))
    expect(admin.sent).toEqual([
      { method: 'PATCH', path: WIRE, body: { estimateDays: 8 } },
      { method: 'PATCH', path: WIRE, body: { pinSprint: 3 } },
    ])
  })

  it('carries exactly one field in each request, which is one gate per request at the API', async () => {
    await renameFeature(PLAN_A, FEATURE_1, 'Auth rewrite II')
    await estimateFeature(PLAN_A, FEATURE_1, 8)
    await pinFeature(PLAN_A, FEATURE_1, 3)

    expect(admin.sent.map((sent) => Object.keys(sent.body as object))).toEqual([
      ['name'],
      ['estimateDays'],
      ['pinSprint'],
    ])
  })
})

describe('the fields that have a null', () => {
  it('clears an estimate with null rather than by omitting the key, which would change nothing', async () => {
    await estimateFeature(PLAN_A, FEATURE_1, null)
    expect(admin.sent).toEqual([{ method: 'PATCH', path: WIRE, body: { estimateDays: null } }])
  })

  it('unpins with null, and pins to sprint zero with zero', async () => {
    await pinFeature(PLAN_A, FEATURE_1, null)
    await pinFeature(PLAN_A, FEATURE_1, 0)
    expect(admin.sent.map((sent) => sent.body)).toEqual([{ pinSprint: null }, { pinSprint: 0 }])
  })
})

describe('the rest of the feature writes', () => {
  it('adds a feature to the rail its draft names, and answers the plan the API sent back', async () => {
    const created = await createFeature(PLAN_A, { epicId: EPIC_1, name: 'Audit log' })
    expect(created).toEqual({ ok: true, value: atlasPlan() })
    expect(admin.sent).toEqual([
      {
        method: 'POST',
        path: `${planPath(PLAN_A)}/features`,
        body: { epicId: EPIC_1, name: 'Audit log' },
      },
    ])
  })

  it('moves a feature on its own route, so a drop is never mistaken for an edit', async () => {
    await placeFeature(PLAN_A, FEATURE_1, { epicId: EPIC_1, position: 1 })
    expect(admin.sent).toEqual([
      { method: 'PATCH', path: `${WIRE}/placement`, body: { epicId: EPIC_1, position: 1 } },
    ])
  })

  it('removes a feature with no body at all', async () => {
    await removeFeature(PLAN_A, FEATURE_1)
    expect(admin.sent).toEqual([{ method: 'DELETE', path: WIRE, body: undefined }])
  })
})

describe('what a refusal costs', () => {
  it('re-renders the page once a write lands', async () => {
    await renameFeature(PLAN_A, FEATURE_1, 'Auth rewrite II')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the write was refused, so the sentence survives the answer', async () => {
    admin.refuse(() => true, 409)
    expect(await renameFeature(PLAN_A, FEATURE_1, 'Auth rewrite II')).toEqual(refused(409))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('sends an expired admin back to the plan page they were on, named from the id alone', async () => {
    held.api = null
    expect(await redirectOf(renameFeature(PLAN_A, FEATURE_1, 'x'))).toBe(
      `/login?next=%2Fplans%2F${PLAN_A}`,
    )
    expect(admin.sent).toEqual([])
  })
})
