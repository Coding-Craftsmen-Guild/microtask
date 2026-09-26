import { Conflict, Invalid } from '@repo/kernel'
import { findCycles } from '@repo/schedule'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanManifest } from '../entities/plan.js'
import { assertFeature } from './structure-mapper.js'

/**
 * How many dependency edges the whole plan states, which is what `edgesPerPlan` bounds.
 *
 * The plan and not one feature: a dependency is an edge rather than a feature, and every feature's
 * list draws against the one shared budget. So a caller adding to one list has to ask what total the
 * write would leave rather than how long that list is.
 */
export function edgeTotal(features: readonly PlanFeature[]): number {
  return features.reduce((running, each) => running + each.dependsOn.length, 0)
}

/**
 * Refuses an edge naming this feature itself, and one naming nothing in this plan.
 *
 * Both before the first store call, so a refusal writes nothing. The plan check is what keeps an edge
 * inside the plan directory (ADR 0050): an id from another plan is `Invalid` rather than an edge that
 * would be silently dropped by the forward pass and look like a scheduling decision.
 */
export function assertEdgesExist(
  manifest: PlanManifest,
  featureId: string,
  dependsOn: readonly string[],
): void {
  for (const id of dependsOn) {
    if (id === featureId) throw new Invalid('A feature cannot depend on itself')
    assertFeature(manifest, id)
  }
}

/**
 * Refuses the write when the features it would store hold a cycle anywhere.
 *
 * Stricter than "the cycle you just made", deliberately: the graph decided on is the one that would be
 * stored, so a plan whose volume was hand-edited into a cycle refuses edge writes until the cycle is
 * gone, and `schedule()` keeps reporting it meanwhile rather than a page breaking (spec §6).
 */
export function assertAcyclic(features: readonly PlanFeature[]): void {
  const cycles = findCycles(features)
  if (cycles.length === 0) return
  const named = cycles.map((cycle) => cycle.featureIds.join(', ')).join('; ')
  throw new Conflict(`These features would wait on each other: ${named}`)
}
