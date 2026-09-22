import { Invalid, NotFound } from '@repo/kernel'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanItem } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'
import { densified, placeAmong } from './positions.js'

interface Rail extends PlanEpic {
  readonly position: number
}

const onRails = (epics: readonly PlanEpic[]): readonly Rail[] =>
  epics.map((each) => ({ ...each, position: each.railOrder }))

const offRails = (rails: readonly Rail[]): readonly PlanEpic[] =>
  rails.map(({ position, ...each }) => ({ ...each, railOrder: position }))

/**
 * The epic that id names, or NotFound.
 *
 * The thing a caller asked for being absent is a NotFound; a *parent* a caller named being absent is
 * an Invalid, which is what {@link assertEpic} and {@link assertFeature} below throw. The two are
 * different sentences: "the feature you asked me to edit is gone" answers a stale page, and "the
 * rail you asked me to put it on is not in this plan" answers a bad field — and only the second can
 * be a cross-plan reference, which is the one ADR 0050 exists to refuse.
 */
export function pickEpic(manifest: PlanManifest, epicId: string): PlanEpic {
  const found = manifest.epics.find((each) => each.id === epicId)
  if (found === undefined) throw new NotFound('Epic not found')
  return found
}

/** The feature that id names, or NotFound. */
export function pickFeature(manifest: PlanManifest, featureId: string): PlanFeature {
  const found = manifest.features.find((each) => each.id === featureId)
  if (found === undefined) throw new NotFound('Feature not found')
  return found
}

/** The item that id names, or NotFound. */
export function pickItem(manifest: PlanManifest, itemId: string): PlanItem {
  const found = manifest.items.find((each) => each.id === itemId)
  if (found === undefined) throw new NotFound('Item not found')
  return found
}

/** Refuses a rail that is not in this plan, which includes one belonging to another plan. */
export function assertEpic(manifest: PlanManifest, epicId: string): void {
  if (!manifest.epics.some((each) => each.id === epicId)) {
    throw new Invalid(`No epic ${epicId} in this plan`)
  }
}

/** Refuses a feature that is not in this plan, which includes one belonging to another plan. */
export function assertFeature(manifest: PlanManifest, featureId: string): void {
  if (!manifest.features.some((each) => each.id === featureId)) {
    throw new Invalid(`No feature ${featureId} in this plan`)
  }
}

/** The features on one rail, in the order their positions give. */
export function railFeatures(manifest: PlanManifest, epicId: string): readonly PlanFeature[] {
  return densified(manifest.features.filter((each) => each.epicId === epicId))
}

/** The items under one feature, in the order their positions give. */
export function featureItems(manifest: PlanManifest, featureId: string): readonly PlanItem[] {
  return densified(manifest.items.filter((each) => each.featureId === featureId))
}

/**
 * The epics with one of them moved to a rail order, the rest renumbered densely.
 *
 * An epic orders by `railOrder` where a feature and an item order by `position`, so this is the one
 * place that translates between the two: `placeAmong` is written over `position` because that is
 * what both other levels carry, and a second copy of the reinsertion rule keyed on `railOrder`
 * would be the same rule twice. The field keeps its own name on the entity because a rail order is
 * what a canvas reads to lay out lanes, not a position inside a parent — an epic has no parent.
 */
export function placedRail(
  epics: readonly PlanEpic[],
  epicId: string,
  railOrder: number,
): readonly PlanEpic[] {
  return offRails([...placeAmong(onRails(epics), epicId, railOrder)])
}

/** The epics renumbered densely from zero in the rail order they already have, moving nothing. */
export function densifiedRails(epics: readonly PlanEpic[]): readonly PlanEpic[] {
  return offRails([...densified(onRails(epics))])
}

/**
 * Every group of features renumbered densely from zero, the manifest array order kept.
 *
 * Per rail, because a position means "where on this rail" and the rails are independent: closing a
 * gap on one must not touch another. The array order of `manifest.features` is preserved rather
 * than rebuilt rail by rail, so a delete leaves a manifest whose arrays are in the order they
 * arrived in and only the records that had to change have changed.
 */
export function densifiedFeatures(features: readonly PlanFeature[]): readonly PlanFeature[] {
  const renumbered = new Map<string, PlanFeature>()
  for (const epicId of new Set(features.map((each) => each.epicId))) {
    const rail = densified(features.filter((each) => each.epicId === epicId))
    for (const each of rail) renumbered.set(each.id, each)
  }
  return features.map((each) => renumbered.get(each.id) ?? each)
}

/** Every group of items renumbered densely from zero per feature, the manifest array order kept. */
export function densifiedItems(items: readonly PlanItem[]): readonly PlanItem[] {
  const renumbered = new Map<string, PlanItem>()
  for (const featureId of new Set(items.map((each) => each.featureId))) {
    const group = densified(items.filter((each) => each.featureId === featureId))
    for (const each of group) renumbered.set(each.id, each)
  }
  return items.map((each) => renumbered.get(each.id) ?? each)
}
