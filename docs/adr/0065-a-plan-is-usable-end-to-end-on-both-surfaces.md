# 0065 — A plan is usable end to end, on both surfaces

- **Status:** Accepted
- **Date:** 2026-09-27
- **Context:** [Macroplan design](../superpowers/specs/2026-09-22-macroplan-design.md) §5, §7.1, §7.3, §9
- **Amends:** the deferrals recorded in ADR 0033, ADR 0040 and ADR 0057

## The problem

All four phases of §9 were complete, every gate criterion passed, and the product could not be used.
The spec's phase rows describe **capabilities**, and nothing in them describes a path through the
app — so each phase was built, tested and audited against its own row while the joins between them
went unexamined. Six gaps, each invisible from inside the phase that should have closed it:

1. No control created a plan. `plans.create` had a route, a client method, an OpenAPI entry and
   tests; no Server Action and no form.
2. No control created a **rail**. Every other write is addressed at a feature or an item under one,
   and the only box that makes either is in the drawer, which opens on a subject that must already
   exist. So an empty plan stayed empty for ever.
3. A plan could not be renamed, retimed or deleted. Same shape as (1), three routes over.
4. `GET /items/{itemId}` answered `linkedTaskId` unshaped, so a `view` seat was refused a link in the
   timeline and handed it in the drawer.
5. The seat surface handed over no action at all, so a plan shared at `manage` was read-only.
6. The canvas drew finished-or-not and no degree between.

## What each of them was defended by, which is the interesting part

None of the six was an oversight in the ordinary sense. Each had a written justification that was
**true when written** and had stopped being the whole story:

- `plan-capabilities.ts` recorded the five rail controls as having no call site, correctly, because
  §9's phase-3 row does not name a rail editor. It does not. What nobody drew from that is that the
  row does not name a way *into* a plan either.
- The same file recorded the absence of plan-level controls as deliberate, on the grounds that a
  boolean for a write nothing calls answers a question nobody asks. Sound — and it stopped being
  sufficient the moment a plan could be created at all.
- `itemView`'s own TSDoc said the unshaped field was safe *while nothing wrote it*, and named the
  handler as the place to settle it once something did. Phase 4 wrote the writer; nobody went back.
- The seat surface's `null` slots were defended by a **test**: the leak sweep could not read a bound
  function's arguments, so it asserted the surface handed over no function at all.
- `treatments.ts` recorded the canvas's two-level progress as a consequence of the one-element-per-item
  rule, which is real.

So the lesson is not "write more prose". It is that **a justification with a precondition in it needs
the precondition checked**, and nothing here checked one. "No control calls it" is a reason to wait
only while somebody is asking whether one should.

## The decisions

**Plan-level writes are a third controls group**, `PlanOwnControls`, not three more content controls.
`PlanContentControls` is `PlanEditActions`' own list name for name, and two of the three could not join
that interface: every member of it answers `ActionResult<Plan>` so `eachOrNoAnswer` can map over it,
where `renamePlan` answers the name the server **stored** and `deletePlan` answers nothing and
redirects.

**The seat surface's leak sweep calls what it is handed.** A bound function keeps its arguments in a
closure with no reflective access, so the sweep mocks the seat action modules to recorders, invokes
every action the page hands over, and asserts the token each carries is the visitor's own — token by
token against every one the API serves. That is strictly stronger than the ban it replaced, and binding
a foreign token fails two cases. Five slots lifted on the back of it.

**The token may appear in the rendered markup, as an href on this surface and nowhere else.** Mounting
the conflict list puts it in link hrefs, which is admissible for exactly one token (ADR 0040) and is
already true of the brand link. The sweep now distinguishes the **element tree** from the **HTML**,
because a Server Component's props never reach a browser and only the second answers what shipped.

**`ConflictList` takes a `DrawerRoutes` record.** It imported the admin path builders, which is what
kept it off the seat surface: every link it drew went to a page that answers a cookie a seat has not
got (ADR 0032). The page decides, being the only thing that knows which surface is rendering.

**The seat plan screen moved into its layout.** A drawer is a route so that opening one is a soft
navigation (ADR 0057); while `page.tsx` rendered the whole screen there was nowhere a drawer segment
could sit without rebuilding 2,200 table rows to open one panel.

**Progress on the canvas is three discrete levels, not a fill.** `'started'` joins the union.
A continuous fill needs a second element per item — 4,000 nodes at the cap — or a gradient definition
per hue-and-fraction pair, which at forty rails by ten buckets is four hundred definitions; both are
worse than what they replace. `countsAsStarted` is exclusive of `countsAsDone` **by construction**, so
the overlay order cannot decide which treatment a mark gets.

## What a seat may now do, and the one asymmetry that stays

A plan-scoped `manage` seat can add a rail, put a feature on it, group features across rails, edit
anything in the drawer, drag a bar, correct the plan's calendar, delete the plan, and hand on a seat —
with no admin cookie anywhere. Every one of those is the API's own answer from the seat's own role, not
a widening taken in the app.

Two things it cannot do, both by policy rather than by omission:

- **Bind a rail to a Microtask project.** `epic:bind` is admin-only, because a binding is the ceiling
  on everything a seat reaches through the bridge, so a holder who could re-role one could raise its
  own ceiling. `bridge={null}` on that surface is permanent.
- **Browse the tasks of a bound project.** §7.3 grants an effective `write` holder "the linked task's
  name", meaning the one task linked. The route listing every task is gated on `epic:bind`, so a seat
  gets the name, `Unlink` and `Create the task`, and no picker: it can unlink and create, and cannot
  browse.

Deleting a plan from a seat **ends the caller's own access**, since it revokes every seat on the plan
inside the same locked write. `seatDeletePlan` therefore redirects to `/s/unavailable` rather than to an
index a seat is refused, and the confirm already said the links stop working and nobody holding one is
told — which now includes the person clicking it.

## Consequences

- `Treatment` has five members; every exhaustive map over it gained a key.
- `TARGET_KINDS` gained `label`, so the kernel and `@repo/contracts` both carry a fifth plan target.
- `changeOf` moved out of `plan-share-links.ts` into `share-parts.ts`, which carries no `'use server'`
  deliberately: Next publishes every export of such a module as an endpoint, and a payload-shaping
  helper has no business being one.
- All 28 content controls have a reader, for the first time. Two of them — `renameEpic` and
  `renameLabel` — gained one because their panels are opened on `create`, a **different** action, so a
  reader who may add one and not rename one is real.
