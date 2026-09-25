import { effectiveBridgeRole, ROLES, type Principal, type Role } from '@repo/kernel'
import { planRoleOf, tellsBindings, type PlanEpic, type PlanFeature, type PlanItem } from '@repo/macroplan-domain'
import type { BoundProject, TaskFacts } from './bridge-service.js'

/** One epic, as the bridge reports it: whether it is live, and what it is live as. */
export interface BridgeEpicRow {
  readonly epicId: string
  readonly state: 'bound' | 'unlinked'
  readonly binding?: { readonly projectId: string; readonly role: Role }
}

/** One item, as the bridge reports it: its counted progress, and its task's name if the reader is owed it. */
export interface BridgeItemRow {
  readonly itemId: string
  readonly progress: TaskFacts['progress']
  readonly taskName?: string
}

/** A plan's bridge facts, shaped for exactly one reader. */
export interface PlanBridgeView {
  readonly epics?: readonly BridgeEpicRow[]
  readonly items: readonly BridgeItemRow[]
}

/**
 * The plan this view reads: its id, and the three arrays it walks. Not a whole manifest — it needs no
 * settings, no stamps and no seats, and taking the narrower shape is what stops a share token ever
 * being in scope here.
 */
export interface BridgeStructure {
  readonly planId: string
  readonly epics: readonly PlanEpic[]
  readonly features: readonly PlanFeature[]
  readonly items: readonly PlanItem[]
}

const WRITE_RANK = ROLES.indexOf('write')

/**
 * Whether a reader at this effective role is owed a linked task's **name**.
 *
 * Design §7.3's table in one predicate: an effective `view` holder gets "the derived `{ done, total }`
 * and a filled bar — **never** the linked task's name, and never that a link exists". Read off `ROLES`'
 * own positions rather than written as `!== 'view'`, so a role appearing between `view` and `write`
 * later is refused by default rather than admitted by a comparison that happened to work.
 */
export function namesTheTask(effective: Role): boolean {
  return ROLES.indexOf(effective) >= WRITE_RANK
}

/**
 * The epic id an item sits under, or `undefined` when the chain cannot be walked.
 *
 * Two hops, because an item names its feature and a feature names its rail — the three arrays are
 * siblings rather than nested (`PlanManifest`'s own note explains why). `undefined` for a broken chain
 * rather than a guess: a corrupt manifest proves nothing about what is bound, and {@link bridgeView}
 * reports such an item nothing at all.
 */
export function epicIdOf(plan: BridgeStructure, item: PlanItem): string | undefined {
  const feature = plan.features.find((each) => each.id === item.featureId)
  return plan.epics.find((each) => each.id === feature?.epicId)?.id
}

/**
 * A plan's bridge facts as one reader may be told them. Pure: every read has already happened.
 *
 * ### Where the phase's gate sentence lives
 *
 * Spec §9 requires that "a `view` holder provably never receives a linked task's name". *Receives*,
 * not *sees* — so the name is absent from what this function returns rather than hidden by whatever
 * renders it, and `bridge-view.test.ts` asserts it against `JSON.stringify` of this value. A renderer
 * that chose not to draw a name it had been handed would satisfy the screen and not the sentence.
 *
 * ### The minimum, applied the second time
 *
 * {@link BoundProject.role} is already the weaker of what a binding declares and what its token holds
 * in Microtask today. This is where design §7.3's "one function, applied at one seam" meets the person
 * reading: the effective role is that against {@link planRoleOf} of this principal. `effectiveBridgeRole`
 * being associative and idempotent is what makes two applications agree with one three-way minimum.
 *
 * ### Two blocks with different standing
 *
 * `epics` is **admin-only and absent when refused**, which `visibleBinding` decides by asking the
 * kernel for `epic:bind` — the same call `planView`'s binding block is shaped by, reused rather than
 * repeated so the two cannot answer differently about one rail. It is imported from
 * `@repo/macroplan-domain` for a second reason as well: `surface.test.ts` requires this app to ask the
 * policy in exactly one place, `auth/authorize.ts`, and a `can()` here would break that — the domain
 * is where shaping asks the policy, and this file is a caller of that decision rather than a second
 * place it is made.
 *
 * `items` is owed to every reader who may read the plan at all, so it is required and never absent.
 * What varies per reader is one optional field inside it.
 *
 * ### Which items get a row
 *
 * Only an item that is linked, sits under a rail that resolved, and names a task the bound project
 * still holds. The third is the one worth stating: a task deleted in Microtask leaves an item pointing
 * at nothing, and §7.2 fixes what a number on screen may be — "an unlinked item has a manual status
 * only — not a manual percentage — so a number on screen is always a counted number". A zeroed row
 * would be an invented count, so there is no row, and the item reads as unlinked.
 */
export function bridgeView(
  plan: BridgeStructure,
  bound: ReadonlyMap<string, BoundProject>,
  principal: Principal,
): PlanBridgeView {
  const items = itemRows(plan, bound, planRoleOf(principal))
  const epics = epicRows(plan, bound, principal)
  return epics === undefined ? { items } : { epics, items }
}

/**
 * One row per rail, or `undefined` when this reader may not be told about bindings at all.
 *
 * Every rail appears, bound or not, so the block is an answer about the whole plan rather than a list
 * of the rails that happen to be live — an admin looking for the rail they forgot to bind needs to see
 * it. `binding` is carried only for a live rail, and its `role` is the **attenuated** one: the stored
 * role is already in `planView`'s own admin-only block, so repeating it here would be a second copy of
 * one fact, while what only the bridge knows is what that role is worth today.
 */
export function epicRows(
  plan: BridgeStructure,
  bound: ReadonlyMap<string, BoundProject>,
  principal: Principal,
): readonly BridgeEpicRow[] | undefined {
  if (!tellsBindings(plan.planId, principal)) return undefined
  return plan.epics.map((each) => epicRow(each.id, bound.get(each.id)))
}

function epicRow(epicId: string, found: BoundProject | undefined): BridgeEpicRow {
  if (found === undefined || found.state !== 'bound') return { epicId, state: 'unlinked' }
  return { epicId, state: 'bound', binding: { projectId: found.projectId, role: found.role } }
}

/**
 * One row per item this reader is owed a count for, in the order the plan holds them.
 *
 * The name is attached per item rather than per plan, because the effective role is a fact about the
 * *rail* an item sits under: one plan can hold a rail bound at `view` and another bound at `manage`,
 * and a reader owed a name on one is not owed it on the other. Deciding once for the whole plan would
 * take the strongest rail's answer and apply it to every rail.
 */
export function itemRows(
  plan: BridgeStructure,
  bound: ReadonlyMap<string, BoundProject>,
  planRole: Role,
): readonly BridgeItemRow[] {
  const rows: BridgeItemRow[] = []
  for (const item of plan.items) {
    const row = itemRow(plan, bound, planRole, item)
    if (row !== undefined) rows.push(row)
  }
  return rows
}

function itemRow(
  plan: BridgeStructure,
  bound: ReadonlyMap<string, BoundProject>,
  planRole: Role,
  item: PlanItem,
): BridgeItemRow | undefined {
  if (item.linkedTaskId === null) return undefined
  const epicId = epicIdOf(plan, item)
  const found = epicId === undefined ? undefined : bound.get(epicId)
  if (found === undefined || found.state !== 'bound') return undefined
  const task = found.tasks.get(item.linkedTaskId)
  if (task === undefined) return undefined
  const effective = effectiveBridgeRole(planRole, found.role)
  const row = { itemId: item.id, progress: task.progress }
  return namesTheTask(effective) ? { ...row, taskName: task.name } : row
}
