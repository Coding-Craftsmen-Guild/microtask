/**
 * A feature placed on a rail: its own estimate, an optional sprint pin, and what it waits on.
 *
 * `estimateDays` is nullable rather than defaulted to zero, because zero is a real answer — a
 * milestone that takes no time — and `null` is the only spelling of "not estimated yet" that does
 * not collide with it; `@repo/schedule`'s forward pass reads that distinction directly.
 *
 * `labelId` names a `PlanLabel` of the same plan, or is `null` for a feature in no group. One id and
 * not a list: a feature is in one group at a time, which is what makes a group answer the question it
 * exists for — which phase this is in. The forward pass reads none of it.
 */
export interface PlanFeature {
  readonly id: string
  readonly epicId: string
  readonly name: string
  readonly position: number
  readonly estimateDays: number | null
  readonly pinSprint: number | null
  readonly labelId: string | null
  readonly dependsOn: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}
