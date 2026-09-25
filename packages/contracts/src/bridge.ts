import { z } from 'zod'
import { EntityId, EntityName, ShareToken } from './document.js'
import { Progress } from './progress.js'

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
 * One epic, as the bridge reports it: bound to a project, or not.
 *
 * `binding` is optional rather than nullable-and-always-present, matching the shape of `state`:
 * an `'unlinked'` epic never had a binding to describe, so there is no meaningful value to fill
 * the key with. A revoked or dead token also reports as `'unlinked'` with `binding` absent (design
 * §7.2) — the same stated state a caller sees whether the epic was never bound or its token has
 * since died, because a reader cannot act on the difference and an error page would suggest one
 * exists.
 */
export const BridgeEpicRow = z
  .object({ epicId: EntityId, state: z.enum(['bound', 'unlinked']), binding: EpicBindingView.optional() })
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
