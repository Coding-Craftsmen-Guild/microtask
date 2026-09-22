/** A unit of work under a feature, contributing to that feature's breakdown. */
export interface PlanItem {
  readonly id: string
  readonly featureId: string
  readonly name: string
  readonly position: number
  readonly estimateDays: number | null
  readonly linkedTaskId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * The contents of one item file: its description and nothing else.
 *
 * `description` is plain text, cleaned and byte-capped by `cleanDescription` (`limits.ts`) before
 * it ever reaches this shape — the contract's own `.max()` on the same field counts UTF-16 units
 * and is a backstop, not the real limit.
 */
export interface ItemDocument {
  readonly id: string
  readonly description: string
  readonly createdAt: string
  readonly updatedAt: string
}
