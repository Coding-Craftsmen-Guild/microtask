/**
 * How deep a document may nest before a walk stops descending.
 *
 * Here rather than in the domain because a browser needs it too: it is what a rejected paste
 * means, and {@link countTasks} has to stop at the same depth the server does or an optimistic
 * progress badge would disagree with the cached one (ADR 0036).
 */
export const MAX_DOCUMENT_DEPTH = 100

/** The largest a stored document may be, in JSON bytes. What a 413 on a document write means. */
export const MAX_DOCUMENT_BYTES = 2_000_000

/**
 * Every collection count this product bounds. Also bounds what a share-link holder can create.
 *
 * One definition, read by the schemas below, by the domain's `assertWithin`, by the OpenAPI
 * document generated from those schemas, and by an app's form validation. The alternative was an
 * app hard-coding `40` and `80` and hoping they stayed in step (ADR 0036).
 */
export const LIMITS = {
  nameLength: 80,
  tabsPerTask: 40,
  tasksPerProject: 500,
  foldersPerProject: 100,
  shareLinksPerProject: 50,
  projectsPerProduct: 500,
} as const

/** A bound that can be exceeded. */
export type LimitKey = keyof typeof LIMITS

/** A bound on a collection. Name length is enforced by truncation, never by `assertWithin`. */
export type CountLimitKey = Exclude<LimitKey, 'nameLength'>
