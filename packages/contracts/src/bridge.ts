import { z } from 'zod'
import { EntityId, EntityName, ShareToken } from './document.js'
import { Progress } from './progress.js'
import { Role } from './share-link.js'

const bridgeRole = z.enum(['view', 'manage'])

/**
 * The body of the route that binds an epic to a Microtask project (design §7.2).
 *
 * There is no `projectId` here, and that is deliberate rather than an omission: the project is
 * *derived* from the token, by resolving it through the API's own token index, never taken on the
 * caller's word. A payload naming both a token and a project would let the two disagree, and the
 * route would then have to pick a side; a payload naming only the token cannot disagree with
 * itself, because there is nothing else to disagree with.
 *
 * `role` admits `'view'` and `'manage'` and not `'write'`, matching {@link EpicBinding} in
 * `plan.ts`. §7.2 fixes what each means for a bridge: `view` reads names and progress and can
 * never alter Microtask data, while `manage` additionally lets naming an item create the real
 * task. `write`'s Microtask meaning — edit a document's own content — has no bridge analogue, so
 * admitting it here would grant a third thing this route was never built to check.
 */
export const BindEpicPayload = z
  .object({ token: ShareToken, role: bridgeRole })
  .meta({ id: 'BindEpicPayload', description: 'A share-link token and the bridge role it is bound at' })

/**
 * The body of the route that links an item to a task within its epic's bound project.
 *
 * The project itself is never named here: it is fixed by the epic's binding, so this payload can
 * only choose *which* task inside that already-derived project an item points at.
 */
export const LinkItemPayload = z
  .object({ taskId: EntityId })
  .meta({ id: 'LinkItemPayload', description: 'The task, within the epic’s bound project, an item points at' })

/**
 * What a plan reader is told about an epic's binding: which project, and at what role.
 *
 * This exists as its own schema, separate from {@link EpicBinding} in `plan.ts`, and the
 * difference is the whole point of it: `EpicBinding` carries `sealedToken` because the manifest
 * that stores a binding must keep the credential; this schema has **no field for it at all**.
 * §7.2 requires the token never to leave the server, and a schema with no place to put it makes
 * that true by construction — there is no key to forget to strip, unlike a schema built by
 * `.omit()`-ing the token off `EpicBinding`, which stays true only for as long as nobody adds a
 * field and forgets to omit it too.
 */
export const EpicBindingView = z
  .object({ projectId: EntityId, role: bridgeRole })
  .meta({ id: 'EpicBindingView', description: 'An epic’s binding, without the token that grants it' })

/**
 * What a rail's binding is worth **today**, which is not the same shape as what it stores.
 *
 * `role` is the kernel's full {@link Role} and not the two a binding may be declared at, because this
 * is an *attenuated* role: the weaker of the declared one and what the token holds in Microtask right
 * now. A rail declared `manage` whose token is a `write` seat is worth `write`, which is a value
 * {@link EpicBindingView} cannot express and which means something real here — a `write` reader is owed
 * a linked task's name (design §7.3) while being unable to create one (§7.2 reserves that to `manage`).
 *
 * So the two shapes are two different facts and not a duplication: {@link EpicBindingView} is what an
 * admin set, and this is what it currently buys. Collapsing them would force one of the two to lie.
 */
export const BridgeBinding = z
  .object({ projectId: EntityId, role: Role })
  .meta({ id: 'BridgeBinding', description: 'The project a rail is bound to, and what that binding is worth today' })

/**
 * One epic, as the bridge reports it: bound to a live project, or not.
 *
 * `binding` is optional rather than nullable-and-always-present, matching the shape of `state`: an
 * `'unlinked'` epic has no live binding to describe, so there is no meaningful value to fill the key
 * with. A revoked or dead token also reports as `'unlinked'` with `binding` absent (design §7.2) — the
 * same stated state whether the rail was never bound or its token has since died, because a reader
 * cannot act on the difference and an error page would suggest one exists. Which project it *was* bound
 * to is still on the plan read's own admin-only block, so the admin who has to fix it is not left
 * guessing.
 */
export const BridgeEpicRow = z
  .object({ epicId: EntityId, state: z.enum(['bound', 'unlinked']), binding: BridgeBinding.optional() })
  .meta({ id: 'BridgeEpicRow', description: 'One epic, and whether it is bound to a Microtask project' })

/**
 * One item, as the bridge reports it: its counted progress, and the linked task's name if the
 * reader is owed it.
 *
 * `taskName` is optional, and the reason is §7.3's own table rather than a display choice: an
 * effective `view` holder is given the derived `{ done, total }` and a filled bar, but **never**
 * the linked task's name and never that a link exists at all. Blanking the name in a UI that
 * received it would leave the string sitting in a response body for anyone reading the wire
 * rather than the screen; leaving the key out of the payload is what makes "a `view` holder never
 * receives it" the sentence this schema states, not one a renderer merely honours.
 */
export const BridgeItemRow = z
  .object({ itemId: EntityId, progress: Progress, taskName: EntityName.optional() })
  .meta({ id: 'BridgeItemRow', description: 'One item’s counted progress, and its task’s name if owed' })

/**
 * The bridge facts for one plan: every item's progress, and — for an admin — every epic's binding.
 *
 * `epics` is optional, and not an empty array, for the same reason `PlanView.shareLinks` is
 * (`plan-views.ts`, citing ADR 0013): `epic:bind` is in `ADMIN_ONLY_ACTIONS`
 * (`packages/kernel/src/access/policy.ts`), so the block that only an admin may *set* is the block
 * only an admin is *told about*. An empty array would state a different and false sentence — "this
 * plan has no bindings" — from the true one, "you were not told". `items` carries no such
 * ambiguity: every plan reader, admin or link holder, is owed every item's progress, so `items` is
 * required and an absent key here is a bug rather than a permission boundary.
 */
export const PlanBridgeView = z
  .object({ epics: z.array(BridgeEpicRow).readonly().optional(), items: z.array(BridgeItemRow).readonly() })
  .meta({ id: 'PlanBridgeView', description: 'A plan’s bridge facts: item progress, and admin-only bindings' })

/**
 * The tasks a `manage`-role binding may link an item to: every task in the bound project, id and
 * name only.
 *
 * This is the picker's own list, fetched once a binding is known, rather than a field folded into
 * {@link EpicBindingView} — an epic that is merely bound does not imply anyone is about to link an
 * item under it, so paying for the bound project's whole task list on every plan read would cost a
 * fetch nothing on screen asked for yet.
 */
export const BoundTaskList = z
  .object({ tasks: z.array(z.object({ id: EntityId, name: EntityName })).readonly() })
  .meta({ id: 'BoundTaskList', description: 'The tasks of a bound project, id and name only' })

/**
 * The body of the route that binds a rail by **naming the project**, the API minting the seat itself.
 *
 * ### Exactly one of a project and a token, never both
 *
 * {@link BindEpicPayload} above names a token and derives the project from it; this names a project and
 * derives the token by minting one. The rule both obey is the same, and it is that schema's own: a payload
 * carrying both would let the two disagree and force the route to pick a side — trusting the caller lets a
 * rail claim a project whose token it does not hold, and trusting the token makes the supplied field
 * decoration. Each of these payloads names one thing, so neither can disagree with itself.
 *
 * ### Why a route may mint at all, when ADR 0052 said it may not
 *
 * ADR 0052 refused minting from Macroplan, and its consequence section rests on one premise: that a call
 * creating a share link needs "an admin credential, **since a Macroplan admin holds no Microtask seat**".
 * True of seats, and beside the point — there is **one admin across both products**, signing in through the
 * product-agnostic `/v1/auth/login` (ADR 0014), which is the very reason 0052 could tell that admin to go
 * and mint the seat by hand in Microtask's own share manager. An admin who could not mint there could not
 * have followed 0052's flow.
 *
 * So the route that takes this adds **no authority**. It asks `epic:bind` on the plan and `share:create` on
 * the named project — the two gates `bindEpic` and `createShareLink` already ask, unchanged and in that
 * order — and what it removes is the clipboard, not a check. The minted token is sealed and stored inside
 * that one request and reaches no response, exactly as a pasted one does.
 *
 * `role` admits `'view'` and `'manage'` for {@link BindEpicPayload}'s reason: they are the two a bridge
 * means anything at, and the seat is minted at the role asked for and then attenuated on every read like
 * any other (ADR 0062).
 */
export const BindProjectPayload = z
  .object({ projectId: EntityId, role: bridgeRole })
  .meta({ id: 'BindProjectPayload', description: 'A Microtask project and the bridge role to bind it at' })
