import type { PlanScope, Principal } from '@repo/kernel'
import { planView, type PlanManifest, type PlanShareLink, type PlanView } from '@repo/macroplan-domain'

/** One plan seat as the wire states it: the stored seat, plus the scope it necessarily has. */
export interface WirePlanSeat extends PlanShareLink {
  readonly scope: PlanScope
}

/** A plan as `@repo/contracts`' `PlanView` describes it, seats included where the caller may see them. */
export interface PlanBody extends Omit<PlanView, 'shareLinks'> {
  readonly shareLinks?: readonly WirePlanSeat[]
}

const seated = (planId: string, links: readonly PlanShareLink[]): readonly WirePlanSeat[] =>
  links.map((link) => ({ ...link, scope: { kind: 'plan', planId } }))

/**
 * One plan as a response carries it: the domain's view, with each seat's scope spelled out.
 *
 * The scope is the one field the two sides of this seam disagree about, and both sides are right.
 * A stored `PlanShareLink` carries **no** scope: a plan is shared at plan scope and nothing narrower
 * exists inside one (ADR 0053), so `PlanService` has no per-link scope to write and
 * `auth/link-directory.ts` derives one from the container the token was found in. `@repo/contracts`'
 * `PlanShareLink` **requires** one, so that a seat is self-describing to a client rather than only
 * meaningful beside the plan it arrived in — and its own suite pins that a project- or task-shaped
 * scope is refused there.
 *
 * So the derivation lives here, at the wire, where a response shape is this app's business. It can
 * only ever name the plan whose manifest the seat was just read from, which is the same derivation
 * `link-directory.ts` performs for authorization — one fact, spelled the same way in both places.
 *
 * `shareLinks` stays **absent** rather than empty when the caller is refused it: `planView` asks the
 * policy for `share:read` and answers `undefined`, and mapping `undefined` to `[]` here would turn
 * "you were not told" into "this plan has no seats" (ADR 0013).
 */
export function planBody(manifest: PlanManifest, principal: Principal): PlanBody {
  const { shareLinks, ...plan } = planView(manifest, principal)
  if (shareLinks === undefined) return plan
  return { ...plan, shareLinks: seated(manifest.id, shareLinks) }
}
