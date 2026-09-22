import { z } from 'zod'
import { EntityName } from './document.js'
import { IsoDate, PlanManifest, Position, RailColour, Timezone } from './plan.js'
import { Role } from './share-link.js'

/**
 * The body of the route that creates a plan.
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

/**
 * What a caller sends to mint a share link on a plan.
 *
 * No `scope` and no `planId`: a plan has exactly one shareable scope, the whole plan (spec §7.1
 * defers epic scope rather than foreclosing it), and the plan is already named by the route's
 * path. Microtask's own `CreateShareLinkPayload` must be given `scope` or `taskId` because a
 * project scope can span clients and the wider grant has to be asked for by name (ADR 0011) — a
 * Macroplan plan has no second client for its scope to span, so there is no choice for a caller to
 * make, and a `scope` field here would only be a second place to restate what the path already
 * says, free to disagree with it.
 *
 * There is no `UpdatePlanShareLinkPayload` either: Microtask's `UpdateShareLinkPayload` is already
 * closed to `{ name, role }` with no `scope` to freeze, so a plan link is renamed or reassigned a
 * role through that same schema, not a duplicate of it.
 */
export const CreatePlanShareLinkPayload = z
  .object({ name: EntityName, role: Role })
  .meta({ id: 'CreatePlanShareLinkPayload', description: 'A seat to mint on a plan: who for, what authority' })
