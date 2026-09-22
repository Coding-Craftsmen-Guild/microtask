import type { PlanEpic } from './epic.js'
import type { PlanFeature } from './feature.js'
import type { PlanItem } from './item.js'

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
 */
export interface PlanManifest {
  readonly id: string
  readonly name: string
  readonly startDate: string
  readonly sprintLengthDays: number
  readonly timezone: string
  readonly epics: readonly PlanEpic[]
  readonly features: readonly PlanFeature[]
  readonly items: readonly PlanItem[]
  readonly shareLinks: readonly PlanShareLink[]
  readonly createdAt: string
  readonly updatedAt: string
}
