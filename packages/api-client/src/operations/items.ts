import {
  PlanView,
  type CreateItemPayload,
  type DescriptionPayload,
  type ItemPlacementPayload,
  type UpdateItemPayload,
} from '@repo/contracts'
import { planItemPath, planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'
import type { Plan } from './plans.js'

const itemsPath = (planId: string): string => `${planPath(planId)}/items`

/**
 * The item to add: the feature it goes under, its name, and optionally an estimate.
 *
 * `featureId` is a field of the body rather than a path segment, for the reason `features.ts` gives
 * of its own `epicId`: the thing being addressed is the plan, and a feature that is not in this plan
 * is refused as a 422 rather than followed across plans. The body carries no position — the item
 * lands after the last one already under that feature.
 */
export type NewItem = Decoded<typeof CreateItemPayload>

/**
 * What may be changed about an item that already exists: its name, its estimate, or both.
 *
 * `null` and omission differ on `estimateDays`: leaving the key off leaves the estimate alone,
 * sending `null` clears it. Zero is a real estimate — an item that takes no time — so "not estimated
 * yet" has no falsy spelling.
 *
 * Not `linkedTaskId`. `UpdateItemPayload` declares no such field, so a body naming one has it
 * stripped by the API rather than honoured: the link to a Microtask task is the bridge, and spec §9
 * reserves writing one for phase 4. Nothing reachable from this client writes a task link.
 */
export type ItemChange = Decoded<typeof UpdateItemPayload>

/**
 * Which feature an item sits under and where under it — both, always, even when only one changes.
 *
 * `position` is **0-based**: `Position` is `int().min(0)` and the domain renumbers a feature's items
 * densely from zero, so the first item under a feature is at `0` and a caller that assumes 1-based is
 * off by one, silently, with a 200 and a plan back. The payload object rather than two bare
 * arguments, because the wire shape is `{featureId, position}` and this client speaks the wire.
 * `ItemService.place` takes the same object, so unlike a rail there is no domain asymmetry being
 * refused here.
 */
export type ItemPlacement = Decoded<typeof ItemPlacementPayload>

/** Everything a caller may ask of the items under a plan's features. */
export interface ItemsApi {
  /**
   * Adds an item at the end of the feature the body names.
   *
   * The feature's span grows by this item's estimate, so the plan that comes back has already moved
   * everything downstream of it — the clearest case in this subtree of what {@link Plan} records.
   */
  create(planId: string, item: NewItem): Promise<Plan>

  /**
   * Renames one item, re-estimates it, or both, moving it nowhere.
   *
   * Authorised per **present** field, as the feature route is: a `name` asks `item:rename`, an
   * `estimateDays` asks `item:estimate`, and a body carrying both is checked against both. This
   * route cannot half-refuse anyone today, because `policy.ts` grants both of those actions to
   * `write`. The feature route can, because `feature:pin` sits at `manage` there.
   *
   * So the split here is a seam for a later role split rather than a reason to send one field per
   * request — which is a reason the feature route does have, and which this route acquires the day
   * either of its two actions moves. Not a promise that an item body may carry both fields for good.
   *
   * The API refuses an empty body, so a call asking for nothing is a 422 rather than a write that
   * stamps `updatedAt` and changes nothing.
   */
  update(planId: string, itemId: string, change: ItemChange): Promise<Plan>

  /**
   * Moves one item within its feature or under another, renumbering both groups densely from zero.
   *
   * Needs a **`manage`** seat: `item:place` is granted to `manage` in `policy.ts`, beside
   * `feature:place`, while creating, renaming, re-estimating and describing an item are all `write`.
   * So a `write` seat can fill a feature in and never reorder it.
   *
   * The item crosses whole and its estimate crosses with it, which is why this answers the plan:
   * both features' spans change, and so does every bar downstream of either.
   */
  place(planId: string, itemId: string, to: ItemPlacement): Promise<Plan>

  /**
   * **Replaces** one item's description with the text given. Not an append, and not a patch.
   *
   * **Text over the cap is accepted, silently shortened, and answered 200.** Nothing on the wire
   * bounds it — `DescriptionPayload` is `{description: string}` with no length of its own — and the
   * only cap is `cleanDescription`'s `MAX_ITEM_DESCRIPTION_BYTES` of 8,192 **UTF-8 bytes** in
   * `@repo/macroplan-domain`, which **truncates at the last whole code point rather than refusing**.
   * So a caller that sends more gets a success, and the text it sent is not the text stored; the only
   * way to learn what was kept is to read it back with `plans.readItem`. A later task counts the
   * bytes in the field so a user is told before it happens, rather than after.
   *
   * The budget is UTF-8 **bytes** — not characters, and not the UTF-16 units `description.length`
   * counts. An emoji costs four bytes and two units, so a client validating on `.length` disagrees
   * with the server on any non-ASCII text — and always in the same direction, since no character
   * encodes to fewer bytes than it does UTF-16 units: 8,192 units of emoji is 16,384 bytes, twice the
   * budget, and a `.length` check waves it through. `ItemDocument.description` in `@repo/contracts`
   * does carry a `.max()` on the same number and it counts units; its own TSDoc calls that a backstop
   * and says not to read it as the real limit.
   *
   * The text is cleaned as well as capped: CRLF and a lone CR become a plain newline, and every C0
   * control character except tab and newline is stripped along with DEL. It is plain text, stored and
   * rendered as text, so there is no HTML sanitiser in the path and nothing here escapes markup.
   *
   * It answers the **plan**, and it is the one write in this subtree whose response is not what the
   * write produced: the domain's `writeDescription` answers the item, so the route reads the plan back
   * afterwards to answer what every other item write answers. That second read is outside the write's
   * lock on purpose — it can only ever be fresher, and a description moves no bar.
   *
   * Takes the text rather than a `{description}` object, for the reason
   * `features.setDependencies` gives: the body has one field, so the wrapper would be ceremony at
   * every call site. Its type is read off `DescriptionPayload` for the reason that method gives too —
   * renaming the field in the contract is then a compile error here rather than a body the API
   * silently strips. The read half of this pair is `plans.readItem`, which phase 2 put on `PlansApi`
   * and where it stays — moving it now would churn a shipped call site for tidiness.
   */
  describe(
    planId: string,
    itemId: string,
    description: Decoded<typeof DescriptionPayload>['description'],
  ): Promise<Plan>

  /**
   * Removes one item and the file holding its description, renumbering its group densely from zero.
   *
   * Needs a **`manage`** seat, like {@link ItemsApi.place}: `item:delete` is granted to `manage`
   * while every other write here is `write`, so a seat that can add an item cannot remove one.
   *
   * Its feature's span shrinks by exactly this item's estimate, so it answers the **plan that
   * remains** rather than `void`, for the reason {@link Plan} records.
   */
  remove(planId: string, itemId: string): Promise<Plan>
}

/**
 * Binds the item operations to a transport.
 *
 * The one operations module that **imports** an entity path instead of declaring a private one:
 * `planItemPath` is already exported from `paths.ts` because phase 2's `plans.readItem` needed it
 * first, and a private twin here would be a second spelling of one route. Only the collection path is
 * declared locally, because that one has no earlier caller to have exported it.
 */
export function itemsApi(transport: Transport): ItemsApi {
  return {
    create: (planId, item) =>
      transport.json({ method: 'POST', path: itemsPath(planId), body: item }, PlanView),
    update: (planId, itemId, change) =>
      transport.json(
        { method: 'PATCH', path: planItemPath(planId, itemId), body: change },
        PlanView,
      ),
    place: (planId, itemId, to) =>
      transport.json(
        { method: 'PATCH', path: `${planItemPath(planId, itemId)}/placement`, body: to },
        PlanView,
      ),
    describe: (planId, itemId, description) =>
      transport.json(
        {
          method: 'PUT',
          path: `${planItemPath(planId, itemId)}/description`,
          body: { description },
        },
        PlanView,
      ),
    remove: (planId, itemId) =>
      transport.json({ method: 'DELETE', path: planItemPath(planId, itemId) }, PlanView),
  }
}
