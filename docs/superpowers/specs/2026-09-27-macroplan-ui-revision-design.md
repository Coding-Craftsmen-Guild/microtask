# Macroplan: the UI revision

**Date:** 2026-09-27
**Branch:** `feat/macroplan-ui-revision`
**Corrects a premise in:** ADR 0052 (see §5). **Widens, rather than reverses:** ADR 0057 (see §4).

---

## 1. Why

The plan page shipped end-to-end in phase 4 and then failed the only test that matters: a person
opened one and could not find a way to put anything in it. Twice. The second report was blunt and
correct — *"there are no buttons to add anything on the timeline, hence this app is useless."*

Nothing was missing from the API. Every write existed, every capability was decided, every form was
built. They were behind five collapsed `<details>` in a heading, in a row, above a timeline. A
disclosure closed by default is a reasonable place to keep a rare administrative act; it is the wrong
place to keep **the only way to create anything**, and putting five of them side by side turned the
top of the page into a filing cabinet.

The second failure is the canvas itself. It does not look like the thing the design described, and
the source says so in its own comments: `rail.tsx` records that epic-rung nodes, dependency arcs and
milestone diamonds are "none of the three is built yet", `view.ts` repeats it, and `plan-canvas.tsx`
defers zoom and pan to "phase 3", which came and went. What ships is one fixed 60-working-day
window — `CANVAS_RANGE = { fromDay: 0, toDay: 60 }` — so of design §5's three rungs exactly one is
reachable, and the feature that gave the design its shape (*"lanes advancing on their own, arcs where
they actually exist … which is exactly what makes the result look like a git graph"*, §3.1) was never
drawn.

This revision is four changes. None of them adds a domain concept; three of them move or draw what
already exists, and one adds a server-side authority that §5 argues for on its own terms.

## 2. Bindings come off the plan page

The bindings panel is gone from the heading. A rail's binding to a Microtask project is not a thing
anyone reads a timeline to find out, and it was taking the most valuable strip of the page to say
`Microtask bindings (0 rails)` on every plan that binds nothing — which is most of them.

Binding moves to a drawer route reached from the rail it belongs to (§4), where it is one rail's
concern rather than a table of forty.

## 3. Rails become a sidebar, and the sidebar is the way in

The left third of the plan becomes a **rail sidebar** and the graph keeps the right. The sidebar is
the answer to "how do I add anything": it lists every rail, each rail's features under it, and it
carries the create controls at the level they apply to — a rail at the top, a feature under each
rail.

It also carries a **search field**. A plan at `LIMITS.epicsPerPlan` rails and
`LIMITS.featuresPerPlan` features is a list nobody scrolls, and the sidebar is the only rendering
that holds every name at once — the canvas at the feature rung shows a quarter, and the table is a
second tab. Search filters the tree by name and is the one piece of this that must be a client
component: `:has()` can dim a row by a checked radio (which is how ADR 0064 makes group selection
work with no JavaScript) but CSS cannot match text against a typed string.

### 3.1 Selecting in the sidebar highlights on the graph

Selecting a rail or a feature in the sidebar highlights it on the canvas. This reuses the group
mechanism exactly rather than inventing a second one: one radio per selectable subject, a generated
stylesheet keyed on `[data-slot="plan-root"]:has(#…:checked)`, and every non-matching mark dimmed to
`DIMMED_OPACITY`. Selection is therefore **not state**, nothing re-renders, the canvas stays a Server
Component, and the same gesture that already dims by group now also dims by rail and by feature.

The alternative — selection as React state on a client canvas — would make the whole canvas a client
component to serve a hover-weight interaction, and ADR 0058's single delegation root over a
server-rendered canvas exists precisely to avoid that.

## 4. Every form is a right-hand drawer

ADR 0057 already decided the drawer is a **route**, so that opening one does not re-render the layout
the canvas lives in. That decision is right and this widens it: **every** form becomes a drawer route,
opening from the right, rather than a `<details>` in the heading.

The new segments under `plans/[planId]` are:

| Route | Drawer |
| --- | --- |
| `new/rail` | create a rail |
| `r/[epicId]` | rename, recolour, reorder, delete a rail; bind it (§5) |
| `r/[epicId]/new/feature` | create a feature on that rail |
| `new/group` | create a label |
| `g/[labelId]` | rename, recolour, delete a label |
| `settings` | plan name, calendar, delete |
| `share` | the seat manager |
| `f/[featureId]`, `i/[itemId]` | unchanged, already routes |

What this buys beyond discoverability: every form is now **linkable and refusable in one place**. A
form inside a `<details>` renders for a reader who may not use it unless the page remembers to check
first, which is why `BindingsPanel` took a `mayUnbind` boolean *and* the page separately decided
whether to mount it at all. A route answers that once, in its own `page.tsx`, with the same
`planCapabilities` read the drawer routes already do.

Panels do not survive alongside the routes. Five collapsed disclosures and seven drawer routes doing
the same writes is two ways to do everything and two sets of tests; the panels go.

## 5. One click binds a rail

An admin binding a rail today mints a share link in Microtask, copies its token, comes back, and
pastes it. That flow exists because ADR 0052 refused to let Macroplan hold an authority large enough
to create a credential in the other product. The refusal was right about the *client*, and it rests on
one premise about the server that turns out to be false.

ADR 0052's consequence section reads: a minting call "needs authority over that product's share-link
management — `share:create` at minimum, and in practice an admin credential, **since a Macroplan admin
holds no Microtask seat**." True of *seats*, and beside the point, because the admin needs no seat:
there is **one admin across both products**. `.env.example` states it where `ADMIN_PASSWORD` is
declared — "Both apps sign in against it, through the product-agnostic `/v1/auth/login`: one admin,
two sessions (ADR 0014)" — and it is the reason ADR 0052 could tell that admin to go and mint the seat
by hand in the first place. An admin who could not mint there could not have followed 0052's own flow.

So the new route adds **no authority whatsoever**. It is a composition of two gates that both already
exist, asked of one request principal:

```
POST /macroplan/plans/{planId}/epics/{epicId}/bind-project   { projectId, role }

  authorize(c, 'epic:bind',    { kind: 'epic',    planId    })   // may this caller bind this rail
  authorize(c, 'share:create', { kind: 'project', projectId })   // may it mint a seat over there
  links.create(...) -> bindings.prepare(token, role) -> epics.bind(...)
```

Both calls are the ones `bindEpic` and `createShareLink` make today, unchanged and in that order. What
the route removes is the clipboard, not a check.

- **The credential never exists outside the server.** ADR 0052's real objection was a token crossing
  into a browser and into a paste buffer. Here the seat is minted, sealed and stored inside one
  request; no response carries it, exactly as no response carries a stored binding today. The sealed
  shape handed to `epics.bind` is byte-for-byte the shape the pasted flow produces, so nothing
  downstream of the binding changes and ADR 0061 is untouched.
- **The second gate is load-bearing, not decoration.** `epic:bind` is in `ADMIN_ONLY_ACTIONS`, so the
  only principals that reach the second line are admins, who always clear it. That is exactly why it
  is written: it is the check that refuses the day `epic:bind` stops being admin-only, and ADR 0052's
  closing section leaves an epic-scoped seat open as an additive change.
- **The role stays bounded.** A rail binds at `view` or `manage` and nothing wider; the minted seat is
  created at that role and `prepare` still attenuates it, so the stored role remains a fact (ADR 0062)
  and the `manage` half is still the one write ADR 0040 bounds it to.
- **Revocation stays where it works.** The minted seat is an ordinary Microtask share link: listed,
  re-rollable and revocable in that product's own share manager, under ADR 0010's cascade, with
  `PrincipalResolver` re-reading its live role on every bridge read. A seat minted here is
  indistinguishable from one minted by hand, which is the property that keeps it honest.

The paste-a-token form does not disappear; it stays in the rail drawer for the case the button cannot
serve — binding to a project in a Microtask the admin does not have a session for. The button is the
common path, the field is the escape hatch.

## 6. The canvas gets its arcs, its diamonds and its zoom

Design §5's table is unchanged; this builds the two rows of it that were never drawn and the control
that makes them reachable.

### 6.1 Dependency arcs

`packages/canvas` gains `arcs.ts`: one pure function over the plan, the schedule and the scale
answering an arc per edge, with the geometry a renderer needs and no SVG string. Everything it needs
is already in hand — `dependsOn` is on every `ScheduleFeature`, spans place both ends, and
`railLayout` fixes each end's rail — so nothing is asked of the API.

An arc runs from the **end** of the feature depended on to the **start** of the feature depending on
it. Two cases and they look different on purpose: within one rail the dependency is usually implied
by rail order and the arc is a short hop, while an arc **between** rails is the interesting one and
the only thing that couples two lanes (§3.1). An edge whose either end has no span is not drawn and
is not an error — the feature is already named in `unscheduled`, and an arc to nothing is worse than
no arc. An edge in `ignoredEdges` — the ones the pass dropped to break a cycle — draws
**distinctly**, because the conflict list says a cycle exists and the canvas should show where.

### 6.2 Milestone diamonds

A feature with an effective estimate of zero has `startDay === endDay` and a bar of width 0 — a real
position taking no time, which `rails.ts` already documents and already returns. It draws as a
diamond centred on that day. This is a rendering change only; no geometry is added.

### 6.3 Zoom is a search param, not state

The scale becomes a **URL search param** rather than client state: `?z=epic|feature|item` picks the
range, `rungFor` derives the rung from it exactly as it does now, and the canvas re-renders server
side at the chosen scale. Three links, no client component, back button works, and a zoom level is
shareable — a person reporting a problem can send the view they were looking at.

This is the same argument ADR 0057 made for the drawer, applied to the other axis. Client state would
put the whole canvas behind a `'use client'` boundary and hand it a `pxPerDay` to re-layout on every
frame, which is the "bar that jumps when you let go of it" §4 already refused.

`rungFor` needs no change. It answers `'item'` at or below 20 working days, `'feature'` up to 60, and
`'epic'` beyond — so the three stops are a range each, and the epic rung becomes reachable for the
first time.

## 7. What this does not change

No new domain concept, no new entity, no schema migration. The plan manifest, the forward pass, the
bridge and every capability row stay as they are. §5 adds one API route and one ADR; §§2–4 and 6 move
and draw what phase 4 already shipped.
