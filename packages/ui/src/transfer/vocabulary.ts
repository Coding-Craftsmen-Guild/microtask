/** What a share link may reach, as a preview is allowed to describe it. */
export type TransferScope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }

/**
 * One share link a dropped bundle asserts, named by its position and never by its token.
 *
 * `role` is a plain string rather than this repo's three-role union because this package is
 * shared by two products and must not learn one product's vocabulary (ADR 0014): the panel
 * renders whatever word the wire carried, which is also what keeps an attacker-chosen
 * `manage` visible rather than folded into an "unknown" bucket.
 */
export interface TransferShareLink {
  /** The link's position in the preview, which is how a confirm names it without its token. */
  readonly index: number
  /** The link's display name, or `''` for one that never had a name. */
  readonly name: string
  /** The authority the link asserts, rendered verbatim. */
  readonly role: string
  /** What the link reaches. */
  readonly scope: TransferScope
}

/** What a preview says will happen to one group: it imports, it is refused, or it is broken. */
export type TransferOutcome = 'importable' | 'blocked' | 'error'

/** What a confirm did with one project. */
export type TransferWriteOutcome = 'created' | 'replaced' | 'skipped' | 'blocked' | 'failed'

/** What to do with a project the target store already holds. */
export type ConflictChoice = 'skip' | 'new' | 'replace'

/** One project and the choice an admin made for it. */
export interface ProjectChoice {
  /** The project the choice applies to. */
  readonly projectId: string
  /** Skip it, import it as new, or replace it. */
  readonly choice: ConflictChoice
}

/**
 * One group of dropped files and what will happen to it, structurally as the wire carries it.
 *
 * Restated here rather than imported from a contracts package because `packages/ui` is shared by
 * two products and may not depend on one product's wire shapes (ADR 0014, and the amendment on
 * ADR 0018 that measured the same wall for `harvest.ts`). Every member is widened to the
 * narrowest type the panel actually reads, so a parsed `ImportPreviewGroup` is assignable here
 * without a cast while nothing in this package can name a microtask entity.
 */
export interface TransferGroup {
  /** The normalised relative path the group was harvested under. */
  readonly path: string
  /** What the group was detected as, rendered verbatim. */
  readonly shape: string
  /** The project id the group claims, or null when there is none to report. */
  readonly projectId: string | null
  /** The project's name, or `''` when the group has none. */
  readonly name: string
  /** Tasks the manifest names, or null when no manifest was found at all. */
  readonly manifestTaskCount: number | null
  /** Task documents the group actually carries. */
  readonly taskFilesFound: number
  /** Every link the group asserts, in preview order. */
  readonly shareLinks: readonly TransferShareLink[]
  /** Whether the target store already holds a project with this id. */
  readonly existsInTarget: boolean
  /** Whether the group will import, and whether it was even read. */
  readonly outcome: TransferOutcome
  /** Every reason a group that will not import gave. */
  readonly reasons: readonly string[]
}

/** Everything staged under one import session, group by group. */
export interface TransferPreview {
  /** The staged session the groups belong to. */
  readonly sessionId: string
  /** One row per dropped directory group. */
  readonly groups: readonly TransferGroup[]
}

/** One project a confirm handled, and what became of it. */
export interface TransferProjectResult {
  /** The preview row's path, which is how this joins the table that was rendered. */
  readonly path: string
  /** The preview row's project id, or null when it had none. */
  readonly projectId: string | null
  /** Where the project actually landed, which differs after a remint. */
  readonly writtenProjectId: string | null
  /** The choice that was applied, or null when the project needed none. */
  readonly choice: ConflictChoice | null
  /** What the confirm did with the project. */
  readonly outcome: TransferWriteOutcome
  /** Tasks written. */
  readonly tasksWritten: number
  /** Tasks the replace removed because the bundle did not carry them. */
  readonly tasksRemoved: number
  /** Share links that got new URLs. */
  readonly shareLinksReminted: number
  /** Links kept from disk whose task the admin has just chosen to drop. */
  readonly shareLinksStranded: number
  /** Every reason a project that did not land gave. */
  readonly reasons: readonly string[]
}

/** What one confirm did, project by project. */
export interface TransferResult {
  /** The session that was applied. */
  readonly sessionId: string
  /** One row per project the confirm handled. */
  readonly projects: readonly TransferProjectResult[]
}

/** One harvested file and the path it was dropped or picked under. */
export interface HarvestedFile {
  /** The path the browser reported, decoded into the one encoding the server expects. */
  readonly path: string
  /** The file itself, which the panel only ever measures. */
  readonly file: File
}
