import type {
  FeatureChange,
  FeaturePlacement,
  FeaturesApi,
  ItemChange,
  ItemPlacement,
  NewEpic,
  NewFeature,
  NewItem,
  Plan,
} from '@repo/api-client'
import type { ActionResult } from '../../actions/result'

type Answer = Promise<ActionResult<Plan>>

type Estimate = Exclude<FeatureChange['estimateDays'], undefined>

type Pin = Exclude<FeatureChange['pinSprint'], undefined>

type Dependencies = Parameters<FeaturesApi['setDependencies']>[2]

type ItemEstimate = Exclude<ItemChange['estimateDays'], undefined>

/**
 * Every structural write a plan surface can ask for, each one a Server Action a page hands in.
 *
 * A prop rather than an import, so the same components render for a link holder with actions that
 * carry the seat's authority instead of the admin's: no component that renders a plan imports an
 * action, and one that gains a write takes this interface, so none of them decides whose credential a
 * write goes out under. That is a property of the plan subtree rather than a rule — no lint pattern
 * and no boundary test forbids an import from `actions/` under `components/`, and two modules there
 * make one: `admin-actions.ts` beside this file, the admin page's wiring, and
 * `components/shared/sign-out-form.tsx` — neither of them a plan surface. The prop is also what lets
 * a test hand a surface `vi.fn()`s typed off this interface rather than a live client.
 *
 * **Flat, for the guard it exists to pass.** `eachOrNoAnswer` (`@repo/app-session/no-answer`) maps
 * one level of `Object.entries`,
 * and its `Refusable` constraint admits only members that are functions answering a promise an
 * `ActionFailure` fits into. So a member that was itself an object of actions is a compile error at
 * the call rather than a wrapper discovered at runtime, and a member answering `Promise<void>` would
 * not typecheck into the guard either — which is why every member here answers `ActionResult<Plan>`.
 * That constrains each object handed to the guard and not how many there are: `apps/microtask` hands
 * it three, one per surface. This one is undivided for the reason `admin-actions.ts` records — a
 * surface gains an action without every page that renders it gaining an argument. No caller in this
 * app reaches the guard yet: every plan surface renders on the server, and it is a client component
 * that would need it.
 *
 * Every member answers the **whole plan** because every route behind it does. A drop therefore has
 * the authoritative timeline in the same round trip, and an undo reads the placement it is undoing
 * out of the plan the surface held before the drop rather than out of a shadow copy.
 *
 * One field per member, never a partial — the reason lives with the actions themselves
 * (`apps/macroplan/actions/features.ts`): the API authorises the fields a body carries, so a
 * two-field body meets two gates and the first refusal writes neither.
 */
export interface PlanEditActions {
  /** Adds a rail at the bottom of the plan. */
  createEpic: (planId: string, epic: NewEpic) => Answer

  /** Renames one rail. */
  renameEpic: (planId: string, epicId: string, name: string) => Answer

  /** Recolours one rail, which the API authorises as a rename. */
  recolourEpic: (planId: string, epicId: string, colour: string) => Answer

  /** Moves one rail among its siblings, counted from zero. */
  reorderEpic: (planId: string, epicId: string, railOrder: number) => Answer

  /** Removes one rail, its features and their items. */
  removeEpic: (planId: string, epicId: string) => Answer

  /** Adds a feature at the end of the rail its draft names. */
  createFeature: (planId: string, feature: NewFeature) => Answer

  /** Renames one feature. */
  renameFeature: (planId: string, featureId: string, name: string) => Answer

  /** Re-estimates one feature, or clears its estimate with `null`. */
  estimateFeature: (planId: string, featureId: string, estimateDays: Estimate) => Answer

  /** Pins one feature to a sprint it may not start before, or unpins it with `null`. */
  pinFeature: (planId: string, featureId: string, pinSprint: Pin) => Answer

  /** Moves one feature along its rail or onto another. */
  placeFeature: (planId: string, featureId: string, to: FeaturePlacement) => Answer

  /** Replaces the whole set of features one feature waits on; the API refuses a cycle as a 409. */
  setDependencies: (planId: string, featureId: string, dependsOn: Dependencies) => Answer

  /** Removes one feature, its items and every edge that named it. */
  removeFeature: (planId: string, featureId: string) => Answer

  /** Adds an item at the end of the feature its draft names. */
  createItem: (planId: string, item: NewItem) => Answer

  /** Renames one item. */
  renameItem: (planId: string, itemId: string, name: string) => Answer

  /** Re-estimates one item, or clears its estimate with `null`. */
  estimateItem: (planId: string, itemId: string, estimateDays: ItemEstimate) => Answer

  /** Replaces one item's description in full; the API shortens one over its byte cap. */
  describeItem: (planId: string, itemId: string, description: string) => Answer

  /** Moves one item inside its feature or under another, counted from zero. */
  placeItem: (planId: string, itemId: string, to: ItemPlacement) => Answer

  /** Removes one item and the file holding its description. */
  removeItem: (planId: string, itemId: string) => Answer
}
