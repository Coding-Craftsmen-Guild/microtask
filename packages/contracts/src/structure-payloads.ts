import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { LIMITS } from './limits.js'
import { EstimateDays, Position, SprintIndex } from './plan.js'

/**
 * The body of the route that creates a feature on a rail.
 *
 * `estimateDays` and `pinSprint` are each nullable and optional: a feature is usually created
 * with neither, so both may be left off the body, and `null` is there for a caller that wants to
 * say "no estimate yet" or "no pin" explicitly rather than by omission.
 */
export const CreateFeaturePayload = z
  .object({
    epicId: EntityId,
    name: EntityName,
    estimateDays: EstimateDays.nullable().optional(),
    pinSprint: SprintIndex.nullable().optional(),
  })
  .meta({
    id: 'CreateFeaturePayload',
    description: 'A feature to create: its rail, its name, its estimate, its pin',
  })

/**
 * The body of the route that edits a feature's own fields.
 *
 * `undefined` and `null` differ on `estimateDays` and `pinSprint`: omitting either leaves it as
 * it was, `null` clears it. Collapsing the two into one optional would leave "clear it" with no
 * spelling of its own.
 */
export const UpdateFeaturePayload = z
  .object({
    name: EntityName.optional(),
    estimateDays: EstimateDays.nullable().optional(),
    pinSprint: SprintIndex.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be given')
  .meta({
    id: 'UpdateFeaturePayload',
    description: 'A new name, a new estimate, a new pin, or a clear of either',
  })

/** The body of the route that moves a feature to another rail, or to another spot on its own. */
export const FeaturePlacementPayload = z
  .object({ epicId: EntityId, position: Position })
  .meta({ id: 'FeaturePlacementPayload', description: 'Which rail a feature sits on, and where on it' })

/**
 * The body of the route that replaces one feature's dependencies.
 *
 * Bounded by `LIMITS.edgesPerPlan`, the plan-wide edge budget, rather than by how many features a
 * plan may hold: a dependency is an edge, not a feature, and every feature's list draws against
 * that one shared cap.
 */
export const DependenciesPayload = z
  .object({ dependsOn: z.array(EntityId).max(LIMITS.edgesPerPlan).readonly() })
  .meta({ id: 'DependenciesPayload', description: 'Every feature this one depends on' })

/** The body of the route that creates an item under a feature. */
export const CreateItemPayload = z
  .object({ featureId: EntityId, name: EntityName, estimateDays: EstimateDays.nullable().optional() })
  .meta({ id: 'CreateItemPayload', description: 'An item to create: its feature, its name, its estimate' })

/** The body of the route that edits an item's own fields; `null` clears its estimate. */
export const UpdateItemPayload = z
  .object({ name: EntityName.optional(), estimateDays: EstimateDays.nullable().optional() })
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be given')
  .meta({ id: 'UpdateItemPayload', description: 'A new name, a new estimate, or a clear of it' })

/** The body of the route that moves an item to another feature, or to another spot on its own. */
export const ItemPlacementPayload = z
  .object({ featureId: EntityId, position: Position })
  .meta({ id: 'ItemPlacementPayload', description: 'Which feature an item sits under, and where' })

/** The body of the route that replaces an item's description. */
export const DescriptionPayload = z
  .object({ description: z.string() })
  .meta({ id: 'DescriptionPayload', description: "An item's description, in full" })
