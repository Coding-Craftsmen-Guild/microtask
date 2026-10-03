import type { MacroplanSessionClient } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planScreenModel } from '../components/plan/plan-screen-model'
import {
  EPIC_1,
  ITEM_1,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
  atlasPlan,
} from '../components/plan/testing/plan-fixture'
import { recordingAdmin, type RecordingAdmin } from './testing/recording-admin'
import { Redirected } from './testing/redirected'

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

const { bindEpic, bindEpicProject, createTask, linkItem, unbindEpic, unlinkItem } = await import('./bridge')

const TASK_1 = '01M240ERCRWWCN16Q5AHP1FZT1'

const PROJECT_1 = '01M240PRJCTPRJCTPRJCTPRJC1'

const WRITES = [
  { name: 'bindEpic', write: () => bindEpic(PLAN_A, EPIC_1, { token: 'pasted-share-token', role: 'manage' }) },
  { name: 'bindEpicProject', write: () => bindEpicProject(PLAN_A, EPIC_1, { projectId: PROJECT_1, role: 'manage' }) },
  { name: 'unbindEpic', write: () => unbindEpic(PLAN_A, EPIC_1) },
  { name: 'linkItem', write: () => linkItem(PLAN_A, ITEM_1, TASK_1) },
  { name: 'unlinkItem', write: () => unlinkItem(PLAN_A, ITEM_1) },
  { name: 'createTask', write: () => createTask(PLAN_A, ITEM_1) },
] as const

beforeEach(() => {
  admin = recordingAdmin()
  held.api = admin.api
  refresh.mockReset()
})

// A binding and a link change what only the server can read — a rail's state and an item's task name and
// count come from the bridge — so these six are the writes that still re-render the page, where every
// other plan write is adopted by the screen as it is answered (ADR 0069).
describe('a write that reaches the other product', () => {
  it.each(WRITES)('re-renders the page once $name lands, the bridge being what only the server reads', async ({ write }) => {
    expect(await write()).toEqual({ ok: true, value: planScreenModel(atlasPlan()) })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each(WRITES)('re-renders nothing when $name was refused, so the sentence survives the answer', async ({ write }) => {
    admin.refuse(() => true, 409)
    expect(await write()).toMatchObject({ ok: false, status: 409 })
    expect(refresh).not.toHaveBeenCalled()
  })

  it('answers a plan carrying none of the seat tokens the API sent with it, as every plan write does', async () => {
    const answered = JSON.stringify(await linkItem(PLAN_A, ITEM_1, TASK_1))
    expect(JSON.stringify(atlasPlan())).toContain(SEAT_TOKEN)
    for (const token of [SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN]) expect(answered).not.toContain(token)
  })
})
