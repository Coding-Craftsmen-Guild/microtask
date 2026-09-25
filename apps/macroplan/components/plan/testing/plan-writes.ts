import { vi } from 'vitest'
import type { Plan } from '@repo/api-client'
import type { ActionResult } from '../../../actions/result'
import { ADMIN_CONTROLS } from '../../../lib/admin-controls'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import { atlasPlan } from './plan-fixture'

const NAMES = Object.keys(ADMIN_CONTROLS.content)

const served = (): ActionResult<Plan> => ({ ok: true, value: atlasPlan() })

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
