# ADR 0069 — The plan screen is local-first: the plan crosses once, and every interaction is answered in the browser

**Status:** Accepted · 2026-10-03

**Supersedes in part:** [ADR 0056](0056-the-table-is-the-second-rendering.md) (how the table is mounted), [ADR 0057](0057-the-drawer-is-a-route.md) (the drawer drawn by the server), [ADR 0058](0058-one-delegation-root-over-a-server-rendered-canvas.md) (the server-rendered canvas), [ADR 0064](0064-a-group-is-a-plan-level-label-a-feature-points-at.md) (selection through `:has()`).
**Keeps whole:** [ADR 0033](0033-list-ships-no-share-tokens.md), [ADR 0040](0040-link-surface-url-token-authority.md), [ADR 0049](0049-per-rail-forward-pass-in-one-pure-package.md), [ADR 0061](0061-the-bridge-is-a-second-read-never-the-plans.md).

## Context

The report was one sentence: the Macroplan app is super slow. The suspects offered with it were the
API, the JSON files the plans are stored in, and React re-rendering in the browser. An audit measured
all three before anything changed, on a production build against a copy of the local data and a
seeded plan at the product's cap (2,000 items).

**None of the three was it.** A plan file reads in 5–8 ms and writes in 13–17 ms at 25 items, and
about 34 ms and 45 ms at the cap, so SQLite would have saved milliseconds. The API was fast — and
wasteful, answering every write with the whole plan for the app to discard and read again. And there
was nothing in the browser to re-render: the canvas and the table were Server Components, and 41 small
client components produced no long task at 25 items.

**The time went to the shape of the screen.** Every interaction waited for the server to re-render the
whole route and send it back:

- every write called `refresh()` and every zoom called `revalidatePath`, so each was a full server
  render shipped as 150–185 KB of Flight payload for a 12 KB plan, and Next runs Server Actions one at a
  time, so quick edits queued behind each other;
- every drawer open waited a fixed ~300 ms: `loading.tsx` put a Suspense boundary over the drawer, and
  React holds a boundary's reveal until 300 ms after its fallback appeared (the data arrived at 18 ms;
  the drawer at 326 ms);
- a click on a bar at Year or Quarter made two round trips in a row, a zoom and then the drawer;
- nothing moved before the server answered: a dropped bar jumped back until the answer came, and three
  clicks on the estimate stepper sent three 184 KB requests and moved the estimate one step;
- the view nobody was looking at was rendered anyway: at the cap the hidden table was 29,322 of the
  page's 31,032 elements, re-rendered and re-sent with every zoom and edit;
- hover text was quadratic on the server, about 400 ms of a render at the cap; and a hover restyled
  the whole screen, 222 ms a frame on average and up to 1.15 s.

| Measured before | 25 items | 2,000 items |
| --- | --- | --- |
| Page load | first byte 120–180 ms, loaded ~0.3 s | first byte ~1.1 s, ~2.7 s, 9.5 MB HTML |
| Open a drawer | ~325 ms | 5.3 s (from a bar at Quarter: two round trips) |
| Zoom | 50–90 ms, 150 KB | 2.3–2.8 s, 5.1 MB |
| An edit | 150–185 KB, nothing on screen until the answer | — |
| Hover frame | 16 ms | 222 ms average, up to 1.15 s |

On production the origin answers in 57–71 ms, but from the person's own machine a request waited about
a second before it was sent. A design where a click is a round trip cannot hide that.

## Decision

**The plan crosses into the browser once, and the browser answers every interaction from it.**

1. **One client root.** `[planId]/layout.tsx` and `s/[token]/seat-plan.tsx` read what only the server
   can — the plan, the bridge, the zoom cookie — and hand it to `components/plan/app/plan-app.tsx`
   with the Server Actions the surface may call. The plan is `planScreenModel`'s reduction, so no share
   token is in it. Everything on the screen — canvas, table, chips, tray, menus, drawers — is drawn in
   the browser from it. A server file may render exactly one client component from the plan subtree,
   `PlanApp`, and `module-boundaries.test.tsx` fails if a second appears: it follows every module the
   server runs, through the `@/` alias and re-exports, so a plan component that draws client fields
   beneath it counts as well as one imported directly.

2. **An optimistic store holds the plan** (`components/plan/store/plan-store.ts`). It keeps the last
   plan the API answered and a queue of changes on top of it, each a pure edit and the write that
   persists it. The screen renders the queue applied to the answer, with the schedule recomputed by
   `flatSchedule` — `@repo/schedule`, the code the API runs (ADR 0049) — so a drop moves every bar that
   depends on it in the frame it is made. Writes go out one at a time and in order: the store's queue
   guarantees it, not Next, which lets a queued action start when a navigation — every drawer move —
   discards the one before it. Each answer becomes the confirmed plan; a refusal drops its change, which
   takes it back off the screen, and leaves a sentence the screen shows (`app/plan-notice.tsx`). A plan
   the server pushes later is adopted unless it is older, and the confirmed plan only ever moves forward
   in time: an answer stamped before a plan adopted meanwhile does not take it back.

   Something created is drawn under a placeholder (`pending:N`) until its create is answered. The create
   then names the real id — the API appends what it creates, so it is the last of its kind in the answer —
   and the store reads the placeholder as it from then on (`real`), and the other way (`first`). That is
   what lets the reader act on new work at once: a rename in a just-drawn bar's drawer, an item added
   under it, a second bar drawn from its end are queued under the placeholder and go out under the id the
   API minted.

3. **Every write keeps its signature and is applied before it is sent.** `optimistic-actions.ts` wraps
   all 28 writes; each edit (`*-edits.ts`, `edit-order.ts`, `clean-name.ts`) mirrors the domain rule the
   API will run, and the answer corrects any guess. Every id a write carries is read through the store's
   `real` when it is applied and again when it is sent, never when it was made. A gesture that writes
   several times — a draw, a rail dropped into a gap — is one change whose persistence is the chain it
   always ran, so the whole drawing is on screen at once and a refusal part-way keeps what was stored; the
   chain names what it creates as each create is answered, and a create adds nothing under an id the plan
   already holds, so a plan pushed in the middle of a draw does not draw it twice.

4. **A plan write answers the reduced plan and re-renders nothing.** It used to answer the API's plan
   as it came, which put every live seat token on the plan into the response of every admin edit; it is
   reduced on the server now (ADR 0033). The bridge writes — bind, unbind, link, unlink, create a task —
   still re-render once they land, because what they change is in the bridge read only the server can
   make (ADR 0061); so does renaming the plan, whose name the breadcrumb and the tab title draw.

5. **A drawer is still an address, read in the browser** (ADR 0057's URL half stands). Opening one is a
   `history.pushState`, which Next's hooks follow, so Back, reload and a pasted link work as before; the
   drawer is drawn from the plan the store holds, and the drawer routes render nothing. An item's
   description and its rail's tasks are not in the plan, so they are read by a Server Action when its
   drawer opens — with the panel already on screen. A drawer opened on something still being created
   names its placeholder; once the create is answered it moves to the real address with `replace`, keyed
   by the id its subject was first drawn under, so the field being typed in is not remounted. A drawer
   closes when its subject's delete is **confirmed**, not when the delete is answered — by then the reader
   may have opened another, which the answer would have closed.

6. **The zoom is the screen's state**, remembered in the `mp_zoom` cookie by the browser and read by the
   admin layout on the next load.

7. **The rendering budget is the browser's now, and it is spent deliberately.** Only the chosen view's
   canvas is drawn. The table is the accessible rendering and stays mounted (ADR 0056's floor), but it
   mounts after the first paint, as a transition, renders from a deferred plan while it is off screen,
   and memoises its rows. Everything derived from a plan is derived once per plan object, and the store
   hands back the same object until the plan changes: the screen reads the plan alone (`usePlan`), so a
   write that changes nothing, a write starting or landing, or a notice dismissed redraws no mark.

8. **No rule on the screen asks `:has()`.** Selecting a rail or a group asked the radio with
   `:has(#radio:checked)` on the shell, and a hover asked each feature group whether it `:has()` a lit
   mark. Measured at the cap, that cost every hover a quarter of a second of style recalculation at every
   zoom, whatever the board held. The shell now states the chosen rail and group as `data-sel-rail` and
   `data-sel-group`, heard off whichever radio changed; the pointer marks a lit mark's group as lit; the
   table states its hidden columns as one `data-hide` list. The radios and checkboxes are still the
   controls. An item mark switches rather than fades on a hover, two thousand of them animating opacity
   having stalled the frames after it.

## Consequences

| Measured after | 25 items | 2,000 items |
| --- | --- | --- |
| Page load | first byte 59 ms, loaded 237 ms | first byte 0.22–0.25 s, loaded 0.44–0.51 s, 1.1 MB HTML at Year (2.4 MB at Sprint) |
| Open a drawer | 29–133 ms, no request (133 ms from a bar at Year, the canvas redrawn at Sprint first) | 133 ms; 0.61 s from a bar at Quarter; no request |
| Zoom | 44–50 ms, no request | 86–125 ms, 424 ms into Sprint, no request |
| An edit | on screen in 8–19 ms; a 2.6–2.8 KB answer behind it | drawer 104 ms, off-screen table 346 ms; a 98 KB answer |
| Three stepper clicks | three steps | — |
| Hover frame | 16 ms | 22–24 ms; 41 ms at Sprint |

Verified in a browser on a production build, on both surfaces: the feature, item, rail and group
drawers (the two add-a-thing drawers by their tests only), deep links, reload,
Back and Forward, drag and Undo, draw, both strip drops, rail reorder, dependencies, rename, the
stepper, retime, delete, a write with the API down (taken back, and the notice says why), zoom by
switch, wheel, drill and chip, the table's search, filters, sort and columns, and a manage and a view
seat whose every link stays on `/s/<token>/`.

After review, again on a production build, with every Server Action held back 1.5 s to stand in for the
second a request waits on the person's own machine: an item added in a drawer and opened at once (open
on its placeholder in 179 ms, moved to the real address when the create answered, the same field node
throughout, and a rename made meanwhile saved under the real id across a reload); a rail dropped from the
strip (its drawer open in 139 ms, then following the rail to its id); a delete with another drawer opened
while it was out (left open by the answer); a rail chosen, the table shown and the timeline back (the
rail's radio still checked); a cleared sprint length (refused, the board still on its 10-day sprints).

What it costs:

- **The browser holds the plan** — about 0.7 MB of JSON at the cap — and the first load ships it once.
  That is the trade: one transfer instead of one per interaction.
- **The screen is client JavaScript now.** The plan route ships 228 KB of script compressed (741 KB
  decoded); the plans list, which shares the framework, ships 149 KB (487 KB). The screen's own code is
  the difference, about 79 KB on the wire.
- **The edits are mirrors of domain rules.** A divergence shows as a correction when the answer lands,
  never as wrong data: the answer is authoritative and replaces the guess. Each edit has tests of its
  own, written against the domain's. A value the API would refuse is not drawn at all where drawing it
  would break the board — a retime holds each setting to the payload's own rule, mirrored rather than
  imported so the screen ships no schema library, and a test holds the mirror to the contract's schemas.
- **Two tabs on one plan** see each other's changes on their next answer or reload. Every answer is the
  whole plan, so one write in a tab brings it up to date.
- **The bridge writes and a plan rename** still cost one round trip, as above.
- **At the cap, the table's mount** is one frame of about 400 ms after load: style for 30,000
  elements the accessibility floor keeps mounted. Measured alternatives — `content-visibility`, fixed
  table layout — gained nothing worth the risk to the reading order.
- **Before hydration** a chip or a swatch checks its radio and dims nothing; selection was CSS-only
  before and needed no script.
- **Server Components are no longer the plan screen's floor.** The token guarantee moved from "a client
  component is handed only primitives" to "one root is handed a reduced plan, and its props are swept
  on both surfaces" (`[planId]/layout.test.tsx`, `s/[token]/seat-plan.test.tsx`).

## Alternatives considered

**SQLite.** The files were not the bottleneck; the measurements above say so to the millisecond.

**`useMemo` and contexts inside the server-rendered design.** The re-render that hurt was on the server,
where neither reaches.

**The quick wins alone** — delete `loading.tsx`, `useOptimistic` per field, one round trip for a drill.
That takes the 300 ms off a drawer and leaves every interaction a round trip carrying the whole route,
which from the person's machine is the second they were feeling.

**A data library** (TanStack Query, SWR). Neither is on the app's import allowlist (ADR 0027), and what
is needed is a plan, a queue and a subscription: about two hundred lines over `useSyncExternalStore`.

**Mounting the table only when it is chosen.** Cheapest of all, and it would make the canvas — one
`role="img"` with nothing a screen reader can use inside it — the only rendering on the page by
default, which ADR 0056 exists to forbid.
