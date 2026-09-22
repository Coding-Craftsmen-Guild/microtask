import { describe } from 'vitest'
import type { PlanStoreHarness } from './plan-store-harness.js'
import { describePlanCopying } from './plan-store-cases-copy.js'
import { describePlanReads } from './plan-store-cases-read.js'
import { describePlanWrites } from './plan-store-cases-write.js'

export type { PlanStoreHarness } from './plan-store-harness.js'

/**
 * Runs the behaviour every PlanStore adapter must exhibit.
 *
 * **It says nothing about write ordering**, which is the one promise `PlanStore` makes that cannot
 * be observed from inside a sequential case: both orderings leave the same state behind once both
 * writes have happened, so a memory adapter doing them in either order passes every case here.
 * Order is asserted where it is visible — in `fs-plan-store.test.ts`, against a `FileSystem` that
 * throws on the second write of each mutation — and a contract case would need a harness hook for
 * "interrupt this operation", which is the kind of adapter-specific probe the optional hooks on
 * {@link PlanStoreHarness} already keep to a minimum.
 *
 * The cases live in three sibling files — reads, writes, and the four copy cases — so that each
 * stays inside the 150-line cap ADR 0027 sets, and so that a failure's file name already says
 * which half of the port broke. The split is by what a case *asserts* rather than by a line count:
 * the copy cases in particular are the property most easily faked, and are worth finding together.
 */
export function describePlanStore(name: string, makeHarness: () => PlanStoreHarness): void {
  describe(`${name} — PlanStore contract`, () => {
    const harness = makeHarness()
    describePlanReads(harness)
    describePlanWrites(harness)
    describePlanCopying(harness)
  })
}
