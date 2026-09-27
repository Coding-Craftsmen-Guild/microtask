import { linkPath, planPath } from './routes'

const FEATURE_SEGMENT = 'f'

const ITEM_SEGMENT = 'i'

const drawerPath = (root: string, segment: string, id: string): string =>
  `${root}/${segment}/${encodeURIComponent(id)}`
/**
 * How one surface addresses its drawer: a builder per kind, taking that surface’s own root identifier.
 *
 * The first argument is a **plan id on the admin surface and a share token on the seat's**, which is why
 * this is one interface rather than two: both surfaces reach a drawer by one opaque string plus the id of
 * what is open, and a component drawing a link needs no opinion about which kind of string it holds.
 *
 * It exists because `ConflictList` used to import the admin builders directly, which is what kept it off
 * the seat surface: every link it drew went to `/plans/…`, and a seat holder following one would meet a
 * login with no password behind it (ADR 0032). Handing the pair in moved that decision to the page, which
 * is the only thing that knows which surface is rendering.
 */
export interface DrawerRoutes {
  /** Where one feature is open on this surface. */
  readonly feature: (root: string, featureId: string) => string

  /** Where one item is open on this surface. */
  readonly item: (root: string, itemId: string) => string
}

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
 * **The conflict list is the first caller, and for the moment the only one.** The table row was
 * expected to be — nothing has turned one into a link yet — and a bar on the canvas still is not one
 * either, so these paths were built before anything linked to them and the two pages they address
 * existed before any link did. What calls them now is `components/plan/conflicts/conflict-list.tsx`,
 * where every subject a conflict names is a link to the control that would fix it; it is the reason
 * that list is worth more than a badge. Both builders are spent there, because `unscheduled` names
 * items as well as features.
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
 * ### The seat twins, which are here now
 *
 * `/s/<token>/f/<featureId>` and `/s/<token>/i/<itemId>` are the same two segments under `linkPath`, and
 * this module said they belonged here **when the pages that answer them exist**. They do, so they are
 * {@link SEAT_DRAWER_ROUTES} below — two lines reusing the segment constants rather than a second opinion
 * about what a drawer's URL looks like, which is exactly what keeping the spelling in one place was for.
 */
export const featurePath = (planId: string, featureId: string): string =>
  drawerPath(planPath(planId), FEATURE_SEGMENT, featureId)

/** Where one item is open on the admin surface: `/plans/<planId>/i/<itemId>`. */
export const itemPath = (planId: string, itemId: string): string =>
  drawerPath(planPath(planId), ITEM_SEGMENT, itemId)

const SEAT_FEATURE = (token: string, featureId: string): string =>
  drawerPath(linkPath(token), FEATURE_SEGMENT, featureId)

const SEAT_ITEM = (token: string, itemId: string): string =>
  drawerPath(linkPath(token), ITEM_SEGMENT, itemId)

/**
 * Where one feature is open on the **seat** surface: `/s/<token>/f/<featureId>`.
 *
 * The twin this module said belonged here "**when the pages that answer them exist**". They exist, so it
 * is here: the same two segments under {@link linkPath} instead of {@link planPath}, reusing the same two
 * one-letter constants so the spelling of a drawer's URL cannot differ between the surfaces.
 *
 * ### Why the pair is a record and not two exported functions
 *
 * {@link DrawerRoutes} is what `ConflictList` takes. That list draws a link per subject and had these
 * builders **imported**, which made every link it drew an admin path — and it was mounted on the admin
 * surface only, for exactly that reason: a seat holder following one would be sent to `/plans/…`, a surface
 * that reads a cookie they have not got, and on to a login with no password behind it (ADR 0032). Handing
 * the pair in is what let that list be mounted on both, and it is why the two surfaces each name their own
 * record rather than the component choosing.
 */
export const SEAT_DRAWER_ROUTES: DrawerRoutes = { feature: SEAT_FEATURE, item: SEAT_ITEM }

/**
 * The admin surface's own pair, which is {@link featurePath} and {@link itemPath} as a record.
 *
 * The same two functions, named together so a surface hands one value rather than two and cannot hand a
 * feature builder from one surface beside an item builder from the other.
 */
export const ADMIN_DRAWER_ROUTES: DrawerRoutes = { feature: featurePath, item: itemPath }
