/**
 * A group of features cutting across rails: a name, a colour, and nothing else.
 *
 * It belongs to the **plan** rather than to a rail, which is the whole of what it is for: a feature on
 * any rail may point at it, so "phase 1" is one thing with one name and one colour however many rails
 * its work is spread over. A colour written on each feature instead would let two features claiming to
 * be in one phase disagree about what colour that phase is, and renaming the phase would be a write to
 * every feature in it.
 *
 * There is no `position`, and that is a decision rather than an omission. A ULID opens with its
 * creation millisecond, so the ids labels are created with are already a total order, and nothing in
 * the product reorders them — a stored position would be a field with no writer that every reader
 * would still have to sort by.
 *
 * It is not a schedule input. `@repo/schedule` reads `PlanStructure`, which names epics, features and
 * items and no group at all, so no bar moves because of a label and a plan with every feature in one
 * group schedules exactly as the same plan with none.
 */
export interface PlanLabel {
  readonly id: string
  readonly name: string
  readonly colour: string
  readonly createdAt: string
  readonly updatedAt: string
}
