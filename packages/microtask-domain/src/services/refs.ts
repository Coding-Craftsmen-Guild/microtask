import type { Product } from '@repo/kernel'

/**
 * Names one project.
 *
 * Reaching into a project takes both halves of its address, which is two values before any
 * payload; grouping them keeps every signature inside the parameter cap ADR 0027 sets, and
 * gives every service one call shape rather than some positional and some ref-based. That is
 * the same argument ADR 0030 makes for one construction shape.
 */
export interface ProjectRef {
  readonly product: Product
  readonly projectId: string
}

/** Names one task inside a project. */
export interface TaskRef extends ProjectRef {
  readonly taskId: string
}
