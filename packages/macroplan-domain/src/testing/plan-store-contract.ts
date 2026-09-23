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
 * The cases live in three sibling files — reads, writes, and the copy cases — and the split is by
 * what a case **asserts**, not by any line count. No cap is in play: ADR 0027 turns `max-lines` and
 * `max-lines-per-function` off for every `testing` directory precisely so that a contract suite need
 * not be scattered to fit one, and it says so about `describeProjectStore` in as many words. Nor does the
 * file a case sits in show up in a failure — every one of them registers its `it()` into the single
 * `describe` opened below, so what a runner prints is the adapter's name and the case's.
 *
 * What the split buys is a reader: the copy cases are the property most easily faked and the hardest
 * to notice missing, so they are worth finding in one place rather than spread through the writes.
 */
export function describePlanStore(name: string, makeHarness: () => PlanStoreHarness): void {
  describe(`${name} — PlanStore contract`, () => {
    const harness = makeHarness()
    describePlanReads(harness)
    describePlanWrites(harness)
    describePlanCopying(harness)
  })
}
