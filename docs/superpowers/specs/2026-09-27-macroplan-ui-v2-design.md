# Macroplan plan page, second revision

The first revision moved rails into a sidebar, forms into drawers and added arcs, diamonds and zoom.
Looked at in a browser it still reads as a stack of prose with a diagram at the bottom. This revision
is about what a person sees, in the order they see it.

Two instructions drive it, both from the product owner after looking at the deployed page:

1. *"How this plan contradicts itself — I don't even want this to exist. If there's an issue with an
   entity, you mark an error on the item itself."*
2. *"Make the design more github like, azure devops boards, something that's clean and simple, yet
   powerful."*

## 1. What is actually wrong

Measured on the deployed page at 1600×1000, and reproduced locally against a seeded plan.

### 1.1 The timeline is 272px wide on a 1545px grid

`PlanScreen` splits with `lg:grid-cols-[17rem_minmax(0,1fr)]` and the seat surface passes
`sidebar={null}`. A null React child renders nothing at all, so the views column becomes the *first*
grid item and lands in the 17rem track. The graph — the product — draws into 272px while
`minmax(0,1fr)` sits empty beside it. The admin surface escapes this only because it passes a real
sidebar.

This is a defect, not a taste question, and it is the single worst thing on the page.

### 1.2 The conflict wall is first, and prints everything twice

`ConflictList` renders above the canvas and before the sidebar. On the deployed plan it produced
about thirty rows, and `rowOf` renders each row as a `<p>` sentence *and* a `<ul>` of linked
subjects, so every problem appears twice in succession:

> Re-run migrate-plan on all three tenants has no estimate, so it was left off the timeline.
> Re-run migrate-plan on all three tenants

The graph began at y=2780 on a 3150px page. A viewer scrolled past 2.8 screens of that to reach the
thing they came for.

Most of those rows are *items* with no estimate. An item is never a bar on the timeline — it is a
tick under its feature — so "left off the timeline" is not news about an item, and thirty repetitions
of it is the entire wall.

### 1.3 The sidebar overflows its column

`RAIL_ROW` is a flex row whose name uses `flex-1 truncate`. `flex-1` is `flex: 1 1 0%` and does not
set `min-width: 0`, so the flex item keeps its `auto` minimum and refuses to shrink. The row grows
past 17rem, the grid track does not clip it, and the per-row `Open` link lands on top of the canvas
at x≈415. Rail names are then painted over by the canvas card.

### 1.4 Bars carry no label

A feature bar is a `<rect>` with `data-feature-id` and no text. Nothing on the timeline says what any
bar *is*. The rail name is drawn once per band inside the SVG gutter, and that is all the text there
is. A viewer cannot read the plan; they can only look at it.

### 1.5 The drawer is a floating panel

`DRAWER_DOCK` is `fixed inset-y-0 right-0 z-40 … border-l bg-card` with no scrim, no header bar, no
close control and no `Escape` handling. It overlaps the app bar. Inside, "move in its feature" renders
one full-width `<button>` per destination — eight buttons on a plan with eight features.

### 1.6 Density and vocabulary are wrong for the job

58px rail bands, 18px bars, pill-shaped radio tabs, `rounded-xl` cards with `ring-1` everywhere. The
reference tools are dense: Azure DevOps delivery plans and GitHub Projects put more rows on screen,
use one accent colour, and separate regions with hairlines rather than floating cards.

## 2. Shape of the new page

A fixed three-row frame that fills the viewport, so the timeline is on screen at load and scrolls
inside its own pane rather than pushing the page down.

```
app bar                        (unchanged, @repo/ui)
─────────────────────────────────────────────────────────────────────
Plans / Identity Management Plan              [Share] [Settings] [+]   ← plan bar
starts 28 Sep 2026 · 10-day sprints · UTC                              ← meta line
─────────────────────────────────────────────────────────────────────
Timeline │ Table        All work ▾ groups        Year Quarter Sprint   ← toolbar
─────────┬───────────────────────────────────────────────────────────
 RAILS ⚠4│ Q4 2026        W1–2   W3–4   W5–6   W7–8                    ← sticky time header
 ⌕ filter ├───────────────────────────────────────────────────────────
 ▾gwi-auth│ ▬▬▬▬ 01 Establish the state                               │
   01 …   │      ╰──▶ ▬▬ 02 EuroWIN roles                             │
   02 ⚠   │                                                            │
 ▾eu_win  │                                                            │
─────────┴───────────────────────────────────────────────────────────
 Not scheduled (4)  05 Tenant migration dry run ⚠ needs an estimate …  ← tray
```

Regions are separated by `border-b` hairlines, not by floating cards. The sidebar and the timeline
pane each scroll on their own axis.

## 3. Problems belong to entities

`ConflictList`, `conflict-rows.ts` and `conflict-links.tsx` are deleted. Their replacement is
`components/plan/attention/`, which answers a different question: *what is wrong with this entity*,
keyed by id.

```ts
export type AttentionKind = 'no-estimate' | 'in-cycle' | 'edge-ignored' | 'items-unsized'

export interface Attention {
  readonly kind: AttentionKind
  readonly detail: string
}

export type AttentionMap = ReadonlyMap<string, readonly Attention[]>

export function attentionOf(plan: AttentionPlan): AttentionMap
```

Every problem the schedule can report already names an entity, so nothing is lost:

| `ScheduleResult` field | names | becomes |
| --- | --- | --- |
| `unscheduled[].reason === 'no-estimate'` on a **feature** | that feature | `no-estimate` on the feature |
| `unscheduled[].reason === 'no-estimate'` on an **item** | that item | `items-unsized` rolled up onto its feature, plus `no-estimate` on the item itself |
| `unscheduled[].reason === 'in-cycle'` | that feature | `in-cycle` on the feature |
| `cycles[].featureIds` | each feature | `in-cycle` on each |
| `ignoredEdges[]` | the waiting feature | `edge-ignored` on it, naming the dependency |

The rollup is what empties the wall. Thirty unsized items on four features becomes four features
carrying "3 items need an estimate", and the items themselves carry their own badge where they are
already listed — in their feature's drawer.

Where an attention shows:

- **sidebar row** — a dot, with every detail on it as the row's `title`
- **timeline** — an unscheduled feature is not drawn as an anonymous gutter stub; it moves to the tray
- **tray** — one row per unscheduled *feature*, with its reason and a link to its drawer
- **drawer** — a callout at the top naming every attention on that entity
- **the plan's meta line** — a count, beside the calendar

Nothing renders a sentence twice.

**As built, two things differ from the sketch above.** The count went next to the plan's calendar
rather than into the sidebar heading, and it is a statement rather than a filter: a count that is also
a toggle is a count nobody trusts, and the sidebar's search box already narrows the tree. The count is
of **features**, not of every marked entity — counting the rolled-up items as well made the header say
"19 need attention" over a page showing four marks.

## 4. The timeline

### 4.1 The rail names leave the SVG

Rail names move out of the SVG gutter into an HTML column beside it. The column is a sibling grid
track, not part of the scroller, so names stay put while the timeline scrolls horizontally, and each
name becomes a real link with a real count and a real badge.

The SVG then holds only the time grid, the bars, the item marks and the arcs, and its `viewBox`
starts at day zero rather than at `-gutter`. `gutterX` and `stubX` go away with it.

### 4.2 Bars get labels

New pure geometry in `@repo/canvas`, because deciding where a label goes is arithmetic and
`happy-dom` answers every measurement with a zero `DOMRect`:

```ts
export interface BarLabel {
  readonly id: string
  readonly x: number
  readonly inside: boolean
  readonly maxChars: number
}

export function barLabels(bars: readonly FeatureBar[], metrics: LabelMetrics): readonly BarLabel[]
```

A label sits inside its bar when the bar is wide enough for a useful number of characters, and to the
right of it otherwise, truncated to the gap before the next bar on that rail. Bars on a rail are
already sorted by `x` and do not overlap, so the gap is the next bar's `x` minus this bar's end.

### 4.3 The range follows the plan, and so does the opening zoom

`ZOOM_STOPS` fixes `pxPerDay`; the day range stops being a constant and is derived from the plan's
own span, padded to a whole sprint and floored at one pane's worth of days.

That alone was not enough, and the browser said so: a sixteen-day plan at the Quarter scale still
drew its bars into the first ninety pixels of eleven hundred, because the floor put eighty days of
empty axis beside them. A single default zoom is wrong for most plans, and it is wrong in a way no
amount of choosing the right constant fixes — the right scale depends on how long the plan is.

So `readZoom` answers `Rung | null`, and a plan with no remembered choice opens at `openingZoom`: the
**finest scale it very nearly fits**, because the finer the scale the more a bar can say. At four
pixels a day a feature is a smear; at forty-two it is a bar wide enough to carry its own name.

### 4.4 Density

| | before | after |
| --- | --- | --- |
| rail band | 58px | 44px |
| bar | 18px | 22px |
| chrome | 46px | 0 (the header is HTML) |

## 5. Drawers become real

`DrawerShell` and `DrawerPanel` share a dock: a scrim that closes the drawer when clicked, a header
with the subject's kind, its name and a close control, and a body that scrolls.

The scrim is an **anchor to the plan's own URL**, not a listener — so clicking away works with no
JavaScript, and `Escape` is left for a later pass rather than made the only way out. It is
`aria-hidden` and out of the tab order, because the labelled control in the header is the accessible
way out and a second unlabelled tab stop over the whole page is worse than none.

The dependency editor's rows become a checkbox beside its name rather than above it, and the cycle
refusal that used to wrap to three lines under **every** candidate is truncated to one, with the
whole sentence still the box's accessible description. On a plan where most features are
transitively linked, that editor was the conflict wall again in miniature.

## 6. What stays

- Drawers stay routes (ADR 0057). The canvas stays in `layout.tsx`, so zoom stays a cookie for the
  admin and the default for the seat (ADR 0040 forbids the seat reading one). §4.3 makes the default
  right for short plans, which is most of what the seat surface was suffering from.
- Group selection stays generated `:has()` CSS (ADR 0064); the attention filter joins it rather than
  introducing state.
- Canvas geometry stays a pure package with no DOM (ADR 0055); §4.2 adds to it rather than measuring
  in a component.
- A `bound ` function name stays the only way a token reaches a client component (ADR 0040).

## 7. Out of scope

- A Microtask project picker on the bind form.
- Zoom on the seat surface as a route segment.
- Drag-and-drop rescheduling beyond what already works.
