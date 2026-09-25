import { can, effectiveBridgeRole, ROLES, type Principal, type Role } from '@repo/kernel'
import type { EpicBinding } from '../entities/binding.js'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanItem } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'

/**
 * An epic's binding as a response carries it: which project, at what role, and **no token**.
 *
 * Declared as its own shape rather than as `Omit<EpicBinding, 'sealedToken'>`, and the difference is
 * the whole reason this interface exists: an omission stays true only for as long as nobody adds a
 * second credential field to the stored binding and forgets to omit that one too, where a shape with
 * no key for a token has nowhere to put one. `@repo/contracts`' `EpicBindingView` makes the same
 * argument in the same words about the wire schema, and this is its domain-side twin.
 *
 * `role` is read off `EpicBinding` rather than restated as `'view' | 'manage'`, so the day a binding
 * admits a third role this view admits it too rather than narrowing a stored value silently.
 */
export interface EpicBindingView {
  readonly projectId: string
  readonly role: EpicBinding['role']
}

/**
 * One epic as a particular caller may be told about it: the rail, and its binding if it is owed one.
 *
 * Three states, and each says something different. **Absent** is "you were not told", which is what
 * a caller without `epic:bind` gets (ADR 0013). **`null`** is "this rail is bound to nothing", which
 * is a fact about the plan rather than about the reader, and an admin — who is never refused — is the
 * only caller that sees it. A **value** is the binding, minus its credential.
 *
 * Derived with `Omit` from the stored `PlanEpic` rather than written out, for the reason
 * {@link planView} copies fields by name: a field added to `PlanEpic` makes {@link epicView} fail to
 * compile, so somebody has to decide whether a plan reader may have it.
 */
export interface PlanEpicView extends Omit<PlanEpic, 'binding'> {
  readonly binding?: EpicBindingView | null
}

/**
 * The plan role this caller reads a plan at, which is one of the two inputs to design §7.3's minimum.
 *
 * A link principal carries its own role and that is the answer. An admin carries none, and `manage`
 * is both its floor and its ceiling: `can()` answers yes for an admin on every action and every
 * target, so there is no action a `manage` seat holds that an admin does not, and none above it to
 * name. Returning `'view'` for want of a stored role would make an admin the *weakest* reader of the
 * bridge, which is the silent failure this function exists to keep out of the shaping below — hence
 * its own named test rather than coverage borrowed from a caller's.
 *
 * Scope is deliberately not consulted. {@link planView} shapes the blocks a policy decides and gates
 * nothing else; the route's own `authorize()` is what refuses a principal whose scope reaches no plan
 * (ADR 0009), and a second reachability check here would be that rule written in two places.
 */
export function planRoleOf(principal: Principal): Role {
  return principal.kind === 'admin' ? 'manage' : principal.role
}

/**
 * The binding block this principal may be told about: the view, `null` for an unbound rail, or
 * `undefined` when the block is refused.
 *
 * Asks the kernel for `epic:bind` rather than testing `principal.kind === 'admin'`, exactly as
 * {@link visibleLinks} asks for `share:read`: shaping a response is a filter, and ADR 0009 requires a
 * filter to ask the policy. `epic:bind` is in `ADMIN_ONLY_ACTIONS`, so in practice only an admin
 * passes — asking is what makes that a consequence of the policy instead of a second place the rule
 * is written, and the day an epic-scoped seat can bind, this shaping follows without an edit.
 *
 * The target is `{ kind: 'epic', planId }` and carries no epic id, because `Target` has no such
 * field: a share link's scope is plan-wide, so no rule turns on which epic is being asked about
 * (`packages/kernel/src/access/target.ts` says so, and says why). The epic is still a parameter
 * because the answer's *contents* come from it even though the decision does not.
 *
 * Refusing answers `undefined` rather than `null` because the two are different sentences and only
 * one of them is true: `null` states that this rail is bound to nothing, which a refused caller has
 * not been told and which would be a lie about every bound rail (ADR 0013).
 */
export function visibleBinding(
  epic: PlanEpic,
  planId: string,
  principal: Principal,
): EpicBindingView | null | undefined {
  if (!can(principal, 'epic:bind', { kind: 'epic', planId })) return undefined
  if (epic.binding === null) return null
  return { projectId: epic.binding.projectId, role: epic.binding.role }
}

/**
 * One epic, with the binding block already decided, copied field by field so the token has no route
 * through.
 *
 * The binding is a parameter rather than something this function decides, so the policy question is
 * asked once per epic in one place and this one stays a pure reshaping. The fields are copied by name
 * for {@link planView}'s reason — a spread would carry the next stored field into a response by
 * default — and here that argument earns its keep twice over: spreading `epic` would carry
 * `sealedToken` back in underneath the very key this function exists to replace.
 */
export function epicView(
  epic: PlanEpic,
  binding: EpicBindingView | null | undefined,
): PlanEpicView {
  const body = {
    id: epic.id,
    name: epic.name,
    colour: epic.colour,
    railOrder: epic.railOrder,
    createdAt: epic.createdAt,
    updatedAt: epic.updatedAt,
  }
  return binding === undefined ? body : { ...body, binding }
}

/**
 * The role an item's epic **declares** its binding at: `null` when that rail is bound to nothing, and
 * `undefined` when the item's rail cannot be found at all.
 *
 * Declared, not live. The token's real role in Microtask is a different question — a revoked token
 * grants nothing whatever the manifest says — and it is answered in `apps/api`, the only place that
 * can reach the other product. This one is answerable from the manifest already open, which is what
 * keeps {@link planView} synchronous, and design §7.3's minimum only ever attenuates: a later caller
 * folding the live role in can lower this answer and never raise it.
 *
 * The two absent cases are told apart because they mean opposite things. A rail bound to nothing is
 * *proven* unbound, so there is no bridge and no role question to ask. A missing feature or a missing
 * rail proves nothing, so {@link visibleTaskLink} treats it as bound-and-refused rather than guessing
 * — both are `.find()` results this package cannot assert away, and an unresolvable chain is a
 * corrupt manifest rather than a reader's permission.
 */
export function declaredBindingRole(
  manifest: PlanManifest,
  item: PlanItem,
): EpicBinding['role'] | null | undefined {
  const feature = manifest.features.find((each) => each.id === item.featureId)
  const rail = manifest.epics.find((each) => each.id === feature?.epicId)
  if (rail === undefined) return undefined
  return rail.binding === null ? null : rail.binding.role
}

/**
 * The task id this item may name, or `null` when the caller is below effective `write` — and `null`
 * is the point.
 *
 * **A deliberate departure from ADR 0013's absent-rather-than-empty, and it departs because 0013's
 * own argument inverts here.** That ADR refuses an empty value because an empty value states a false
 * sentence. Design §7.3 requires an effective `view` holder to be unable to tell **that a link exists
 * at all**, and `linkedTaskId: null` is exactly what an unlinked item carries — the two are one
 * sentence, which is what §7.3 demands. An *absent* key would be the tell: it differs from the
 * unlinked case, so a reader diffing two items could read "this one is linked, and you were refused
 * its name" straight off the shape. Do not "fix" this to match 0013; doing so reintroduces the leak
 * the shape was chosen to close.
 *
 * An item under an unbound rail keeps whatever id it holds, for every caller. Nothing is bound, so it
 * cannot be a live link, and §7.2 makes an unbound epic's state "unlinked" for everybody — there is
 * no role question to ask, and asking one anyway would blank a field on the strength of a binding
 * that does not exist. An item whose rail cannot be found is refused instead, for the reason
 * {@link declaredBindingRole} gives.
 *
 * "Below `write`" is read off `ROLES`' own positions rather than written as `=== 'view'`. The two
 * agree today because a binding admits only `view` and `manage`, and they would stop agreeing the
 * day a role appears between them — which is exactly the day a comparison that happened to work
 * becomes a hole nobody edited.
 */
export function visibleTaskLink(manifest: PlanManifest, item: PlanItem, planRole: Role): string | null {
  const declared = declaredBindingRole(manifest, item)
  if (declared === null) return item.linkedTaskId
  if (declared === undefined) return null
  const effective = effectiveBridgeRole(planRole, declared)
  return ROLES.indexOf(effective) < ROLES.indexOf('write') ? null : item.linkedTaskId
}
