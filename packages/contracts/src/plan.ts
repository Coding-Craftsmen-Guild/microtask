import { z } from 'zod'
import { LIMITS, MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES, MAX_SPRINT_LENGTH_DAYS } from './limits.js'
import { EntityId, EntityName } from './document.js'
import { ShareLink } from './share-link.js'

/**
 * A calendar date with no time and no zone: the one date a plan carries.
 *
 * Every other date in a plan is derived — `startDate` plus a working-day offset, resolved by
 * `@repo/schedule`'s calendar math — so this is the only place a date is typed rather than
 * computed, and it stays a plain `YYYY-MM-DD` string rather than a `Date` so no client can smuggle
 * a time or an offset into the one field a plan is allowed to date itself by.
 */
export const IsoDate = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'must be YYYY-MM-DD')
  .meta({ id: 'IsoDate', description: 'A YYYY-MM-DD calendar date, with no time and no zone' })

/**
 * An IANA time-zone name, accepted only if this runtime's own `Intl` can resolve it.
 *
 * Checked against `Intl.DateTimeFormat` rather than a maintained list of zone names, because the
 * set `Intl` resolves already tracks the tz database this runtime ships — a second list here would
 * drift the moment either one is upgraded. `todayIn` (`@repo/schedule`) throws `RangeError` for a
 * zone `Intl` cannot resolve, deliberately, rather than silently falling back to UTC; this
 * refinement is what turns that throw into a rejected write instead of a stored manifest that
 * fails every later read.
 */
export const Timezone = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'must be a time zone this runtime can resolve')
  .meta({ id: 'Timezone', description: 'An IANA time-zone name this runtime can resolve' })

/** A non-negative whole number of working days. Zero is a milestone: reached, but taking no time. */
export const EstimateDays = z
  .number()
  .int()
  .min(0)
  .max(MAX_ESTIMATE_DAYS)
  .meta({ id: 'EstimateDays', description: 'A non-negative whole number of working days' })

/**
 * Which sprint a feature is pinned to, 0-based, as a lower bound and nothing else.
 *
 * There is no upper bound here: a plan's sprint count falls out of the schedule it produces, it is
 * never authored, so a pin naming a sprint past today's horizon is not a mistake to reject — it is
 * a constraint the forward pass has not grown into yet, and it starts to bind the moment enough
 * work is queued ahead of it.
 */
export const SprintIndex = z
  .number()
  .int()
  .min(0)
  .meta({ id: 'SprintIndex', description: 'A 0-based sprint number, with no upper bound' })

/** A dense 0-based order within one parent: no gaps, no ties, reassigned on every move. */
export const Position = z
  .number()
  .int()
  .min(0)
  .meta({ id: 'Position', description: 'A dense 0-based order within one parent' })

/**
 * A rail's hue, as a lowercase six-digit hex colour.
 *
 * Lowercase is enforced rather than normalised, so `#ABCDEF` and `#abcdef` never both reach
 * storage as "the same" colour picked two different ways — one canonical spelling per colour is
 * what lets a client compare rail colours with `===`.
 */
export const RailColour = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, 'must be #rrggbb')
  .meta({ id: 'RailColour', description: 'A lowercase #rrggbb colour' })

/**
 * What an epic is bound to in Microtask. Reserved by phase 1; written by phase 4.
 *
 * The field exists now, nullable, so a phase-1 manifest and a phase-4 manifest are the same shape:
 * phase 4 adds a writer for this field, not a migration that adds the field. `sealedToken` is
 * opaque here on purpose — verifying it is Microtask's job, at the moment a bound epic is read, not
 * a claim this schema can check.
 */
export const EpicBinding = z
  .object({
    projectId: EntityId,
    role: z.enum(['view', 'manage']),
    sealedToken: z.string().min(1),
  })
  .meta({ id: 'EpicBinding', description: 'A live link from one epic to one Microtask project' })

/** A horizontal rail on the timeline: features are placed on it, never inside it. */
export const PlanEpic = z
  .object({
    id: EntityId,
    name: EntityName,
    colour: RailColour,
    railOrder: Position,
    binding: EpicBinding.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlanEpic', description: 'A rail on the timeline, and what it is bound to, if anything' })

/**
 * A feature placed on a rail: its own estimate, an optional sprint pin, and what it waits on.
 *
 * `estimateDays` is nullable rather than defaulted to zero, because zero is a real answer — a
 * milestone that takes no time — and `null` is the only spelling of "not estimated yet" that does
 * not collide with it; the forward pass reads that distinction directly (`ScheduleFeature`).
 */
export const PlanFeature = z
  .object({
    id: EntityId,
    epicId: EntityId,
    name: EntityName,
    position: Position,
    estimateDays: EstimateDays.nullable(),
    pinSprint: SprintIndex.nullable(),
    dependsOn: z.array(EntityId).max(LIMITS.edgesPerPlan).readonly(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlanFeature', description: 'A feature on one rail, its estimate, its pin, and its dependencies' })

/** A unit of work under a feature, contributing to that feature's breakdown. */
export const PlanItem = z
  .object({
    id: EntityId,
    featureId: EntityId,
    name: EntityName,
    position: Position,
    estimateDays: EstimateDays.nullable(),
    linkedTaskId: EntityId.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlanItem', description: 'One unit of work under a feature' })

/**
 * Everything about a plan except its item descriptions. The canvas is one read of this.
 *
 * `epics`, `features` and `items` are three sibling arrays rather than items nested inside
 * features inside epics, mirroring `ProjectManifest.tasks` and its `folderId`. Flat beats nested
 * here for three reasons at once: the plan-wide caps in `LIMITS` are then a `.max()` on the exact
 * array they bound, where nesting would turn each cap into a per-parent bound plus a service-level
 * check that the per-parent bounds actually add up to it; a move — a feature to another epic, an
 * item to another feature — becomes one field change on one record instead of a splice out of one
 * array and into another; and a manifest read stays one flat map over each array rather than a
 * tree walk, which is what lets `@repo/schedule` treat it as a `PlanStructure` with no
 * transformation in between.
 */
export const PlanManifest = z
  .object({
    id: EntityId,
    name: EntityName,
    startDate: IsoDate,
    sprintLengthDays: z.number().int().min(1).max(MAX_SPRINT_LENGTH_DAYS),
    timezone: Timezone,
    epics: z.array(PlanEpic).max(LIMITS.epicsPerPlan),
    features: z.array(PlanFeature).max(LIMITS.featuresPerPlan),
    items: z.array(PlanItem).max(LIMITS.itemsPerPlan),
    shareLinks: z.array(ShareLink).max(LIMITS.shareLinksPerPlan),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlanManifest', description: 'A plan manifest: epics, features, items and share links' })

/**
 * The contents of one item file: its description and nothing else.
 *
 * `description`'s `.max()` bounds UTF-16 code units, because that is the only unit a `string`
 * schema can count — it is a backstop, not the real limit. `MAX_ITEM_DESCRIPTION_BYTES` is a UTF-8
 * byte cap, enforced in the domain (Task 11) where the actual encoded size is known. Do not
 * "tighten" this `.max()` to look byte-accurate: a multi-byte character makes a character count and
 * a byte count disagree, and this repo has already shipped that exact mistake once.
 */
export const ItemDocument = z
  .object({
    id: EntityId,
    description: z.string().max(MAX_ITEM_DESCRIPTION_BYTES),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ItemDocument', description: 'One item file: its description and nothing else' })
