import { planControls, type PlanControls, type PlanSeatControls } from './plan-capabilities'

const EVERY_SEAT_ANSWER: PlanSeatControls = {
  read: true,
  create: true,
  update: true,
  revoke: true,
}

/**
 * Every control there is, drawn: what the admin surface passes where a seat passes
 * `planCapabilities`.
 *
 * The admin is **not a role**, so there is nothing to pass through the projection. `can()` answers
 * `true` on `principal.kind === 'admin'` before any scope, grant list or target is consulted
 * (`packages/kernel/src/access/policy.ts`), and an admin holds no scope at all — a page rendering
 * for one is rendering for every plan. A synthetic fourth role invented to feed
 * `planCapabilities` would need a scope to be asked about, and deciding what that scope
 * answered would be a second policy living in a client, disagreeing with the kernel the first time
 * either changed. `apps/microtask/components/shared/admin-capabilities.ts` is the same decision, one
 * layer down: it hands components the record rather than a role, so every component reads one shape
 * whichever principal is rendering (ADR 0038).
 *
 * **It is one call and no longer a list, which is the amendment this file carries.** Until phase 3's
 * last task it was a hand-written literal naming all twenty-two controls, held to
 * {@link PlanControls} by a recursive mapped type that made each one `true`. Two quality reviews
 * judged that the weaker of the monorepo's two answers to one question, and they were right:
 * `apps/microtask/components/task-tree/controls.ts` keeps no admin literal, deriving its admin row
 * from the same `treeControls` projection a share link's row comes out of, so drift there is
 * unreachable rather than merely a type error. This is now the same shape.
 *
 * What it took was not the export the deferral had assumed. The blocker on record was that
 * `@repo/contracts` publishes no all-true `Capabilities` to push through the projection, and that
 * `Object.fromEntries` cannot build one without the type assertion `admin-capabilities.ts` writes. It
 * turned out the record was never the thing needed: {@link planControls} asks a **predicate**, so the
 * admin's answer is `() => true` and no record, no export and no assertion is involved. A record is
 * right one product over because four Microtask components take a `Capabilities` directly and it
 * therefore already exists; nothing in this app takes one, so an all-true export would have been a
 * second spelling of `() => true` behind a package boundary — and one that changed a package every
 * app and the API load from `dist/`.
 *
 * The seat half stays written out, and it is four booleans rather than an oversight.
 * {@link planControls} decides the content controls from actions alone; the four seat
 * answers are not a function of an action, because three of them are `mayReach(role, scope, …,
 * 'plan')` on the seat side — the `share:*` rows name a `project` target, so the record answers
 * `false` for a plan seat the server would serve — and an admin's are simply `true`. Microtask's
 * `ADMIN_TREE` passes a bare `true` for `foldersVisible` for exactly this reason.
 *
 * **What used to be a type guarantee is now an assertion**, and the trade is stated rather than
 * hidden. The mapped type made "every control drawn" a property the compiler kept; a projection makes
 * it a property of the argument, so a further control added to {@link PlanControls} is a compile
 * error in `planControls` — which is where it should be — while a member written as something other
 * than `may(...)` would leave the admin answering `false` with nothing failing. `admin-controls.test.ts`
 * is what closes that: it sweeps every boolean at both levels and requires all twenty-two to be
 * `true`, and it compares this record's keys against `planCapabilities`' group for group.
 *
 * Like every control, each of these answers a rendering question and never a gate. The admin's
 * authority is the API's answer to `mp_admin`, and this constant adds nothing to it: a control drawn
 * here for a plan the API has since refused still meets that refusal on click.
 */
export const ADMIN_CONTROLS: PlanControls = planControls(() => true, EVERY_SEAT_ANSWER)
