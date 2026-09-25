import type { BoundTasks, PlanBridge } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'

/** Everything the item drawer's link field needs, derived from the two reads that know it. */
export interface ItemLink {
  /** The linked task's name, or `null` — which covers unlinked, refused and not-counted alike. */
  readonly taskName: string | null

  /** Whether this item's rail resolved to a live Microtask project. */
  readonly bound: boolean

  /** Whether that rail is worth `manage` today, which is what creating a task needs. */
  readonly manages: boolean

  /** Every task of the bound project, newline-joined — the shape a client boundary admits. */
  readonly options: string
}

const railOf = (plan: PlanScreenModel, itemId: string): string | undefined => {
  const item = plan.items.find((each) => each.id === itemId)
  const feature = plan.features.find((each) => each.id === item?.featureId)
  return plan.epics.find((each) => each.id === feature?.epicId)?.id
}

/**
 * What one item's link is, and what may be done about it, from the plan and the bridge together.
 *
 * Neither read answers this alone. The plan knows which rail an item sits under; the bridge knows whether
 * that rail is live, what it is worth today, and what the linked task is called. A missing bridge answer
 * reads as **not bound** rather than as unknown — `read-bridge.ts` collapses every failure to `null`, and
 * the conservative reading is the honest one: offering a picker on the strength of a read that never
 * landed would produce a request the API refuses.
 *
 * `manages` is the bridge's own attenuated role and not a control, because no control can express it: it
 * depends on what the rail's token holds in Microtask right now (design §7.3). The API checks it again at
 * the instant of the write, so this is a rendering answer exactly as a `PlanControls` boolean is.
 *
 * `options` is `null`-safe in the other direction too. The task list is fetched separately and only for a
 * reader holding `epic:bind`, so a surface that did not fetch one passes `undefined` and gets no picker —
 * which is what a seat surface will do, and is the recorded consequence of gating that list admin-only.
 */
export function itemLink(
  plan: PlanScreenModel,
  bridge: PlanBridge | null,
  itemId: string,
  tasks?: BoundTasks | null,
): ItemLink {
  const rail = railFor(bridge, railOf(plan, itemId))
  return {
    taskName: countedRow(bridge, itemId),
    bound: rail?.state === 'bound',
    manages: rail?.binding?.role === 'manage',
    options: optionsOf(tasks),
  }
}

/** The bridge's row for one rail, or `undefined` when there is no answer or no rail. */
export function railFor(bridge: PlanBridge | null, epicId: string | undefined) {
  if (bridge?.epics === undefined || epicId === undefined) return undefined
  return bridge.epics.find((row) => row.epicId === epicId)
}

/** The linked task's name for one item, or `null` — which covers refused as well as unlinked. */
export function countedRow(bridge: PlanBridge | null, itemId: string): string | null {
  const row = bridge?.items.find((one) => one.itemId === itemId)
  return row?.taskName ?? null
}

/**
 * The picker's options as one newline-joined string, or `''` for none.
 *
 * One string because a client boundary admits primitives and an array of strings is not one — the whole
 * argument is on `splitTasks` in `components/plan/drawer/task-picker.tsx`, which is what undoes this.
 */
export function optionsOf(tasks: BoundTasks | null | undefined): string {
  if (tasks === null || tasks === undefined) return ''
  return tasks.tasks.map((one) => `${one.id} ${one.name}`).join('\n')
}
