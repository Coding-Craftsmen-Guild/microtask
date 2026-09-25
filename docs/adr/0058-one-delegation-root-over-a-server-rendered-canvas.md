# ADR 0058 — One delegation root over a server-rendered canvas, and `children` is the one exception it needed

**Status:** Accepted · 2026-09-25

## Context

Spec §6 asks for drag: "Dragging reorders an item within its feature or a feature within its rail,
moves a feature to another rail, or sets a pin." A drag needs pointer events, pointer events need a
client component, and the thing being dragged over is the only `<svg>` this codebase authors — 200
feature bars and 2,000 item marks at this product's caps (`packages/contracts/src/limits.ts`), all of
it a Server Component since phase 2.

So the question is not whether a client boundary appears in the canvas. It is **how many**, and what
crosses each one.

Two facts from earlier phases bound the answer before this one had a choice to make.

**Phase 2 refused the transparent sheet by name, and left the attributes for whatever replaced it.**
`components/plan/canvas/feature-bar.tsx` records that a bar's own hover is unreachable because "an
SVG tooltip resolves by walking the DOM ancestors of the element the pointer hit rather than by paint
order — a painted fill absorbs the pointer and the rect beneath is never consulted", measured in
Chromium; and it says what phase 3 must not inherit: "a transparent sheet over every bar would swallow
the drag and the click it adds." The same file already writes `data-feature-id`, `data-slot`,
`data-start-day` and `data-end-day` onto every bar, and ADR 0056 made those attributes load-bearing
contract rather than test convenience, because the canvas-to-table parity test scrapes them.

**Nothing about the plan may cross a client boundary.** `components/plan/module-boundaries.test.tsx`
holds the rule as an assertion rather than a convention: a client component under
`components/plan/**` may be handed **primitives, unbound functions and `null`**, which rules out the
plan, the reduced `PlanScreenModel`, a `TableRow`, a `PlanShareLink` and the whole actions object by
shape rather than by name (ADR 0033). The admin's own plan read carries every live seat token, so the
sweep is a leak check and not a style rule. It also refuses any function whose name begins with
`bound `, that being what `Function.prototype.bind` names its result and the mechanism ADR 0040
describes for handing a token to a component.

That second fact is the interesting one, because a client component that *wraps* server-rendered
markup is handed an element, and an element is none of the three things the sweep admits.

## Decision

**The canvas gains exactly one client boundary: a delegation root that wraps the server-rendered
`<svg>` and resolves what was grabbed by `closest()` on the event's target.**
`components/plan/canvas/drag-root.tsx` is that file, it is the only `'use client'` file under
`components/plan/canvas/`, and `module-boundaries.test.tsx`'s allowlist is asserted exact in both
directions, so a second one cannot arrive unnoticed.

Three options were open and two lost.

**A client canvas.** Put `'use client'` on `PlanCanvas` and let React render the SVG in the browser.
One boundary, no delegation, and every bar's handler is an ordinary prop. Rejected because the plan
then crosses the boundary — the whole shape of it, tokens dropped but every epic, feature, item and
span intact — for a gesture that touches one feature, and because 2,200 nodes are then rendered twice,
once on the server for the HTML and once in the browser to hydrate.

**A client component per bar.** Keep the canvas a Server Component and make each bar an island. It is
the shape that needs no delegation and no `data-*` at all. Rejected on the payload: 200 bars is 200
islands and 200 sets of props in the Flight payload, and a per-drawn-node version is 2,200. Each
island's props are the bar's own geometry, so the layout is serialised into the HTML a second time
beside the SVG that was drawn from it.

**A transparent sheet over the bars.** One element, one handler, no islands, and it is the answer SVG
drag tutorials reach for. Rejected by **phase 2**, not by this phase: the sheet absorbs the pointer,
so the bar beneath is never consulted — which costs the drag its target *and* costs the click the
drawer needs. `feature-bar.tsx` says exactly that, and this is why the listener is on the element
*around* the canvas and why the drag ghost is `pointer-events-none`.

**So the root wraps and delegates.** `heldFrom(event.target, canvas)` walks up to the nearest
`[data-feature-id]`, which means what was grabbed comes out of the markup rather than out of a hit
test, and the rails a drop is resolved against are **read back off the SVG** at `pointerdown`
(`components/plan/canvas/selection.ts`). That is not only a boundary workaround: a drop answered
against what is on screen cannot disagree with what is on screen, where a second copy of the layout in
the browser could. What does cross as numbers is the scale's two fields and the axis's x — the same
values the SVG was drawn from, threaded out of one `canvasLayout` call — so `scaleFor` rebuilds the
scale that drew the bars rather than forming a second opinion about it.

### The `children` exception, which is narrow in both directions and tested rather than declared

A client component that wraps markup is handed an element on `children`, and `handedOk` refuses
elements — as it must, because an element on any *other* prop is a slot whose own props nothing has
inspected. `PlanScreen`'s `drawer` is exactly such a slot.

So the sweep gained one exception and it is **a prop name and a shape**: only the prop literally named
`children`, and only a React element or an array of them. `handedAs(name, value)` is
`handedOk(value) || (name === 'children' && renderable(value))`, and four cases hold it to that rather
than trusting the sentence:

- it **admits** markup on `children`, singly and array-wrapped, and refuses an element on `drawer` and
  on `row`;
- it admits **no data** on `children` either — a plan, a `PlanScreenModel`, a `TableRow`, the whole
  actions object and an array-wrapped plan are each refused there, by the same walk that refuses them
  everywhere else;
- it refuses a **`bound ` function on `children` too**, planted as
  `((token) => token).bind(null, seat)` over a token read off the fixture;
- and it asserts the exception is **exercised**: `drag-root.tsx` really is handed markup by one of the
  rendered trees, so the case is not a declaration about a code path nothing takes.

What the exception costs is stated plainly in the file: the walk does not inspect what is *inside* the
markup, and it never did for any slot. The guard that makes that safe is the allowlist — anything
nested in there that were a client component would have to be a `'use client'` file, and every one of
those is named.

### The one line no test in this repository can cover

`canvas.getBoundingClientRect().width`, in `DragRoot`'s `start`. ADR 0055 records why: on the pinned
`happy-dom@20.14.3` every `getBoundingClientRect` answers a zero `DOMRect` and every `getCTM` an
identity matrix, so a measurement is a number a test is handed as 0 and can only assert against 0.
Screen pixels to `viewBox` user units is a ratio, and that ratio is the measurement.

It is **one line**, it is the only measurement in the component, and everything around it is arithmetic
over numbers: `originAt` is a pure function of a point, a box and a width, tested directly, and it
answers a factor of 1 for the zero this measurement has under test. Every subsequent position is
`anchor + delta`, which needs no CTM at all — `selection.ts` argues that split, and `@repo/canvas`'s
`drag.ts` takes a `DragPoint` of two numbers rather than an event or a rect for the same reason.

The consequence is a **browser-verification item this phase hands forward**, written into the
component rather than into a task list: open a plan, drag a bar, check that the ghost tracks the
pointer at 1:1 and that the bar lands where the ghost was. A wrong factor is invisible to every test
here and obvious in one gesture.

## Consequences

- **`data-feature-id` and `data-slot` are now read by two mechanisms**, the parity test of ADR 0056 and
  this drag, so removing one breaks a gesture as well as an assertion. That is a deliberate
  concentration: the attributes are the interface between the server-rendered picture and the one
  client component over it.
- **The boundary sweep is stricter than it was, not looser.** Before this exception it admitted any
  function at all; it now refuses `bound `-prefixed ones on every prop, which is the mechanism a token
  would actually travel by. The `children` hole it opened is one prop name wide and is closed to
  everything but markup.
- **The canvas re-renders nothing during a drag.** `children` is the server's markup, held by
  reference; what changes is the ghost and the notice beside it. A drop sends one request for one
  feature, and the API answers the whole recomputed plan (ADR 0048), so what is on screen afterwards is
  what the server stored rather than a local edit.
- **Nothing is captured with `setPointerCapture`**, so a drag continued outside the frame is one that
  ended at the edge. That is honest about what was last seen rather than extrapolating from a pointer
  the canvas stopped hearing from, and a pointer that leaves the frame cancels — the same answer as a
  drop on the chrome.
- **A keyboard gets the drawer's controls and not this.** A control that exists only under a pointer is
  a control a keyboard user does not have, and `happy-dom` cannot drive a real drag either — so `Move
  up` / `Move down` and the rail control go over the same `place` action
  (`components/plan/drawer/place-controls.tsx`), the ghost is `aria-hidden`, and ADR 0056 records that
  there is no a11y tooling here to check either half.
- **`data-drag` states whether the frame listens at all**, because the handlers are invisible in the
  markup and a canvas whose drag was wired to nothing would render identically to one that works.
- **A seat surface gets no drag yet**, and the reason is not this ADR's: `/s/<token>` passes
  `actions={null}`, because a seat's writes are bound to its token and no leak sweep here reads a bound
  function's arguments. The task that widens a walker is the task that mounts them.

## Alternatives considered

**A client canvas.** Simplest to write and the only option needing no `data-*` contract. Rejected for
the plan crossing the boundary and for 2,200 nodes rendered twice. It is also the option that would
have made ADR 0056's parity test meaningless as a constraint on the canvas, the attributes being
needed by nothing.

**A client component per bar.** Rejected on payload: 200 islands, or 2,200 if the marks are included,
each carrying geometry the SVG beside it already expresses. The failure mode is not an error — it is a
page that works and is several times larger than it needs to be, which is the kind of cost nothing
fails on.

**A transparent sheet over the bars.** Rejected in phase 2 and re-rejected here. It is worth recording
that the phase-2 refusal was about *hover* and this phase's need is *drag*: the measurement
(`feature-bar.tsx`, in Chromium) is the same one, because both are the pointer resolving against the
topmost painted fill. A sheet would have taken the click the drawer route needs (ADR 0057) along with
the drag.

**Widen the boundary sweep to admit any element on any prop.** One line, and it would have covered
`children` without a special case. Rejected because it is the half of the rule that catches the most:
an element on a non-`children` prop is a slot, and a slot's own props are exactly what nothing here has
inspected. `PlanScreen` passes four such slots today.

**Admit `children` by naming `DragRoot` in the sweep instead of naming the prop.** A per-component
exception rather than a per-prop one, which reads more like an allowlist and matches the file list
beside it. Rejected: it would exempt every prop of that component rather than one, so a plan handed to
`DragRoot` on some future prop would pass. The shape of the exception should match the shape of the
thing being admitted, which is markup in a slot and not a component being trusted.

**Compute the screen-to-SVG factor from the constants instead of measuring.** `CANVAS_SCALE` and the
`viewBox` are both known on the server, so the ratio could be derived rather than measured, and it
would then be testable. Rejected because it is only correct while the SVG is rendered at its intrinsic
size: the screen wraps the canvas in a scroll container and a `width` that responds to the column would
make the derived factor silently wrong, in the one direction no test could see. Measuring is right and
untestable; deriving would be testable and wrong.

**Put `railTop`'s inverse in the app beside it rather than in `@repo/canvas`.** The app already holds
this screen's constants (ADR 0055's split: "the package holds what is arithmetic over the model; the app
holds what this screen chose"). Rejected because `railAtY` and `dropTargetFor` are arithmetic over the
model given two numbers, and those two numbers — `chromeHeight` and `railHeight` — are handed in as a
`RailMetrics` for exactly that reason. The inverse projection belongs with the forward one, which is
what the amendment to ADR 0055 records.
