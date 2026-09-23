import type { PlanManifest } from './plan.js'

/**
 * The order `PlanStore.listManifests` answers in: newest `updatedAt` first, ties by descending id.
 *
 * Defined **once** because the whole argument for defining a tiebreak at all is that two adapters
 * must not answer differently. `updatedAt` is an ISO instant, so two plans saved inside the same
 * millisecond carry the same one and sorting on that field alone leaves their relative order to
 * `Array.prototype.sort`'s stability — which preserves the input, and the input is a directory
 * listing for one adapter and a map's insertion order for another. Two character-identical copies of
 * this comparator, one per adapter, were the one place that argument could quietly stop being true.
 *
 * It lives beside the entity it orders rather than in either adapter's directory, because neither
 * adapter owns it: the in-memory store builds no paths and knows nothing of `storage/`, and the
 * order is the port's promise rather than the filesystem's.
 */
export const newestUpdateFirst = (a: PlanManifest, b: PlanManifest): number =>
  b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
