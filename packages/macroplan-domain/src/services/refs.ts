import type { Product } from '@repo/kernel'

/**
 * Names one plan.
 *
 * Reaching into a plan takes both halves of its address, which is two values before any payload;
 * grouping them keeps every signature inside the parameter cap ADR 0027 sets, and gives every
 * service one call shape rather than some positional and some ref-based — the same argument ADR
 * 0030 makes for one construction shape. Mirrors `ProjectRef` in `@repo/microtask-domain`, which
 * this package may not import (ADR 0014): the shape is copied, not shared.
 */
export interface PlanRef {
  readonly product: Product
  readonly planId: string
}

/** Names one item inside a plan. */
export interface ItemRef extends PlanRef {
  readonly itemId: string
}
