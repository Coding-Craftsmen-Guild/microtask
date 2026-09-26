import type { Product } from '@repo/kernel'

/** The product tag this package's entities will live under. */
export const PRODUCT: Product = 'macroplan'

export type { EpicBinding } from './entities/binding.js'
export type { PlanEpic } from './entities/epic.js'
export type { PlanFeature } from './entities/feature.js'
export type { ItemDocument, PlanItem } from './entities/item.js'
export type { PlanLabel } from './entities/label.js'
export type { PlanManifest, PlanShareLink } from './entities/plan.js'
export {
  assertWithin,
  cleanDescription,
  cleanName,
  LIMITS,
  MAX_ITEM_DESCRIPTION_BYTES,
  type CountLimitKey,
  type LimitKey,
} from './limits.js'
export type { PlanStore } from './ports/plan-store.js'
export { FsPlanStore, type FsPlanStoreOptions } from './storage/fs-plan-store.js'
export { itemFile, itemsDir, manifestFile, planDir, plansDir } from './storage/paths.js'
export type { PlanContext } from './services/context.js'
export type { ItemRef, PlanRef } from './services/refs.js'
export { PlanService, type NewPlan, type PlanChanges } from './services/plan-service.js'
export { EpicService, type EpicChanges, type NewEpic } from './services/epic-service.js'
export {
  FeatureService,
  type FeatureChanges,
  type FeaturePlacement,
  type NewFeature,
} from './services/feature-service.js'
export { LabelService, type LabelChanges, type NewLabel } from './services/label-service.js'
export {
  ItemService,
  type ItemChanges,
  type ItemFound,
  type ItemPlacement,
  type NewItem,
} from './services/item-service.js'
export {
  PlanShareLinkService,
  type NewSeat,
  type SeatChanges,
} from './services/share-link-service.js'
export {
  planRoleOf,
  tellsBindings,
  visibleBinding,
  type EpicBindingView,
  type PlanEpicView,
} from './views/bridge-view.js'
export {
  itemView,
  itemViewFor,
  planListItem,
  planView,
  type ItemView,
  type PlanListItem,
  type PlanScheduleView,
  type PlanSpan,
  type PlanView,
} from './views/plan-view.js'
