import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import type { ActionResult } from '../../../actions/result'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * One feature moved: the plan, the feature, and the rail and place it lands at.
 *
 * `PlanEditActions['placeFeature']` is assignable to it, so the drag boundary takes that one member as a
 * prop and cannot reach the other seventeen — the rule `../drawer/field.ts` states for `SubjectWrite`,
 * and the reason a surface's writes are a prop rather than an import (`../edit-actions.ts`).
 * `FeaturePlacement` and `Plan` arrive through `import type`, which is erased, so no client module here
 * imports `@repo/api-client` for a value.
 */
export type FeaturePlace = (
  planId: string,
  featureId: string,
  to: FeaturePlacement,
) => Promise<ActionResult<PlanScreenModel>>

/**
 * One item moved: the plan, the item, and the feature and place it lands at.
 *
 * The same shape and the same argument as {@link FeaturePlace}, for the second of the board's two drags.
 * They are separate types because they are separate permissions: a seat that may reorder a rail's
 * features is not thereby allowed to reparent their items, and a surface handed one and not the other
 * listens for exactly the one it has.
 */
export type ItemPlace = (
  planId: string,
  itemId: string,
  to: ItemPlacement,
) => Promise<ActionResult<PlanScreenModel>>
