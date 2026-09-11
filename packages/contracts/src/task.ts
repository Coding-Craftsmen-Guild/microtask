import { z } from 'zod'
import { LIMITS } from './limits.js'
import { EntityId, EntityName } from './document.js'
import { Progress } from './progress.js'
import { Tab } from './tab.js'

/** How many tab names a manifest entry carries, matching the chips a list row draws. */
export const MAX_LISTED_TAB_NAMES = 8

/**
 * A task as the manifest knows it, carrying everything one list row renders (ADR 0034).
 *
 * `updatedAt`, `tabCount` and `tabNames` are cache fields with the same standing as
 * `progress` under ADR 0007: the task file is the source of truth, and an entry that disagrees
 * with it is recomputed when that task is read. They are here so a project page renders its whole
 * tree from one manifest read rather than one file read per row, which is the fan-out ADR 0005
 * exists to prevent.
 *
 * `tabNames` stops at {@link MAX_LISTED_TAB_NAMES} and `tabCount` is the honest total, so a
 * twelve-tab task arrives as eight chips and the number four. The app being replaced dropped
 * tabs nine and up with no indicator at all; the count is what lets this one say so.
 */
export const TaskEntry = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    folderId: EntityId.nullable(),
    progress: Progress,
    updatedAt: z.string(),
    tabCount: z.number().int().min(0).max(LIMITS.tabsPerTask),
    tabNames: z.array(EntityName).max(MAX_LISTED_TAB_NAMES).readonly(),
  })
  .meta({ id: 'TaskEntry', description: 'A task as its project manifest records it' })

/** The contents of one task file. */
export const TaskDocument = z
  .object({
    id: EntityId,
    tabs: z.array(Tab).max(LIMITS.tabsPerTask),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'TaskDocument', description: 'One task file: its tabs and nothing else' })
