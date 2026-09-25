# ADR 0057 — The drawer is a route, so a selection is a URL and a save is per field

**Status:** Accepted · 2026-09-25

## Context

Spec §6 gives the drawer eight things to carry — "name, estimate, pin, dependencies, epic, linked
task, progress readout, and one plain-text description" — and says nothing about where the selection
that opens it lives. Every editing surface in the product before this one settled that question the
same way, which is to say it never had to: phase 2's plan screen had no selection at all, and
`apps/microtask`'s tab strip keeps its own in a URL search parameter for a reason that does not
transfer, a tab being a document rather than one of two thousand nodes.

Two facts about the screen this drawer opens beside decide it.

**The canvas is large and the panel is small.** At this product's caps the timeline is 200 feature
bars and 2,000 item marks, and the table beside it is 2,200 rows (ADR 0056 records why both are
always mounted). A panel showing one feature is perhaps forty elements. So whatever re-renders when a
selection changes is the whole cost of selecting, and the two candidates differ by three orders of
magnitude.

**Nothing about the plan may cross into a client component.** The admin's own read is
`plans.read()`, which answers every live seat token on the plan — required of the view by
`packages/macroplan-domain/src/views/view-leaks.test.ts` rather than left to inference — and ADR 0033
forbids rendering that block into a page whoever is reading. Phase 2 left the admin plan page
asserting that it hands a component **no function at all**, and `read-plan.ts` reduces the API's
answer to a `PlanScreenModel` whose type cannot hold the block. A selection held in client state is a
`useState` in a component that is rendering the canvas, which means the canvas is a client component,
which means the plan's whole shape is in the Flight payload — for a panel showing one feature.

There is a third fact that only became visible once the first two were acted on, and it is the half
of this record that was not predicted: **the API authorises the feature PATCH per field.** That is
not a fact about routing, and it turns out to be a consequence of the same decision.

## Decision

**A selection is a URL, the canvas moves into the plan's layout, and the drawer is the layout's
`children` slot.** `app/(admin)/plans/[planId]/layout.tsx` renders the canvas, the table, the
conflict list and the share manager; `page.tsx` fills the slot with a sentence when nothing is
selected; `f/[featureId]/page.tsx` and `i/[itemId]/page.tsx` render the panel. The two segments are
one letter each — `/plans/<planId>/f/<featureId>` — for the reason `lib/drawer-routes.ts` gives,
which is that `/plans/<26 characters>/features/<26 characters>` is mostly punctuation, and it is the
vocabulary `apps/microtask` already chose one product over with `/p/<projectId>/t/<taskId>`.

**A layout does not re-render when navigation moves between its children.** That sentence is the
whole of the performance argument: opening a feature re-renders the panel and nothing else, where a
page holding both would rebuild 2,000 SVG nodes and 2,200 rows to show forty elements. It is also why
`loading.tsx` draws nothing a sighted user would call a loading state — a `loading.tsx` beside a
`layout.tsx` wraps each of the layout's child slots, so the canvas is already on screen and stays
there, and the file holds one `sr-only` `role="status"` for the reader who cannot see that it did.

**A selection is therefore a link somebody can send**, which is the half of this that is a product
decision rather than an optimisation. A conflict row links to the control that would fix it
(`components/plan/conflicts/conflict-list.tsx`), and it can only do that because the control has an
address. The browser's own Back steps out of a panel, and a reload lands on the same one.

**The plan is read once per request, by `React.cache`, and not threaded.** A layout cannot hand its
children a prop, so `read-plan.ts` is `cache()`d on `planId` and the layout, `generateMetadata` and
whichever drawer page is mounted share one call on a cold load; on a soft navigation the layout does
not render at all and the drawer's own call is the only read. This holds only while every caller asks
with the same key, which is why none of them threads a pathname in, and why the `?next=` an expired
session redirects to carries the **plan's** path and never the drawer's.

### `generateMetadata` had to move to the layout, which the plan had not foreseen

A drawer route is a page too. A `generateMetadata` left on `page.tsx` titles the tab with the plan's
name when nothing is selected and titles nothing at all the moment a feature is open, because
`page.tsx` is then not rendered. So it is the layout's, where it shares the same cached read, and
every page under the segment inherits one title. This is a small thing and it is recorded because it
is the kind of small thing that is discovered by opening a feature and watching the tab go blank,
rather than by reasoning about the route tree.

### The pre-existing `not-found.tsx` became unreachable, and there are now two

`[planId]/not-found.tsx` was written in phase 2 for a plan id that names nothing. Moving the read
into the layout made it unreachable for that case, and the mechanism is worth stating because nothing
warns about it: **Next hands a segment's `not-found` element to the `LayoutRouter` it builds for that
segment's `children` slot**, so the element renders *inside* the layout. A `notFound()` thrown by the
layout itself is outside that boundary and escapes to the nearest boundary above.

So there are two boundaries and they are two different sentences. `app/(admin)/plans/not-found.tsx`
is new: it says the plan is not there, framed by the admin bar with no plan around it, and it is
where the layout's own `notFound()` lands — a 404 for a plan the workspace does not hold and a 422
for a segment that is not a ULID, which are one sentence to the admin and a distinction about the
API's validator otherwise. `[planId]/not-found.tsx` keeps its file and changes its meaning to the
**drawer's**: a feature or an item that is gone, with the plan still on screen beside it, which it
gets precisely by rendering inside the layout. A directory with no `layout.tsx` and no `page.tsx`
still carries a boundary, which is what makes the one-level-up placement possible at all.

### Per-field saving is a consequence of this decision, not a separate one

`PATCH /plans/{planId}/features/{featureId}` accepts `name`, `estimateDays` and `pinSprint`, and it
asks for **every action the body's present keys imply** — up to three `authorize()` calls in one
request (`apps/api/src/routes/macroplan/features/handlers.ts`). `feature:rename` and
`feature:estimate` are `write` actions; `feature:pin` is `manage`-only
(`packages/kernel/src/access/policy.ts`). Every gate runs before `features.update` is reached and the
first refusal throws, so a body carrying an estimate and a pin together is refused **wholesale** and
writes neither field.

Read that against who the `write` role is for. Spec §7.1: "`write` changes what the work is and what
it costs; `manage` changes where it sits and what the plan is. A team lead fills in their own
estimates; the executive who owns the timeline decides what moves." A combined form is therefore
refused for exactly the seat the `write` role exists to serve, on a change that seat was entitled to
make, because a field it may not touch was in the same request. So each field of the drawer is its
own write: `field.ts`'s `SubjectWrite<Value>` is `(planId, subjectId, value)`, and `renameFeature`,
`estimateFeature`, `renameItem`, `estimateItem` and `describeItem` are each assignable to it, so a
field takes one member of `PlanEditActions` as a prop and cannot reach a second.

This is the same decision as the route rather than a second one. A panel that saved on submit would
need one form over every field, which needs one request carrying every field, which is the body the
API refuses per seat. A panel whose fields are independent needs no form around them, and a drawer
that is a *page* is what makes each field's answer a re-read of the plan the server kept rather than
an echo of what was typed — `subjectValues` reads the subject's values back out of the response
(`components/plan/drawer/values.ts`).

## Consequences

- **A selection costs one soft navigation, which is a server round trip.** That is the price and it
  is not rounded down. `loading.tsx` covers it for a screen reader and draws nothing for anyone else,
  and the plan read is `cache()`d so the round trip is one call rather than three. What it buys is
  every re-render the alternative would have paid for, forever, plus the link.
- **`PlanScreen` gained a `drawer` slot, and then three more for the same reason.** `conflicts`,
  `share` and `actions` are slots too, because each is something only the surface knows: every link a
  conflict row draws is an admin drawer path, and `/s/<token>` renders the same screen for a holder
  with no password (ADR 0032). The slot pattern this ADR introduced is what let one screen serve both
  audiences without either learning which it is.
- **Two not-found pages must stay two.** Collapsing them re-creates the bug: one sentence would have
  to render either beside a canvas that cannot be drawn, or in place of a canvas that is drawn fine.
  Both files carry the `LayoutRouter` mechanism in their own TSDoc, because the placement looks
  arbitrary from either file alone.
- **The drawer pages are the first pages in this app to hand a component a Server Action**, and both
  assert what they hand over by name: exactly `Object.keys(ADMIN_PLAN_ACTIONS)`, none beginning with
  `bound ` and none anonymous (`components/plan/testing/handed.ts`). A bound action is how ADR 0040
  says a token reaches a component, and reflection cannot see inside one, so the check is the name.
- **A drawer page reads the plan and finds one row in it.** `tableRows` is `cache()`d on the plan
  object, so locating one subject does not rebuild the 2,200 rows the table is drawing: the one read
  of a soft navigation is also the one derivation of it.
- **An id that names nothing is `notFound()` and never an empty panel.** The read answered the whole
  plan, so an absence is a stale link rather than something still loading — and an `itemId` in the
  `f/` segment is the same answer, the two segments being unable to answer for each other.
- **Phase 4's seat drawer is two lines, and they are deliberately not written.**
  `/s/<token>/f/<featureId>` and `/s/<token>/i/<itemId>` are the same two segments under `linkPath`;
  `lib/drawer-routes.ts` holds each segment as one constant so the builders arrive reusing them, and
  withholds the builders themselves because exporting them now would ship two functions that build
  404s.

## Alternatives considered

**Selection in client state, the drawer as an overlay.** The obvious shape, and the one most
component libraries are built for: a `useState`, a `<Dialog>`, no navigation and no round trip.
Rejected on all three counts above. The re-render is the measurable one — 2,000 SVG nodes and 2,200
rows rebuilt to show one panel — but the leak is the one that could not be fixed later: an overlay
holding the plan puts the plan's whole shape into a client component's props, and the admin's plan
read carries every live seat token on it (ADR 0033). The deep link is simply lost; there is no
version of client state that a colleague can be sent.

**Keep the canvas on `page.tsx` and make only the drawer a route.** A halfway house that keeps the
URL and skips the layout. Rejected because it gets the re-render exactly backwards: a page *does*
re-render when navigation moves to a sibling route, so every selection would rebuild the canvas and
the table anyway, and the round trip would buy nothing but the link. The layout is not an
implementation detail of this decision — it is the decision.

**A search parameter, `?f=<featureId>`, rather than a path segment.** It is what
`apps/microtask`'s tab strip does, so there is precedent in this repo, and it needs no new files.
Rejected: a search parameter change re-renders the page it is on, which is the same cost as client
state with a worse URL, and Next's own segment-level `loading.tsx` and `not-found.tsx` have nothing
to hang off. The precedent also does not transfer — a tab is one of a handful of documents on one
task, where a feature is one of two hundred on a plan drawn as a picture.

**One combined save for the whole panel, with the pin drawn only where `pinFeature` is true.** This
would keep per-field authorisation honest without per-field writes, and it is what
`PlanContentControls` describes as the other valid answer: "a control that would send a combined body
must be drawn only where every contributing boolean is true." Rejected because it makes the panel's
shape a function of the seat's role — a `write` seat would get a differently-composed form rather than
the same form with one control missing — and because it puts the authorisation rule in the renderer,
where a later field added to the body would silently widen what one submit asks for. Per-field writes
put it in the request, where the API is already checking.

**Leave `[planId]/not-found.tsx` where it was and let it serve both cases.** One file, one sentence,
no new directory. Rejected on the mechanism rather than on taste: it is unreachable for the plan case,
so "let it serve both" is not available — the layout's `notFound()` escapes it whatever the file says.
Left in place alone it would have been a 404 page that never renders, which is worse than either of
the two that do.

**Title the tab from the drawer pages instead of the layout.** Three `generateMetadata` functions
naming the same plan, which at least keeps each page self-describing. Rejected: it is the same fact
written three times, it leaves `page.tsx` needing a `params` and a plan read it otherwise makes no use
of, and the empty-slot page is the one page under the segment that calls the API nothing at all.
