import { z } from 'zod'
import { EntityName } from './document.js'
import { IsoDate, PlanManifest, Position, RailColour, Timezone } from './plan.js'

/**
 * The body of the route that creates a plan.
 *
 * This file's side of the payload seam is a plan and its rails — the bodies that set a calendar and
 * name, colour or reorder an epic; what sits on a rail is `structure-payloads.ts`, and a seat on a
 * plan is `plan-share-payloads.ts`.
 *
 * `sprintLengthDays` and `timezone` are optional rather than defaulted here: the service decides
 * the default for each, so a schema default would state that policy a second time, in a place it
 * can drift from the first.
 */
export const CreatePlanPayload = z
  .object({
    name: EntityName,
    startDate: IsoDate,
    sprintLengthDays: PlanManifest.shape.sprintLengthDays.optional(),
    timezone: Timezone.optional(),
  })
  .meta({ id: 'CreatePlanPayload', description: 'A plan to create: its name, its start date, its calendar' })

/**
 * The body of the route that edits a plan's own settings.
 *
 * Every field optional, none nullable: a plan's name, start date, sprint length and timezone are
 * always replaced, never cleared, so none of them needs a `null` to spell "unset".
 */
export const UpdatePlanPayload = z
  .object({
    name: EntityName.optional(),
    startDate: IsoDate.optional(),
    sprintLengthDays: PlanManifest.shape.sprintLengthDays.optional(),
    timezone: Timezone.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be given')
  .meta({ id: 'UpdatePlanPayload', description: "A plan's settings, at least one of them" })

/** The body of the route that creates a rail. */
export const CreateEpicPayload = z
  .object({ name: EntityName, colour: RailColour.optional() })
  .meta({ id: 'CreateEpicPayload', description: 'A rail to create: its name, and optionally its colour' })

/** The body of the route that renames a rail, recolours it, or both. */
export const UpdateEpicPayload = z
  .object({ name: EntityName.optional(), colour: RailColour.optional() })
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be given')
  .meta({ id: 'UpdateEpicPayload', description: 'A new name, a new colour, or both' })

/** The body of the route that reorders one rail among its siblings. */
export const EpicPlacementPayload = z
  .object({ railOrder: Position })
  .meta({ id: 'EpicPlacementPayload', description: 'Where a rail sits among its siblings' })
