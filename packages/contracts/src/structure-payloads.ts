import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { LIMITS } from './limits.js'
import { EstimateDays, Position, SprintIndex } from './plan.js'

/**
 * The body of the route that creates a feature on a rail.
 *
 * This file's side of the payload seam is everything that sits on a rail — features and items, and
 * so the estimates, pins, dependencies, group membership and descriptions only they carry; a plan's
 * own settings, its rails and the labels themselves are `plan-payloads.ts`, and a seat on a plan is `plan-share-payloads.ts`.
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
 *
 * The `.refine()` below is what the empty body costs: on `zod@4.6`, a refined object keeps `.shape`
 * and `.extend()` — which is what the OpenAPI generator walks — but `.omit()`, `.pick()`,
 * `.partial()` and `.merge()` all throw, and they throw **at construction**, so the failure lands
 * at import time rather than on a parse. Anything needing those four must be derived from the
 * unrefined object and refined afterwards; this repo's own idiom is exactly the shape that would
 * trip on it, `ProjectListItem` in `views.ts` being `ProjectView.omit({ shareLinks: true })`.
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

/**
 * The body of the route that puts one feature in a group, or takes it out of one.
 *
 * `labelId` is **nullable and required**, which is what separates this from every `PATCH` body in this
 * file: those make each field optional so an absent key leaves it alone, where this route replaces the
 * one field it is about. So `null` is the spelling of "in no group", and a body with no `labelId` at all
 * is a 422 rather than a write that clears the group by accident.
 *
 * Its own route and not a key on {@link UpdateFeaturePayload} because it is its own authority —
 * `feature:label` — and because the id it names is checked against the plan's own labels, which a body
 * that also carried a name would have done halfway through a rename.
 */
export const FeatureLabelPayload = z
  .object({ labelId: EntityId.nullable() })
  .meta({ id: 'FeatureLabelPayload', description: 'Which group a feature is in, or null for none' })

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
