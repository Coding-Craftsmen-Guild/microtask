import type { PlanEpic } from './epic.js'
import type { PlanFeature } from './feature.js'
import type { PlanItem } from './item.js'
import type { PlanLabel } from './label.js'

/** One person's access to a plan, and who granted it. */
export interface PlanShareLink {
  readonly token: string
  readonly name: string
  readonly role: 'view' | 'write' | 'manage'
  readonly createdBy: string | null
  readonly createdAt: string
}

/**
 * Everything about a plan except its item descriptions. The canvas is one read of this.
 *
 * `epics`, `features` and `items` are three sibling arrays rather than items nested inside
 * features inside epics, mirroring `ProjectManifest.tasks` and its `folderId` in Microtask: a
 * move — a feature to another epic, an item to another feature — becomes one field change on one
 * record, and a manifest read stays a flat map over each array rather than a tree walk, which is
 * what lets `@repo/schedule` treat it as a `PlanStructure` with no transformation in between.
 *
 * `labels` is a fourth sibling array for the same reason and one more of its own: a group is a thing
 * features point at from any rail, so it is plan-level like a rail rather than a field on the features
 * in it (`entities/label.ts` argues that at length). It is the one of the four `@repo/schedule` never
 * sees — `PlanStructure` names epics, features and items — so no bar moves because a feature was
 * grouped.
 */
export interface PlanManifest {
  readonly id: string
  readonly name: string
  readonly startDate: string
  readonly sprintLengthDays: number
  readonly timezone: string
  readonly epics: readonly PlanEpic[]
  readonly labels: readonly PlanLabel[]
  readonly features: readonly PlanFeature[]
  readonly items: readonly PlanItem[]
  readonly shareLinks: readonly PlanShareLink[]
  readonly createdAt: string
  readonly updatedAt: string
}
