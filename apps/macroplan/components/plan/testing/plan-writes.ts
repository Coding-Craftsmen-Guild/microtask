import { vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { DeleteWrite } from '../settings/delete-plan'
import type { RenameWrite } from '../settings/plan-name-form'
import type { RetimeWrite } from '../settings/timing-form'
import { atlasPlan } from './plan-fixture'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'

const NAMES = Object.keys(ADMIN_CONTROLS.content)

const served = (): ActionResult<PlanScreenModel> => ({ ok: true, value: planScreenModel(atlasPlan()) })
/**
 * The three doubles {@link stubPlanWrites} answers, typed off the components' own write types.
 *
 * Off `RenameWrite`, `RetimeWrite` and `DeleteWrite` rather than spelled out here, so a change to any of
 * the three signatures is a compile error in this file rather than a double that has quietly stopped
 * matching what the form it stands in for expects.
 */
export interface PlanWriteDoubles {
  readonly rename: RenameWrite
  readonly retime: RetimeWrite
  readonly remove: DeleteWrite
}

/**
 * Every plan write as a spy, built off the control names rather than listed.
 *
 * `plan-capabilities.test.ts` already pins those keys against both wirings of `PlanEditActions`, so
 * there is no second list here to fall behind one. Two test files wrote this same helper and the same
 * `as unknown as` with it — the assertion is exactly the one `Object.fromEntries` cannot make, since it
 * answers a `Record` and the interface names each member — and shared scaffolding is what this
 * directory is for. Members handed in override the spies by name, which is how a test names the one
 * write it is about.
 *
 * Deliberately **not** `ADMIN_PLAN_ACTIONS`: a real Server Action drags `next/headers` into a render
 * that has no request.
 *
 * @param over - The members this test cares about, each replacing the spy of that name.
 * @returns Every write of plan content, answering the Atlas fixture unless overridden.
 */
export const stubActions = (over: Partial<PlanEditActions> = {}): PlanEditActions => {
  const every = Object.fromEntries(NAMES.map((name) => [name, vi.fn(() => Promise.resolve(served()))]))
  return { ...(every as unknown as PlanEditActions), ...over }
}

/**
 * Every content control false: the surface that may write nothing and so draws nothing.
 *
 * Built off the same key list for the same reason, so a further control is false here the moment it
 * exists rather than absent from an object that claims to hold them all.
 *
 * @returns A control set in which no field is drawn.
 */
export const nothingDrawn = (): PlanContentControls =>
  Object.fromEntries(NAMES.map((name) => [name, false])) as unknown as PlanContentControls

/**
 * The three plan-level writes as spies: rename, retime, and delete.
 *
 * Listed rather than built off a key list, unlike {@link stubActions} above, and the difference is that
 * these three **do not share a return type**. `renamePlan` answers the name the server stored, because a
 * rename moves nothing on the axis and the whole plan would be the plan already on screen; `deletePlan`
 * answers a refusal or nothing at all, because a plan that is gone has no representation and success
 * redirects. Only `retimePlan` answers a plan. That is exactly why they are a group of their own
 * (`PlanOwnControls`) rather than members of `PlanEditActions`, whose every member answers an
 * `ActionResult<PlanScreenModel>` so that `eachOrNoAnswer` can map over it.
 *
 * @param over - The members this test cares about, each replacing the spy of that name.
 * @returns The three writes, each answering success against the Atlas fixture.
 */
export const stubPlanWrites = (over: Partial<PlanWriteDoubles> = {}): PlanWriteDoubles => ({
  rename: vi.fn(() => Promise.resolve<ActionResult<string>>({ ok: true, value: planScreenModel(atlasPlan()).name })),
  retime: vi.fn(() => Promise.resolve(served())),
  remove: vi.fn(() => Promise.resolve(undefined)),
  ...over,
})
