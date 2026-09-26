import { planPath, type MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_TOKEN,
  FEATURE_1,
  LABEL_1,
  PLAN_A,
  atlasPlan,
} from '../components/plan/testing/plan-fixture'
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

const { createLabel, labelFeature, recolourLabel, removeLabel, renameLabel } = await import(
  './labels'
)

const LABELS = `${planPath(PLAN_A)}/labels`

const LABEL = `${LABELS}/${LABEL_1}`

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
})

describe('naming a group, which is a plan-level write and not a rail one', () => {
  it('adds one with no placement, groups having no order to place into', async () => {
    await createLabel(PLAN_A, { name: 'Phase 3' })

    expect(wireOf(admin.sent)).toEqual([
      { method: 'POST', path: LABELS, body: { name: 'Phase 3' } },
    ])
  })

  it('adds one with the colour its draft carries, which a positional argument could not omit', async () => {
    await createLabel(PLAN_A, { name: 'Phase 3', colour: '#22c55e' })

    expect(admin.sent.map((sent) => sent.body)).toEqual([{ name: 'Phase 3', colour: '#22c55e' }])
  })

  it('sends a name and a colour as two requests, so neither can be sent as an empty body', async () => {
    await renameLabel(PLAN_A, LABEL_1, 'Launch')
    await recolourLabel(PLAN_A, LABEL_1, '#ef4444')

    expect(wireOf(admin.sent)).toEqual([
      { method: 'PATCH', path: LABEL, body: { name: 'Launch' } },
      { method: 'PATCH', path: LABEL, body: { colour: '#ef4444' } },
    ])
  })

  it('leaves a rename written when the recolour behind it is refused, which is what splitting costs', async () => {
    admin.refuse(carries('colour'), 422)

    expect(await renameLabel(PLAN_A, LABEL_1, 'Launch')).toMatchObject({ ok: true })
    expect(await recolourLabel(PLAN_A, LABEL_1, '#ef4444')).toEqual({
      ok: false,
      status: 422,
      detail: plainRefusal(422, ACTION_REFUSALS.admin),
    })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('removes one with no body at all, and answers the plan the features come back ungrouped in', async () => {
    expect(await removeLabel(PLAN_A, LABEL_1)).toEqual({ ok: true, value: atlasPlan() })
    expect(wireOf(admin.sent)).toEqual([{ method: 'DELETE', path: LABEL, body: undefined }])
  })
})

/**
 * The one write here addressed at a **feature**, which is what makes a group contain anything.
 *
 * Its route is the feature's and not the label's, because the group is a field of the feature: that is
 * what lets one group hold features from any number of rails without a membership list anywhere. `null`
 * is the only way out of a group, and it is sent as a body rather than as a `DELETE`, so putting a
 * feature in a group and taking it out are one operation with two values.
 */
describe('putting a feature in a group, and taking it out again', () => {
  const wire = `${planPath(PLAN_A)}/features/${FEATURE_1}/label`

  it('sends the label id to the feature’s own route, never to the label’s', async () => {
    await labelFeature(PLAN_A, FEATURE_1, LABEL_1)

    expect(wireOf(admin.sent)).toEqual([{ method: 'PUT', path: wire, body: { labelId: LABEL_1 } }])
  })

  it('sends null to take it out, rather than a DELETE, so the two are one operation', async () => {
    await labelFeature(PLAN_A, FEATURE_1, null)

    expect(wireOf(admin.sent)).toEqual([{ method: 'PUT', path: wire, body: { labelId: null } }])
  })
})

describe('the authority every one of them runs under', () => {
  it("presents the admin's bearer on every request, which a link client would not", async () => {
    await renameLabel(PLAN_A, LABEL_1, 'Launch')
    await labelFeature(PLAN_A, FEATURE_1, null)

    expect(admin.sent.map((sent) => sent.bearer)).toEqual([ADMIN_TOKEN, ADMIN_TOKEN])
  })

  it('sends an expired admin back to the plan page they were on, named from the id alone', async () => {
    held.api = null

    expect(await redirectOf(removeLabel(PLAN_A, LABEL_1))).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
    expect(admin.sent).toEqual([])
    expect(refresh).not.toHaveBeenCalled()
  })
})
