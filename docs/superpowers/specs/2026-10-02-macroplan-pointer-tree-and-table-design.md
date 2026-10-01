# Macroplan: a pointer layer, a collapsible tree, and a table worth the name

- **Date:** 2026-10-02
- **Follows:** [the calendar axis and groups](2026-10-01-macroplan-calendar-axis-and-groups-design.md),
  whose §6 names all three parts of this one.
- **ADRs it touches:** 0055, 0056, 0057, 0058, 0064, 0068.

This finishes the product owner's list. Items 1–3 shipped in the spec above; this is 4 to 9, in the
three slices §6 named, and it adds nothing they did not ask for.

| # | Asked for | Slice |
| - | --------- | ----- |
| 4 | Zoom works on scroll | A |
| 5 | Clicking a feature at Year or Quarter drills to Sprint and opens it | A |
| 6 | Hovering a mark shows a short details window | A |
| 8 | Hovering a feature in the sidebar drives the timeline; clicking opens its information | A |
| 7 | A rail in the sidebar is a dropdown | B |
| 9 | The table is a real data table | C |

## 1. The one decision slice A exists to make

Four of the six items are pointer gestures over a canvas that is a **Server Component of some two
thousand nodes**. ADR 0055 keeps the geometry in a pure package with no DOM; ADR 0058 keeps the canvas
on the server under one delegation root. Nothing here reopens either, so every gesture is answered the
way `drag-root.tsx` and `sidebar-search.tsx` already answer theirs: **one client root listens, and
reads what the server drew out of the markup.**

That is not a workaround for the module boundary. It is the reason there is one. A client component
under `components/plan` may be handed primitives, an unbound function, `null`, and markup on
`children` — so a hover card cannot be handed the plan, and does not need to be: the server already
wrote the sentences it shows into the mark it shows them for.

### 1.1 Zoom stays a cookie and a Server Action

A rung is a different scale, so it is a different SVG: there is no client-side zoom that does not
either re-render the canvas in the browser (ADR 0058) or scale it with a transform, which is exactly
the distortion §2.3 of the last spec dropped the `viewBox` to avoid. A URL is unavailable for the
reason ADR 0064 already records — the plan is rendered by a **layout**, and a Next layout is not handed
`searchParams`.

So scroll-to-zoom and click-to-drill both invoke the zoom action that already exists. `actions/zoom.ts`
grows one export, `zoomTo(rung)`, and `chooseZoom(form)` becomes the form-shaped caller of it, so the
cookie is validated and written in exactly one place.

### 1.2 Which wheel gesture zooms, and why not every wheel

The timeline pane scrolls **vertically**: a plan with more rails than fit is read by scrolling it. A
root that zoomed on every wheel event would take that away, and would take it away silently.

So:

- **Ctrl or Cmd + wheel anywhere over the board zooms.** This is also what a trackpad pinch sends, so
  pinch-to-zoom works with no extra code, and it is the gesture every map and design tool uses.
- **A plain wheel over the time header zooms.** The ruler has nothing of its own to scroll, it is the
  thing the zoom is about, and it is directly under the pointer when somebody is reading dates.
- **A plain wheel over the canvas scrolls**, unchanged.

The listener is registered with `addEventListener('wheel', …, { passive: false })` in an effect rather
than through React's `onWheel`, because React attaches wheel passively at the root and a passive
listener cannot `preventDefault` — and without `preventDefault` a Ctrl+wheel zooms the whole browser
page instead of the plan.

One gesture is one rung. There are three stops and a flick of a wheel is many events, so the root
accumulates delta and fires once, after the gesture settles.

### 1.3 The scroll position is anchored to the day under the pointer

Changing rung changes how wide a day is, so the same `scrollLeft` is a different date. Zooming without
correcting it throws the reader somewhere else in the plan, which is worse than not zooming.

Before the action fires, the root records the working day under the pointer and how far from the pane's
left edge it was. When the new rung's `pxPerDay` arrives as a prop — the server having re-rendered — an
effect puts that day back under that pixel. The scale arrives as a number from the same `ZOOM_VIEW` the
canvas was drawn from, so the client converts with the server's own answer rather than a second one.

### 1.4 A click at a coarse rung drills, and a click at Sprint does not

A bar is already an `<a href>` to its drawer, so item 5 is only the zoom half. At Year or Quarter the
root takes the click, sets the rung to Sprint, and then navigates — in that order, so the drawer opens
over a canvas already drawn at the rung the reader asked for. At Sprint the link is left alone, since
there is nothing to drill to and a plain link middle-clicks and opens in a new tab.

`DragRoot` swallows a click that ended a drag in the **capture** phase. This root listens in the bubble
phase, so a drag cannot drill.

### 1.5 The detail card is words the server wrote

`tableRows(plan)` is already the one place every cell's wording is decided, it is already `cache()`d per
request, and ADR 0056 is the argument that two renderings of one plan must not word it differently. So
the card's lines come from the same rows the table renders — a third opinion about what an estimate
reads like is exactly the drift that function exists to prevent.

The lines are joined into one `data-detail` attribute on the mark, the way `member-rows.ts` already
joins a membership list, and the card splits them. A new module `canvas/detail-lines.ts` owns the
joining, the splitting and the wording; it is pure, so the wording is pinned by a test with no DOM.

Marks, bar labels and sidebar feature rows all carry it, which is what makes item 8's sidebar hover and
item 6's canvas hover **the same gesture with one implementation** rather than two.

### 1.6 Hover highlights by toggling one attribute, not by generating rules

Hovering a sidebar row has to reach bars in another subtree. CSS can do that with `:has()` and
`:hover`, but only with **one rule per feature**, and the selection sheet already generates two per
feature; a third would be three hundred rules on a plan of a hundred features for an effect that lasts
as long as a pointer rests.

So the root sets `data-lit` on the hovered feature's bar, its label, its items, its arcs and its sidebar
row, and clears it on leave. One static rule set paints it. This is the same move `sidebar-search.tsx`
makes when it sets `hidden` on a row rather than generating a sheet, and for the same reason: an
attribute toggled on five elements costs nothing, and the alternative scales with the plan.

Highlight **emphasises** rather than dims. Dimming is the selection gesture's own language — a group
chip, a rail, a feature in the tree — and a hover that also dimmed would make a pointer crossing the
sidebar look like a click that had already happened.

## 2. Slice B: a rail is a dropdown

A rail's features collapse under it. Open by default: collapsing is the new affordance, not a new
default, and a tree that opened collapsed would hide the rows selection and hover work on.

**No JavaScript.** A hidden checkbox per rail, a label that is the triangle, and `peer-checked/open:` on
the wrapper holding that rail's features. It is the mechanism the view switch uses, and a
`<details>`/`<summary>` is not available here for a specific reason: a row holds a link and a label for
a radio, and a click on either inside a `<summary>` toggles the disclosure as well as doing what it was
aimed at.

The peer is **named** (`peer/open`). The unnamed `peer-checked:` that highlights a selected row compiles
to `.peer:checked ~ &`, which matches any preceding sibling carrying `peer` — a second unnamed peer in
the same branch would light every row in the rail.

The features move into a wrapper element, which they were not in before: `peer-checked/open:hidden` has
to apply to something, and the rows cannot be it, because each row's own selection radio has to stay its
DOM sibling.

## 3. Slice C: the table becomes a data table

Six capabilities: search, filter, order, column visibility, column order, and row actions. The table
stays a real `<table>` with `scope`d headers and stays mounted in both views — ADR 0056 is explicit that
it is "the only rendering of a plan a screen reader can read", and nothing here may cost that.

### 3.1 What is server-rendered, and what the one client root does

Every control is **server markup**: the search box, the two filter selects, the column menu with its
checkboxes and its move buttons. The server knows the rails and the groups; a client component may not
be handed them. One client root wraps the panel and listens by delegation.

That root owns exactly three jobs CSS cannot do: hiding rows that do not match, reordering rows, and
reordering cells. Everything else is native.

### 3.2 Column visibility is CSS, with no JavaScript at all

A checkbox per column and one generated rule per column on the panel:

```
[data-slot="table-panel"]:has(#mp-col-group:not(:checked)) [data-col="group"]{display:none}
```

Eight static rules. It survives a re-render, it costs no island, and it is the same `:has()` anchor
argument ADR 0064 makes for groups. Every cell carries `data-col`.

### 3.3 Search and filter hide rows, and a block is the unit

A feature and its items are a **block**. Every row carries `data-block` — its feature's id, which on a
feature row is its own.

Search behaves as the sidebar's does: a block whose feature matched shows whole; otherwise only the item
rows that matched show, under their feature row for context. The two filters — rail and group — are
block-level, because a rail and a group are properties of a feature and an item has no separate answer.

Matching is `includes` over a `data-search` the server wrote pre-lowered, so two thousand rows are not
lower-cased on a keystroke.

### 3.4 Ordering sorts blocks, and six columns of eight can be sorted

`rows.ts` argues at length that the table's order is the canvas's order and must not be re-derived: "a
table ordered by a sort of its own would put its rows in an order the bars are not in". That stands as
the **default**, and the derived order is what the table returns to — a third click on a header clears
the sort rather than cycling back to ascending, so the order the canvas is in is always one click away.

A sort moves **blocks**, carrying each feature's items with it. Epic, Feature, Group, Estimate, Sprint
and Blocked by have a value on the feature row and can be sorted. **Item and Progress cannot**: they are
per-item values, a block has several of them, and sorting blocks by one of its items' values would be a
number nobody can point at. Their headers are not buttons, which is how a reader is told.

Sort keys are `data-sort-*` attributes the server wrote: a name for a name, and a number for days,
sprint index and dependency count, so the client compares what it was given rather than parsing "planned
5d · broken down to 6d · +1d" back into a number.

### 3.5 Column order is moved in the DOM and remembered per browser

There is no CSS for it. `order` does not apply to table cells, and the alternative — dropping `<table>`
for a grid — would cost the semantics the whole table exists for.

So the root moves cells. Reordering is **two buttons in the column menu**, not a header drag: it is
keyboard-operable, it needs no pointer sensing, and the menu is already where a reader goes to decide
which columns they want. The order is kept in `localStorage` and re-applied after every render, because
opening a drawer re-renders the layout the table is in.

### 3.6 Row actions are three links to the controls that already exist

Edit, Add and Delete per row, each a link into that entity's drawer — to the name field, to the
add-a-child field, and to the delete control, by fragment.

They are links and not controls because of what the alternative costs: a delete button per row is either
a client island per row — two thousand of them, which is the thing ADR 0058 exists to prevent — or a
form with no confirmation on a destructive write, which `delete-control.tsx` deliberately does not
offer. The drawer has all three controls, with the confirmation, and it is one island whichever row
opened it.

Adding at plan level — a new rail — is a link in the toolbar, which is where the sidebar already keeps
it.

A viewer who may not write sees no actions column at all, rather than three links to controls that
would refuse them.

## 4. What this touches

**New.** `canvas/detail-lines.ts`, `canvas/plan-pointer.tsx`, `canvas/pointer-css.ts`,
`table/columns.ts`, `table/table-css.ts`, `table/table-toolbar.tsx`, `table/table-root.tsx`,
`table/row-actions.tsx`.

**Changed.** `actions/zoom.ts` (one new export), `canvas/view.ts` (`details` on the frame),
`canvas/feature-bar.tsx`, `canvas/feature-node.tsx`, `canvas/item-mark.tsx`, `canvas/rail-features.tsx`,
`plan-screen.tsx`, `sidebar/rail-tree.tsx`, `sidebar/tree-row.tsx`, `sidebar/sidebar-css.ts`,
`table/rows.ts`, `table/plan-table.tsx`, `table/table-row.tsx`, `module-boundaries.test.tsx` (three
names on the allowlist), and an `id` each on `drawer/delete-control.tsx` and `drawer/new-name.tsx` so a
row action has somewhere to land.

**Untouched.** `@repo/schedule` and its forward pass. No bar moves because of anything here.

## 5. Out of scope

- Continuous zoom. There are three rungs, and a gesture steps between them.
- Sorting items within a feature. The derived order is the one the canvas draws.
- Persisting a sort, a filter or a search. They are how somebody reads the plan for ten seconds;
  `group-css.ts` makes the same call. Column order is the one exception, because it is a layout
  preference rather than a question.
- Row-level writes. Every write stays in the drawer, with its confirmation.
