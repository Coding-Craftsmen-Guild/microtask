import type { PlanEpic } from '../entities/epic.js'
import type { PlanFeature } from '../entities/feature.js'
import type { ItemDocument, PlanItem } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'

/** The one timestamp every fixture carries, so no comparison depends on the clock. */
export const STAMP = '2026-09-10T00:00:00.000Z'

/**
 * Builds a ULID-shaped id whose head says what it is, so a failure names the entity it is about.
 *
 * A real `ulid()` makes a multi-entity fixture unreadable — several 26-character strings
 * differing only in a random tail — and nothing downstream needs entropy: `isUlid` is a pattern
 * and not a checksum, so a marked id satisfies it, and `planDir()` and `itemFile()` alike.
 * Indices pad on the left, so ids built with one mark also sort in index order, which is what
 * lets a test assert the `id`-descending tiebreak `PlanStore.listManifests` promises.
 *
 * The mark has to stay inside Crockford base32 — `I`, `L`, `O` and `U` are **not** in it — or the
 * id is not a ULID and every guard in this package refuses it. So a mark is any Crockford-base32
 * consonant pair rather than the word it abbreviates. The pairs in use are deliberately not listed
 * here: the constraint is what callers have to obey, while an enumeration is a second place to
 * update every time a suite needs one more entity, and it had already drifted once.
 */
export const marked = (mark: string, index: number): string =>
  `${mark}${String(index).padStart(26 - mark.length, '0')}`

/** Builds a rail named Discovery at rail order 0, bound to nothing, before overrides. */
export function epic(id: string, overrides: Partial<PlanEpic> = {}): PlanEpic {
  return {
    id,
    name: 'Discovery',
    colour: '#3355ff',
    railOrder: 0,
    binding: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}

/**
 * Builds a feature on the rail named, estimated at three days and pinned to no sprint.
 *
 * `epicId` is a parameter rather than a default for the reason `dependsOn` starts empty: a feature
 * only means anything on a rail that exists, and a fixture defaulting it would put every feature on
 * the same invented rail silently. `estimateDays` is a number rather than `null` because `null` is
 * the interesting case — "not estimated yet", which `@repo/schedule` reads differently — and an
 * interesting case belongs in the test asking for it.
 */
export function feature(
  id: string,
  epicId: string,
  overrides: Partial<PlanFeature> = {},
): PlanFeature {
  return {
    id,
    epicId,
    name: 'Sign-up flow',
    position: 0,
    estimateDays: 3,
    pinSprint: null,
    dependsOn: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}

/** Builds an item under the feature named, linked to no Microtask task, before overrides. */
export function item(id: string, featureId: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id,
    featureId,
    name: 'Build the form',
    position: 0,
    estimateDays: 1,
    linkedTaskId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}

/** Builds the file contents for one item: a short plain-text description, before overrides. */
export function itemDocument(id: string, overrides: Partial<ItemDocument> = {}): ItemDocument {
  return {
    id,
    description: 'Wire the form to the API',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}

/**
 * Builds a plan named Launch holding no epics, features, items or share links, before overrides.
 *
 * The sprint length and timezone are the values `@repo/contracts` uses in its own plan fixtures,
 * so a manifest built here parses against `PlanManifest` should a caller ever want to check that —
 * this package stores the plain entity and validates nothing.
 */
export function planManifest(id: string, overrides: Partial<PlanManifest> = {}): PlanManifest {
  return {
    id,
    name: 'Launch',
    startDate: '2026-01-05',
    sprintLengthDays: 10,
    timezone: 'UTC',
    epics: [],
    features: [],
    items: [],
    shareLinks: [],
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  }
}
