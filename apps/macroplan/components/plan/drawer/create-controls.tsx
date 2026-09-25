'use client'

import type { NewFeature, NewItem } from '@repo/api-client'
import { EDITS, NEW_FEATURE_HINT, NEW_ITEM_HINT, type PlanCreate } from './field'
import { NewName } from './new-name'

/** Props for {@link CreateControls}. */
export interface CreateControlsProps {
  /** The plan both creates are addressed at. */
  readonly planId: string

  /** The rail a new feature joins, or `null` when no epic of this plan claims this subject's. */
  readonly railId: string | null

  /** The feature a new item joins: the open feature, or the open item's own parent. */
  readonly featureId: string

  /** Whether this surface draws the feature box. Never a gate (`lib/plan-capabilities.ts`). */
  readonly newFeature: boolean

  /** Whether it draws the item box. */
  readonly newItem: boolean

  /** Adds a feature at the end of the rail its draft names, and answers the recomputed plan. */
  readonly createFeature: PlanCreate<NewFeature>

  /** Adds an item at the end of the feature its draft names. */
  readonly createItem: PlanCreate<NewItem>
}

/**
 * Adding a feature to this subject's rail, or an item to its feature — the one group about a parent.
 *
 * ### Not subject-scoped, which is why it is mounted where it is
 *
 * Every other control in this drawer writes a field of the subject the panel is open on. Neither of
 * these does: `createFeature` needs a **rail** and `createItem` a **parent feature**, so a group scoped
 * to *this* item cannot mount "add an item" without inventing which feature it means. That is why this
 * is a sibling of the two bands rather than a control inside either, mounted by `./drawer-panel.tsx`,
 * which is what that file's own TSDoc reserves to itself. Both parents arrive as `values.place`,
 * resolved in the same single lookup as the row (`./subject.ts`), so neither this nor the frame above it
 * reaches for a plan to work out where the subject sits.
 *
 * It is also the one control group whose tier does not match its band. `feature:create` and
 * `item:create` are `write` actions (`WRITE` in `packages/kernel/src/access/policy.ts`), so this is not
 * `manage`-tier work — but `./drawer-edits.tsx` is the band of `write`-tier writes **about the
 * subject**, and these are not that. The tier split holds for both bands beside this one; this group is
 * outside it because it is outside the subject.
 *
 * ### Two actions cross here, and each box can reach one of them and one parent
 *
 * Both creates are handed to this one client component, where every other group takes a single write.
 * They are the two writes this group *is*, and the reason they cannot be reduced to one is that their
 * payloads differ — `CreateFeaturePayload` names an `epicId`, `CreateItemPayload` a `featureId`
 * (`packages/contracts/src/structure-payloads.ts`) — while a server-side wrapper that made them one
 * shape could not cross a client boundary at all, an arbitrary closure being unserialisable where an
 * action reference is not. That is React's own rule rather than a decision this repo took, and **no ADR
 * states it** — what this repo requires of the boundary on top of it is
 * `../module-boundaries.test.tsx`'s, which admits primitives, unbound functions, `null` and markup on
 * `children`. So each draft is built in the browser beside the box that typed
 * it, and each box is handed one closure over one action and one parent id.
 *
 * ### A parent and a name, and deliberately nothing else
 *
 * Spec §6: "a new item after the last item in its feature, a new feature after the last feature on its
 * epic's rail. Work is usually added in the order it will be done, so the common case requires no
 * placement at all." The position is the server's — `FeatureService.add` and `ItemService.add` each
 * append, and nothing in either payload can move it — so there is no placement control here, and
 * {@link NEW_FEATURE_HINT} states where the new thing lands rather than asking.
 *
 * **`CreateFeaturePayload` also accepts a `pinSprint`, and this control does not send one.** That field
 * is the authorisation gap `actions/features.ts` records: the create route asks `feature:create` and
 * nothing else, where a pin on a live feature is asked against `feature:pin`, which only `manage` holds
 * (`apps/api/src/routes/macroplan/features/handlers.ts`). A `write` seat creating a pre-pinned feature
 * would be moving a bar it would be refused the pin control for. The app does not *narrow* the action —
 * that would be a second copy of a policy only the API may hold — it has no control that offers the
 * field. `estimateDays`, which both payloads accept, is left off for the plainer reason that an estimate
 * is its own write behind its own gate, and a create carrying one would be two decisions in one gesture.
 *
 * ### A rail the plan does not hold draws no box
 *
 * `railId` is `null` for a feature whose `epicId` names no epic — `railsOf` gives such a feature a rail
 * of its own and the table words it `Unclaimed rail`, so the panel is on screen while
 * `FeatureService.add` would answer `assertEpic` with a 404 for that id (`./values.ts`). No box is a
 * better answer than one whose every submit fails, and the item box beside it is unaffected.
 *
 * A surface that may create neither draws no band: both children being `null` leaves this element
 * childless, and {@link EDITS}'s `empty:hidden` is what keeps a read-only seat from being shown a
 * bordered box with nothing in it — the same variant both bands beside this one are drawn in.
 */
export function CreateControls({
  planId,
  railId,
  featureId,
  newFeature,
  newItem,
  createFeature,
  createItem,
}: CreateControlsProps) {
  const rail = railId
  return (
    <div className={EDITS}>
      {newFeature && rail !== null ? (
        <NewName
          action="Add feature"
          add={(name) => createFeature(planId, { epicId: rail, name })}
          fieldId="plan-drawer-new-feature"
          hint={NEW_FEATURE_HINT}
          label="New feature on this rail"
        />
      ) : null}
      {newItem ? (
        <NewName
          action="Add item"
          add={(name) => createItem(planId, { featureId, name })}
          fieldId="plan-drawer-new-item"
          hint={NEW_ITEM_HINT}
          label="New item in this feature"
        />
      ) : null}
    </div>
  )
}
