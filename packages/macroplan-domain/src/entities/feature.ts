/**
 * A feature placed on a rail: its own estimate, an optional sprint pin, and what it waits on.
 *
 * `estimateDays` is nullable rather than defaulted to zero, because zero is a real answer — a
 * milestone that takes no time — and `null` is the only spelling of "not estimated yet" that does
 * not collide with it; `@repo/schedule`'s forward pass reads that distinction directly.
 */
export interface PlanFeature {
  readonly id: string
  readonly epicId: string
  readonly name: string
  readonly position: number
  readonly estimateDays: number | null
  readonly pinSprint: number | null
  readonly dependsOn: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}
