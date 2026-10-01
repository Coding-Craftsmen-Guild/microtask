import { railNames } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'

const FIELD = String.fromCharCode(9)

const BETWEEN = String.fromCharCode(10)

const FIELDS = 3

/** The words the board draws for a rail no epic claims, so the drawer does not invent its own. */
export const UNCLAIMED_RAIL = 'Unclaimed rail'

/** One feature as the group drawer lists it: what it is, where it sits, and whether it is in. */
export interface GroupMember {
  readonly id: string

  readonly name: string

  /** Its rail's name, or {@link UNCLAIMED_RAIL}. */
  readonly rail: string

  readonly inGroup: boolean
}

/**
 * Every feature of the plan, with the rail it is on and whether this group holds it.
 *
 * ### Why every feature and not only the members
 *
 * The drawer is where a group is filled, so the list has to be the things that could be in it. A list
 * of only the current members would answer "what is in this group" and leave "put this in it" to the
 * feature's own drawer, one feature at a time — which is the workflow that made a group tedious
 * enough to be worth a panel in the first place.
 *
 * ### Why the rail is carried
 *
 * A group's whole point is that it cuts **across** rails (ADR 0064), so the rail is the one fact worth
 * stating beside a name: "two features, four rails apart" is what somebody made the group to see. The
 * join goes through `railNames`, the canvas's own, so an unclaimed rail is named in one place and this
 * cannot disagree with the board about what to call it.
 *
 * ### `inGroup` is equality against this label, not membership in any
 *
 * A feature carries one `labelId` (ADR 0064), so a feature in *another* group is out of this one and
 * its box is unchecked. Ticking it moves it here rather than adding it, which is what the field
 * already does from the other side, and is why the panel below says so in words.
 */
export function memberRows(plan: PlanScreenModel, labelId: string): readonly GroupMember[] {
  const rails = railNames(plan)
  return plan.features.map((feature) => ({
    id: feature.id,
    name: feature.name,
    rail: rails.get(feature.epicId) ?? UNCLAIMED_RAIL,
    inGroup: feature.labelId === labelId,
  }))
}

/**
 * Every row as one string, which is the only shape this list can cross a client boundary in.
 *
 * `module-boundaries.test.tsx` admits primitives, unbound functions and `null` across that boundary and
 * nothing else, and **an array of objects is not a primitive**. So the list is joined here, on the
 * server, and {@link splitMembers} undoes it inside the panel. `drawer/group-options.ts` carries the
 * long-form version of this argument; this is the same device with one more field.
 *
 * Fields are tab-separated and rows newline-separated, and both are safe because of what the values
 * are: an `EntityId` is a ULID, which holds neither, and `cleanName` collapses every run of whitespace
 * to a single space before a name is stored, so no stored name holds a tab or a newline. A name holding
 * ordinary spaces is therefore kept whole, which splitting on a space would not do.
 */
export const joinMembers = (rows: readonly GroupMember[]): string =>
  rows
    .map((row) => [row.id, row.name, row.rail, row.inGroup ? '1' : ''].join(FIELD))
    .join(BETWEEN)

/**
 * The rows a joined string names, in the order it named them.
 *
 * A line with too few fields is **dropped** rather than half-read. Every line this reads was written by
 * {@link joinMembers} one render earlier, so a short one cannot occur — and a row admitted with an
 * empty name would be an unlabelled checkbox that writes to a real feature, which is worse than a row
 * that is not offered at all.
 */
export function splitMembers(joined: string): readonly GroupMember[] {
  if (joined === '') return []
  return joined.split(BETWEEN).flatMap((line) => {
    const parts = line.split(FIELD)
    if (parts.length < FIELDS) return []
    return [{ id: parts[0] ?? '', name: parts[1] ?? '', rail: parts[2] ?? '', inGroup: parts[3] === '1' }]
  })
}
