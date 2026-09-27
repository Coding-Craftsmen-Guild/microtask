# ADR 0067 — The plan page is a sidebar, a graph and a docked drawer

**Status:** Accepted · 2026-09-27

**Widens, rather than reverses:** [ADR 0057](0057-the-drawer-is-a-route.md).
**Builds what was deferred by:** [ADR 0055](0055-canvas-geometry-is-its-own-pure-package.md) (§5's unbuilt rungs).

## Context

Phase 4 closed with [ADR 0065](0065-a-plan-is-usable-end-to-end-on-both-surfaces.md): every write
existed, every capability was decided, every form was built and tested. Then somebody opened a plan and
could not find a way to put anything in it. Twice. The second report was three sentences and all of
them were right — *"there are no buttons to add anything on the timeline, hence this app is useless, we
need all the forms to input info."*

Nothing was missing. The forms were behind five collapsed `<details>` in the plan heading, in a row,
above a timeline. A disclosure closed by default is a reasonable home for a rare administrative act; it
is the wrong home for **the only way to create anything**, and five of them side by side turned the top
of the page into a filing cabinet. ADR 0065 recorded that every closed gap had a written justification
that was true when written and had a stale precondition. This is the same failure one level up: each
disclosure was individually defensible and the page they added up to was not.

The second problem is the canvas, and the source said so in its own comments before anyone complained.
`rail.tsx` recorded that epic-rung nodes, dependency arcs and milestone diamonds were "none of the three
is built yet"; `view.ts` repeated it; `plan-canvas.tsx` deferred zoom and pan to "phase 3", which came
and went. What shipped was one fixed 60-working-day window — `CANVAS_RANGE = { fromDay: 0, toDay: 60 }` —
so of design §5's three rungs exactly one was reachable, and the feature that gave the design its shape
was never drawn at all:

> Dependency edges are the only thing that couples one rail to another, which is exactly what makes the
> result look like a git graph: lanes advancing on their own, arcs where they actually exist. *(spec
> §3.1)*

## Decision

**The plan is a sidebar on the left and the graph on the right, with the drawer docked to the
right-hand edge.** Four changes, none of which adds a domain concept.

### The sidebar is the way in

It lists every rail, every feature under it, a name filter, and the four plan-level drawers as visible
links. It is the answer both to "how do I add anything" and to "where is that feature", and it is the
only rendering that holds every name at once — the canvas at the feature rung shows a quarter and the
table is behind a tab.

**Selecting and opening are two gestures.** Clicking a name checks a radio, which dims the rest of the
graph through a generated `:has()` stylesheet; clicking **Open** navigates to that subject's drawer.
Selection is therefore not state, nothing re-renders, and the canvas stays a Server Component — the same
mechanism [ADR 0064](0064-a-group-is-a-plan-level-label-a-feature-points-at.md) built for choosing a
group, over a different attribute rather than a second implementation.

**The filter walks the DOM.** A client component under `components/plan` may be handed primitives, an
unbound function or `null` and nothing else, so an array of rails cannot cross that boundary. The tree
stays server-rendered and the filter reads `data-search` off it — exactly as `canvas/selection.ts`
already rebuilds a whole `RailBox[]` out of the SVG the server drew, and for the same reason.

### Every form is a drawer route

ADR 0057 made the drawer a route so that opening one re-renders a forty-element panel instead of 2,000
SVG nodes and 2,200 table rows. That decision is right and this widens it to every form: `new/rail`,
`r/[epicId]`, `new/group`, `g/[labelId]`, `settings` and `share`, beside the two subject drawers that
were already routes.

**The panels do not survive beside them.** Five disclosures and seven routes doing the same writes is
two ways to do everything and two sets of tests.

**A route answers the refusal once.** A form inside a `<details>` renders for a reader who may not use
it unless the page separately remembers to check — which is why `BindingsPanel` took a `mayUnbind`
boolean *and* the page decided whether to mount it at all. A route whose entire content is a refused
form is a route that does not exist for that reader, so it `notFound()`s.

**A rail's binding moved with it.** The heading spent its most valuable strip saying `Microtask bindings
(0 rails)` on every plan that binds nothing, and most bind nothing. A binding belongs to one rail.

### The canvas draws all three rungs

`packages/canvas` gains three pure modules, all unit-tested with no DOM per ADR 0055:

- **`arcs.ts`** — one curve per dependency edge, running out of the end of what must finish first and
  into the start of what waits. A cross-rail arc is flagged, because §3.1 makes it the only thing
  coupling two lanes; an edge the forward pass **dropped** to break a deadlock is flagged too and drawn
  destructive and dashed, so the canvas shows *where* the conflict list says a cycle is. An edge with an
  unplaced end is omitted rather than pointed at the gutter.
- **`milestones.ts`** — a feature with an effective estimate of zero is a diamond. It was a `<rect>` of
  zero width, which is to say it was nothing.
- **`zoom.ts`** — one view per rung, with the feature and item ranges **derived** from `rungFor`'s own
  boundaries so a stop cannot drift a day past the boundary and quietly draw a rung other than the key
  it is filed under.

**Arcs are drawn at every rung, in one layer over all the rails.** An arc between two rails belongs to
neither, so there is no rail group to put it in: whichever end owned it, the arc would be clipped, dimmed
and ordered with the wrong rail half the time.

### Zoom is a cookie, and ADR 0057 is why

The obvious answer is `?z=epic|feature|item`, and it does not work here. ADR 0057 put the canvas in the
plan's `layout.tsx`, and **a Next layout is not given `searchParams`** — that is the documented
consequence of a layout not re-rendering when only a search param changes. The ADR is emphatic that this
is not incidental ("the layout is not an implementation detail of this decision — it is the decision")
and separately rejects moving the canvas back onto `page.tsx`.

A layout *can* read cookies. So the rung lives in `mp_zoom`, set by a Server Action, validated on the way
in and on the way out because the cookie is client-writable.

## Consequences

**A zoom level is not in the URL.** It cannot be sent to a colleague and Back does not step out of it —
both of which ADR 0057 bought for the *selection* by making it a path segment. The alternative that keeps
them is to make the rung a segment above the drawer (`/plans/{planId}/z/{rung}/f/{featureId}`), which
preserves ADR 0057's mechanism exactly and costs a move of every file under the segment plus every
builder in `lib/drawer-routes.ts`. That is the right change if zoom links turn out to be worth sending.

**The seat surface reads no cookie, so a holder cannot zoom.** `seat-plan.test.tsx` mocks `next/headers`
to **throw**, and that guard is right: a `/s/*` page authenticates from its own URL, so a cookie read
anywhere under it must fail the suite rather than pass quietly — which is what stops `mp_admin` on the
same browser lending a holder's page anything (ADR 0040). A zoom cookie is not a credential, but the
guard is deliberately blanket so that nobody has to decide case by case which cookie is safe to read
there. A holder reads the plan at the quarter rung. That is a real gap and is written down where the
default is passed.

**The seat surface keeps its collapsed panels.** It has no rail drawer of its own, and giving it one is
its own piece of work: the sidebar's links are admin paths, and a seat following one would meet a login
with no password behind it (ADR 0032). So for now one surface is a sidebar and the other is disclosures,
which is the inconsistency this decision knowingly leaves.

**A milestone made a `<polygon>` share the `feature-bar` slot, and that broke the drag before it was
noticed.** `canvas/selection.ts` rebuilt a layout by reading the `x`, `y` and `width` **presentation**
attributes, which a polygon has none of — so every milestone would have answered `NaN` and placed its
drag at the gutter. All three are now carried as `data-` attributes on every mark, which makes the
reader independent of which shape was drawn. That is the same argument `feature-bar.tsx` already made
for carrying the two day numbers, applied to three more.

**The guard on handed actions moved with the actions.** The four seat writes and the three plan-own ones
left `layout.test.tsx`'s `OFF_INTERFACE` for `form-drawers.test.tsx`, because ADR 0040's bound-action
check has to live where the action is handed. A list left behind on a layout that no longer hands them
would have passed by having nothing to look at.

**Two components exist only because of ADR 0027's caps, and both say so.** `RailFeatures` collapsed the
bar/node branches to put `Rail` back under the fifty-line function cap; `PlanViews` is the split
`plan-screen.tsx` predicted in its own TSDoc. `PlanViews` returns a **fragment** and that is load-bearing:
`VIEW_SWITCH` is a `peer-*` sibling selector, so anything there becoming a `<div>` breaks the switch
silently, with both panels simply ceasing to hide.

**The empty drawer page renders nothing.** It used to render a sentence explaining that nothing was open,
which was right when the drawer was a card in the page's flow and an empty slot would have been an
unexplained gap. A docked drawer needs no placeholder, and the sentence described what the address does
rather than how to open anything — honest when nothing linked into a drawer, and out of date now.

## Alternatives considered

**Render all three zoom levels and switch with CSS.** The trick the view switch and the group chips both
use, and it needs no cookie, no round trip and no server state. Rejected on the element budget: the table
and the canvas are already both always mounted (ADR 0056), and two more canvases is the doubling
`item-mark.tsx` exists to refuse — at the caps that is 200 bars and 2,000 marks twice over to serve a
control that changes view perhaps twice a session.

**Keep the disclosures and add a button to the timeline.** The smallest change that answers the literal
complaint. Rejected because the complaint was literal and the problem was not: a plan page also needs a
way to *find* a feature among two hundred, and a button on the canvas answers only the first half. It
would also have left five disclosures in the heading, which is the arrangement that produced two separate
reports.

**Make the sidebar a client component holding the rail tree.** It would make the filter trivial. Rejected
because it puts every rail and feature name into the Flight payload to save a `querySelectorAll`, and
makes a plan's shape reachable from a `'use client'` module for the sake of a text filter — the boundary
`module-boundaries.test.tsx` exists to hold.

**One drawer route per form *and* keep the panels for the seat surface's sake.** What was in fact done, and
it is the compromise rather than the design: see the consequence above. The alternative considered and
declined was to give the seat surface its own `r/[epicId]` and `g/[labelId]` in the same change, which
would have doubled the route work for a surface whose holders mostly read.

**Emit arcs as four control-point numbers rather than a path string.** Keeps the package returning only
numbers, as `railLayout` and `itemsToMarks` do. Rejected because the bow *is* the decision — which way an
arc bends and how far it reaches before it turns — and a component composing its own curve from control
points would be making that decision again, differently, at each rung, in JSX where `happy-dom` answers
every measurement with a zero `DOMRect`.
