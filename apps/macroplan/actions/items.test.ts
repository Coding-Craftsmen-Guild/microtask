import { planItemPath, planPath, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FEATURE_1, ITEM_1, PLAN_A, atlasPlan } from '../components/plan/testing/plan-fixture'
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

const { createItem, describeItem, estimateItem, placeItem, removeItem, renameItem } =
  await import('./items')

const WIRE = planItemPath(PLAN_A, ITEM_1)

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
})

describe('an item edit that touches two fields', () => {
  it('carries one field in each request, so a later role split lands with nothing to rewrite', async () => {
    await renameItem(PLAN_A, ITEM_1, 'Sessions v2')
    await estimateItem(PLAN_A, ITEM_1, 4)

    expect(admin.sent).toEqual([
      { method: 'PATCH', path: WIRE, body: { name: 'Sessions v2' } },
      { method: 'PATCH', path: WIRE, body: { estimateDays: 4 } },
    ])
  })

  it('leaves the rename written when the estimate behind it is refused', async () => {
    admin.refuse((sent) => JSON.stringify(sent.body).includes('estimateDays'), 403)

    expect(await renameItem(PLAN_A, ITEM_1, 'Sessions v2')).toMatchObject({ ok: true })
    expect(await estimateItem(PLAN_A, ITEM_1, 4)).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.admin),
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('clears an estimate with null, and estimates an item at no time at all with zero', async () => {
    await estimateItem(PLAN_A, ITEM_1, null)
    await estimateItem(PLAN_A, ITEM_1, 0)
    expect(admin.sent.map((sent) => sent.body)).toEqual([{ estimateDays: null }, { estimateDays: 0 }])
  })
})

describe('the description', () => {
  it('goes to its own route as its own field, because the API gates it as item:describe', async () => {
    const written = await describeItem(PLAN_A, ITEM_1, 'Rotate the signing keys first.')
    expect(written).toEqual({ ok: true, value: atlasPlan() })
    expect(admin.sent).toEqual([
      {
        method: 'PUT',
        path: `${WIRE}/description`,
        body: { description: 'Rotate the signing keys first.' },
      },
    ])
  })

  it('sends an empty description as an empty description, which is how one is cleared', async () => {
    await describeItem(PLAN_A, ITEM_1, '')
    expect(admin.sent.map((sent) => sent.body)).toEqual([{ description: '' }])
  })
})

describe('the rest of the item writes', () => {
  it('adds an item under the feature its draft names, with no position of its own', async () => {
    await createItem(PLAN_A, { featureId: FEATURE_1, name: 'Device list' })
    expect(admin.sent).toEqual([
      {
        method: 'POST',
        path: `${planPath(PLAN_A)}/items`,
        body: { featureId: FEATURE_1, name: 'Device list' },
      },
    ])
  })

  it('moves an item on its own route, and counts positions from zero', async () => {
    await placeItem(PLAN_A, ITEM_1, { featureId: FEATURE_1, position: 0 })
    expect(admin.sent).toEqual([
      { method: 'PATCH', path: `${WIRE}/placement`, body: { featureId: FEATURE_1, position: 0 } },
    ])
  })

  it('removes an item with no body at all', async () => {
    await removeItem(PLAN_A, ITEM_1)
    expect(admin.sent).toEqual([{ method: 'DELETE', path: WIRE, body: undefined }])
  })
})

describe('the authority every one of them runs under', () => {
  it('sends an expired admin back to the plan page they were on, named from the id alone', async () => {
    held.api = null
    expect(await redirectOf(removeItem(PLAN_A, ITEM_1))).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
    expect(admin.sent).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })
})
