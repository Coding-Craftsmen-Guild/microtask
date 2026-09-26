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

/** The largest a single estimate may be, in working days — about four years. */
export const MAX_ESTIMATE_DAYS = 1_000

/** The longest a sprint may be, in working days. */
export const MAX_SPRINT_LENGTH_DAYS = 60

/** The largest an item's plain-text description may be, in UTF-8 bytes. */
export const MAX_ITEM_DESCRIPTION_BYTES = 8_192

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
  plansPerProduct: 200,
  epicsPerPlan: 40,
  labelsPerPlan: 20,
  featuresPerPlan: 200,
  itemsPerPlan: 2_000,
  edgesPerPlan: 400,
  shareLinksPerPlan: 50,
} as const

/** A bound that can be exceeded. */
export type LimitKey = keyof typeof LIMITS

/** A bound on a collection. Name length is enforced by truncation, never by `assertWithin`. */
export type CountLimitKey = Exclude<LimitKey, 'nameLength'>

/**
 * A bound belonging to a plan rather than a project.
 *
 * Named so that a consumer serving only one product can say which half it means. It is written
 * out rather than derived from a `Plan` prefix, because a key is a name and a name is not a
 * type: `plansPerProduct` belongs here and does not begin with one.
 */
export type PlanCountKey =
  | 'plansPerProduct'
  | 'epicsPerPlan'
  | 'labelsPerPlan'
  | 'featuresPerPlan'
  | 'itemsPerPlan'
  | 'edgesPerPlan'
  | 'shareLinksPerPlan'

/**
 * The Microtask half of {@link CountLimitKey}: every collection bound that is not a plan's.
 *
 * The complement of {@link PlanCountKey}, so between the two every count bound is claimed by
 * exactly one product and neither half can be read as "the ones I happened to need".
 *
 * `Exclude` rather than a written list, and that is the load-bearing part: a **new Microtask** cap
 * lands in this type the moment it lands in `LIMITS`, and so breaks every exhaustive map over it
 * until each has been told what the new cap means. A new **plan** cap does not, because a plan cap
 * is no business of a consumer that serves only Microtask.
 */
export type MicrotaskCountKey = Exclude<CountLimitKey, PlanCountKey>
