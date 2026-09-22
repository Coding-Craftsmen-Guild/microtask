import type { Product } from '@repo/kernel'

/** The product tag this package's entities will live under. */
export const PRODUCT: Product = 'macroplan'

export type { EpicBinding } from './entities/binding.js'
export type { PlanEpic } from './entities/epic.js'
export type { PlanFeature } from './entities/feature.js'
export type { ItemDocument, PlanItem } from './entities/item.js'
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
export { itemFile, itemsDir, manifestFile, planDir, plansDir } from './storage/paths.js'
