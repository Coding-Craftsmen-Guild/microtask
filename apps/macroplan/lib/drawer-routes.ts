import { planPath } from './routes'

const FEATURE_SEGMENT = 'f'

const ITEM_SEGMENT = 'i'

const drawerPath = (root: string, segment: string, id: string): string =>
  `${root}/${segment}/${encodeURIComponent(id)}`

/**
 * Where one feature is open on the admin surface: `/plans/<planId>/f/<featureId>`.
 *
 * ### Why a path at all, and why it is built here
 *
 * A selection is a **URL** and not a piece of component state, which is what lets a drawer be
 * linked to, reloaded, and reached by the browser's own Back. So every surface that can open one —
 * a bar on the canvas, a row of the table, a line of the conflict list, which name a feature or an
 * item id and nothing else (`ConflictSubject.id` says as much of its own) — needs the same path,
 * and none of them may build it by concatenation. That is the same rule `lib/routes.ts` states for
 * `planPath`: "a caller building a path by hand is how a `..` segment reaches a router".
 *
 * `encodeURIComponent` is therefore unconditional on the id, for that file's own reason: a feature
 * id is a ULID and normally needs no encoding, which is exactly why the one value that would need
 * it is the one that arrived from somewhere unexpected. The plan half is not encoded here at all —
 * it is {@link planPath}'s, which encodes it — so the two halves cannot disagree and a change to
 * how a plan is addressed moves every drawer path with it.
 *
 * ### `f` and `i`, one letter each
 *
 * A URL is read by people, and `/plans/<26 characters>/features/<26 characters>` is mostly
 * punctuation. `apps/microtask` made the same choice one product over — `/p/<projectId>/t/<taskId>`
 * — and these are the same two letters' worth of vocabulary for the two things a plan holds.
 * Neither can shadow anything: both are static segments under `[planId]`, whose only children they
 * are, so there is no dynamic sibling for the App Router to prefer one over (the ADR 0032
 * amendment `lib/routes.ts` cites is about exactly that, and does not arise here).
 *
 * ### The seat twins, which are deliberately not here yet
 *
 * `/s/<token>/f/<featureId>` and `/s/<token>/i/<itemId>` are the same two segments under
 * `linkPath`, and this module is where their builders belong — **when the pages that answer
 * them exist**. Exporting them now would ship two functions that build 404s, which is the one thing
 * `LINK_UNAVAILABLE_PATH` exists to avoid on that surface, and no test of any surface would cover
 * them. What must not drift is the spelling of the two segments, and that is already the case: they
 * are written once each above, so the seat builders arrive as two lines reusing them rather than as
 * a second opinion about what a drawer's URL looks like.
 */
export const featurePath = (planId: string, featureId: string): string =>
  drawerPath(planPath(planId), FEATURE_SEGMENT, featureId)

/** Where one item is open on the admin surface: `/plans/<planId>/i/<itemId>`. */
export const itemPath = (planId: string, itemId: string): string =>
  drawerPath(planPath(planId), ITEM_SEGMENT, itemId)
