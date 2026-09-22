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
  | 'featuresPerPlan'
  | 'itemsPerPlan'
  | 'edgesPerPlan'
  | 'shareLinksPerPlan'

/**
 * A bound a Microtask archive can exceed, which is every bound that is not a plan's.
 *
 * `Exclude` rather than a written list, so a **new** Microtask cap still breaks every exhaustive
 * map over this type until it is given a meaning — which is the property the import refusals rely
 * on — while a new *plan* cap does not, because no import can reach one. Macroplan has no import
 * and the design spec records that it needs none.
 */
export type ImportCountKey = Exclude<CountLimitKey, PlanCountKey>
