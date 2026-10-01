# Handoff: Macroplan plan timeline restyle ("Calm board", option 4a)

## Overview
This restyles the Macroplan plan page (`apps/macroplan/components/plan/**`) in `Coding-Craftsmen-Guild/microtask`:
- one rail list instead of two
- a three-tier time header
- features drawn as lines with their items as bars at Sprint zoom
- an "Add" strip with drag-to-create pills
- + handles on bars and diamonds that let you draw provisional work
- a resizable bottom panel with stacked tabs, holding a redesigned feature/item form

It replaces the right-hand drawer, the hover card styling, and the sidebar rail tree.

## About the design files
`Plan Timeline Restyle.dc.html` is an **HTML design reference**: a prototype showing the intended look and behaviour. It is not production code. Open it in a browser next to `support.js`. Section **4a** (top of the page) is the target. 3a, 2a, 2b and 1a are earlier explorations and the recreated current state, kept for context.

Recreate the design in the existing Next 16 / React / Tailwind v4 / shadcn stack, following the repo's conventions:
- Server Components by default.
- Whole Tailwind class strings in `*-css.ts` modules, never composed (`module-boundaries.test.tsx`).
- Client components receive only primitives (ADR 0033).
- Drawers remain URL routes (ADR 0057). The bottom panel is the new frame for those routes.

The prototype's sample data (item names, rails 6–7 features) is invented. Real data comes from `PlanScreenModel` / `PlanBridge`.

**Prototype limitations** (expected; implement them properly):
- Edits are local state only.
- Starts are recomputed by a simple per-rail cascade instead of `@repo/schedule`.
- Drag maths assume an unscaled canvas.
- The rail filter input is not wired.

## Fidelity
**High-fidelity.** Colours, sizes, radii and copy are final. Where a value below differs from the HTML, the README wins.

---

## Design tokens

Existing tokens in `packages/ui/src/styles/globals.css`. Keep them:

| Token | Value | Use |
|---|---|---|
| `--color-brand` | `#2e2456` | app bar, primary buttons, selection, drag guides |
| `--color-brand-soft` | `#efecfa` | selected/lit rows, focus ring halo |
| `--color-gold` | `#ffd24a` | app-bar underline, TODAY tag |
| `--color-gold-deep` | `#e0ac00` | today line |
| `--color-ok` | `#1f9d6b` | Phase 1 group hue in samples |
| `--border` | `oklch(0.922 0 0)` ≈ `#e5e5e5` | hairlines |
| `--muted` | ≈ `#f5f5f5` | segmented-control trough |
| `--muted-foreground` | ≈ `#737373` | secondary text |

New tokens to add to the `@theme` block (see `tokens.css` in this folder):

| Token | Value | Use |
|---|---|---|
| `--color-ink-soft` | `#3a3650` | field labels |
| `--color-hint` | `#8a8699` | helper copy under fields |
| `--color-label` | `#8a8a8a` | uppercase micro-labels (EPIC, ESTIMATE…) |
| `--color-line` | `#f0f0f0` | lane separators, inner dividers |
| `--color-line-strong` | `#e0e0e6` | input and stepper borders |
| `--color-panel-strip` | `#f6f5f9` | panel tab strip and resize grip background |
| `--color-panel-col` | `#fbfbfc` | Items column background, Add strip |
| `--color-sprint-alt` | `#fafafa` | alternating sprint column fill |
| `--color-warn` | `#b45309` | "can't add: would loop" text |
| `--color-danger` | `#b91c1c` | delete text (if kept in a ⋯ menu) |

Group hue derivatives. Compute them from the group's colour; don't store them:
- **wash** = hue at 18% alpha (`${hex}2e`), used for bar fill
- **stroke** = hue at 100%
- **chip tint**: Phase 0 `#f1edfd` with text `#4c1d95`; Phase 1 `#e8f5ef` with text `#0f5a3d`. In general: tint = `color-mix(in oklch, hue 10%, white)`, text = `color-mix(in oklch, hue 60%, black)`
- **bar label ink** = the same dark text colour

Typography: the system stack already in `--font-sans`. Sizes in use:
- 20/650: plan title
- 17/650: panel title input
- 13/500–600: body and controls
- 12: chips, secondary
- 11: header sub-labels, counts
- 10.5/600: feature-line label
- 10/600, letter-spacing .05em, uppercase: micro-labels

Radius: 6px controls/bars, 7–8px inputs/steppers, 10px popovers and cards, 999px chips, 4–5px items/tags.

Shadows:
- card/popover: `0 12px 32px rgba(46,36,86,.16), 0 2px 6px rgba(0,0,0,.06)`
- panel top: `0 -6px 20px rgba(46,36,86,.06)`
- segmented thumb: `0 1px 2px rgba(0,0,0,.08)`
- focus: `border-color brand` plus `0 0 0 3px brand-soft`

---

## Layout (top to bottom, full viewport `h-dvh`, flex column)

### 1. App bar (`packages/ui/src/shell/app-bar.tsx`, `width="wide"`)
- `bg-brand`, 3px gold bottom border, padding 8px 20px, gap 12px.
- Logo 28px with radius 7px.
- Lockup: "Macroplan" 14px/700, tracking .02em; "CC GUILD" 10px, tracking .14em, gold, uppercase.
- A 1px × 22px divider (`rgba(255,255,255,.18)`), then the breadcrumb, 13px: "Plans" `#c9c3e6`, "/" `#8e86b5`, then the plan name in 600 white.
- Spacer, then "Sign out" 13px `#c9c3e6`.

### 2. Plan head + toolbar (merged into one row)
`shell/plan-head.tsx`, `shell/plan-toolbar.tsx`. Padding 14px 20px, border-bottom, gap 16px. Left to right:
- **Title block:** name 20px/650, lh 1.15. Meta line 12px muted: `starts 2026-09-28 · 10-day sprints · UTC`.
- **View switch:** the existing `VIEW_SWITCH` tabs (Timeline | Table), 12px left margin.
- Spacer.
- **Group chips:**
  - All work (checked): `bg-brand`, white, 4px 10px, full radius.
  - Each group: tint background, dark text, 8px dot, then name and count.
  - New group: dashed `#d4d4d4`, muted, text "+ Group".
  - These keep the radio/`:has()` mechanism in `labels/group-chips.tsx`; only the classes change.
- A 1px divider.
- **Zoom switch:** existing `ZoomSwitch` (Year / Quarter / Sprint).
- **Buttons:** Settings (quiet), Share (primary). Both 28px high.

### 3. Add strip (new: `shell/create-strip.tsx`, client)
- Height 44px, `bg-panel-col`, border-bottom, padding 0 20px, gap 8px.
- Label "ADD": 11px/600, tracking .06em, `--color-hint`.
- Three draggable pills: 28px high, radius 999px, white, 1px `#d9d6e4` border, 12px/600 brand text, `0 1px 2px rgba(46,36,86,.06)`, hover border brand, `cursor: grab`. Each has a small glyph:
  - **Epic:** 14×10 outline box, 1.5px brand border with a 4px left edge
  - **Feature:** 16×6 bar, hue wash with 1px stroke
  - **Item:** two 6px squares, one solid hue and one at 50%
- After a 1px divider, a live hint at 12px `#5b5675`:
  - idle: "Drag a pill onto the board to add it. Drag a rail name to reorder rails. Double-click a rail name to rename it."
  - per drag kind, see Interactions.

### 4. Board (`board/plan-board.tsx`)
**One** scroll container, `overflow: auto` on both axes, `flex: 1; min-height: 120px`. Inside it, a box of width `264 + timelineWidth`:

- **Sticky header row** (top 0, z 6, 72px, white, border-bottom):
  - **Corner** (sticky left 0, z 7, 264px, border-right): filter input (13px, 5px 8px, radius 6) and a 28px square "+" button, bottom-aligned with 10px padding.
  - **Time header** (`board/time-header.tsx`), three tiers:
    1. Year, 20px: "2026" 11px/700, tracking .08em, brand colour, 10px padding, bottom border `--color-line`.
    2. Quarter, 22px: cells as now. A partial leading quarter is shaded `#fafafa` and labelled short ("Q3"); a full one is labelled "Q4 2026", 11px/600, with a left border.
    3. Sprint, 30px: at Sprint zoom "Sprint 1" (12px/600) plus "W40–41 · Sep 28 – Oct 9" (11px muted, tabular). At Quarter zoom "S1" plus the start date. At Year zoom "S1" only.
  - **TODAY tag** sits in the year row (top 2px) at `todayX + 4`: gold background, brand text, 10px/700, padding 1px 6px, radius 4.
- **Body row** (`display:flex`):
  - **Rail column** (sticky left 0, z 5, 264px, white, border-right). This **replaces both** `sidebar/plan-sidebar.tsx` (tree) and `board/rail-names.tsx`.
    - One row per rail, at lane height. Padding 0 14px 0 6px, gap 10px.
    - Contents: grip "⋮⋮" (10px, `#c4c1d0`), 10px swatch with radius 3, name 13px/600 truncated, count 11px muted ("5 features").
    - Hover background `#faf9fc`, cursor grab.
    - Double-click turns the name into an inline input (28px, brand border, brand-soft ring).
  - **Canvas** (relative, width = days × pxPerDay, at least the pane width):
    - Sprint columns alternate white / `--color-sprint-alt`, with a 1px `#ededed` left border.
    - Lane separators: 1px `--color-line`.
    - Today line: 2px `gold-deep`.

Lane height: **52px at Sprint zoom, 48px otherwise.** Pixels per working day: Sprint 40, Quarter 12, Year 4.

### 5. Bottom panel (new; replaces `drawer/drawer-shell.tsx` positioning)
- Height is user-resizable, default 360px, clamped 140–820px; persist it in a cookie or localStorage.
- `flex-shrink: 0`, white, top border `#dcdae4`, panel-top shadow. The board above shrinks to fit.
- **Resize grip:** 10px high, `--color-panel-strip`, centred 44×4 pill `#cfccd9`, `cursor: row-resize`. Hover background `brand-soft`.
- **Tab strip:** 38px, `--color-panel-strip`, border-bottom.
  - Tab: 32px high, max 280px, radius 8 8 0 0. The active tab is white with a 1px border and no bottom border, overlapping the strip's border by 1px.
  - Tab contents: 8px marker (filled circle for a feature, outlined 2px-radius square for an item, both in the rail hue), kind label 11px `--color-hint` ("Feature" / "Item"), name 12px (600 active, 500 otherwise) truncated, and an 18px × close (hover `#ecebf1`).
  - Right of the tabs: "Hover for a summary · click to open another tab", 12px hint colour.
- Each open tab is a drawer route. Opening one pushes it onto the stack; closing it pops to the previous tab. Tabs are keyed by entity id.

---

## Timeline marks

### Sprint zoom: feature = line, items = bars
Per lane, with `lt` = lane top:

**Feature line**
- 2px line (3px when lit) in the group hue, at y = `lt + 10`, running from the feature's start x to its end x.
- Diamonds at both ends: 8px (10px lit), rotated 45°, hue fill, radius 1.5, with a `0 0 0 1.5px #fff` halo.
- Label: starts 10px after the start diamond, white background, padding 0 5px, 10.5px/600 in the group's dark ink, truncated to the line width minus 24px.
- Clicking the line opens the feature tab.

**Items**
- Bars at y = `lt + 20`, height 24, radius 5.
- Fill is the wash, border 1.25px hue (2.5px lit). Label 12px/500 in the dark ink, padding 0 7px, truncated.
- Items lay out back to back from the feature start; each bar is inset 2px at both ends.

**Item ticks** (the old 3px strips under bars) are gone at Sprint zoom; the items replace them.

### Quarter and Year zoom: feature bars
- Bars at y = `lt + 10`, height 28, radius 6, wash fill, 1px stroke (2px lit), label 12px/600.
- Items are not drawn.

### Dependency arcs
- Drawn from the source's end to the target's start: end diamond to start diamond at Sprint zoom, bar edge to bar edge otherwise.
- Cubic bezier with control offset `max(24, |dx|/2)`.
- Stroke in the **source rail's** hue, 1.25px, opacity .85.
- On hover: arcs touching the hovered feature go to 2px; all others drop to .12.

### Hover dimming
Hovering a feature or item keeps that feature, its direct dependency neighbours and its items at full opacity. Everything else goes to .35. Transition: opacity .12s.

---

## Hover card (`canvas/hover-card.tsx`, `canvas/pointer-css.ts`)
- 300px wide, white, 1px border, radius 10, card shadow, `pointer-events: none`.
- Position: 8–10px below the mark, clamped inside the canvas.
- Content:
  - **Context line:** 11px muted, with an 8px rail dot. For a feature: "Phase 0 · gwi-auth". For an item: "Item of <feature>".
  - **Title:** 14px/600, lh 1.3, wrapping.
  - **3-column fact strip:** `#fafafa` background, top border.
    - Feature: ESTIMATE / SPRINT / WAITS FOR ("Nothing", "1 feature", "2 features").
    - Item: ESTIMATE / SPRINT / POSITION ("2 of 4").
    - Labels are micro-labels; values 13px/500.
  - **Footer:** dates (tabular), e.g. `2026-09-28 → 2026-10-07`, and "Click to open" in brand 500.

---

## + handles (draw to create): new `canvas/extend-handle.tsx`, client
Each mark sits in a hover wrapper that extends 22px beyond both ends, so the handle can be reached without losing hover. Handles show only while that mark is hovered and nothing is being dragged.

- **On a bar** (items, and feature bars at Quarter/Year): a **14px circle centred on the bar's start and end edges**, half overlapping the bar. Fill = group hue, shadow `0 1px 3px rgba(0,0,0,.18)`, hover `scale(1.15)`.
- **On a feature line:** the **diamond itself becomes the handle**: 12px, radius 2.5, rotated 45°, hue fill, `0 0 0 2px #fff, 0 2px 5px rgba(0,0,0,.2)`. Hover adds a 4px hue ring at 33% alpha.
- **Icon** (both cases): a 7px plus. SVG `viewBox 0 0 10 10`, path `M5 1.5v7M1.5 5h7`, white stroke 1.8, round caps. Counter-rotate it inside the diamond.
- `cursor: crosshair`.

**Drag behaviour** (pointer events; capture the pointer on the handle):
1. Origin = the end handle → source end day; the start handle → source start day.
2. As the pointer moves, snap to half days. The provisional bar runs from the origin to the pointer: rightward from an end handle (at least 0.5d), leftward from a start handle.
3. Its lane is the lane under the pointer.
4. The provisional bar: dashed 1.5px brand border, radius 5, stripes `repeating-linear-gradient(135deg, #efecfa 0 6px, #e4dff7 6px 12px)`, plus a full-height dashed 1.5px brand guide at its free edge.
5. A chip 24px above it: brand background, white 11px/600, padding 3px 8px, radius 5, the label, then the meta text in gold (`2d · S1` or `3d · S1–S2`).
6. If the lane differs from the source lane, draw a dashed (4 3) 1.5px brand connector from the source edge to the provisional bar.
7. Release creates the work and opens its tab:

| Source | Lane | Result | Chip text |
|---|---|---|---|
| item, end + | same | new item **after** it in the same feature, est = length | `New item after "<item>"` |
| item, start + | same | new item **before** it | `New item before "<item>"` |
| feature, end + | same | new feature after it on the rail; dependency source → new | `New feature after "<feature>"` |
| feature, start + | same | new feature before it; dependency new → source | `New feature before "<feature>"` |
| any, end + | other rail | new feature on that rail at the drawn start; dependency source feature → new | `New feature on <rail> · waits for "<feature>"` |
| any, start + | other rail | as above; dependency new → source | `… · unblocks "<feature>"` |

A new feature takes the source's group and gets one item, "New item", sized to the drawn length.

Server writes go through the existing actions: create item / create feature / add dependency, then `placeFeature` and revalidate. If the drawn start on another rail is later than the schedule would place it, also write a sprint pin (a pin is a floor).

---

## Add strip drag-and-drop (HTML5 DnD; drop target = the body row)
While dragging, the hint text changes and a preview shows where the drop lands:

- **Epic:** a 3px brand line between rails across both columns, with a brand chip "New epic goes here". Insert index = `round(y / laneH)`. Dropping creates a rail named "New epic" with the next palette hue and opens its name for inline editing.
  - Hint: "Drop between rails to insert a new epic."
- **Rail reorder** (dragging a rail row): same line, chip "Move <rail> here". Persist the order on the plan (new field, or reuse the epic order if one exists).
  - Hint: "Drop between rails to reorder."
- **Feature:** dashed brand box (2 days wide, item-row height) with a chip.
  - If the drop is within **1.5 working days** of the end of a feature on that rail, snap to start at that end. Chip "After "<feature>"". Add the dependency and copy the group.
  - Otherwise use the dropped day, rounded to a half day. Chip "<rail> · Oct 5".
  - Creates the feature with one 2d item and opens its tab.
  - Hint: "Drop on a rail. Near the end of a feature it goes after it and takes its group."
- **Item:** the target is the feature under the pointer on that lane (from its start −0.25d to its end +0.5d).
  - A 3px brand insertion marker goes at the gap between items nearest the pointer (insert before the first item whose midpoint is right of the pointer). Chip "Into "<feature>" · position N".
  - Outside any feature, the marker and chip turn red `#dc2626` with "Drop inside a feature", and the drop is ignored.
  - Hint: "Drop inside a feature. It lands between the items under the pointer."

Following features on the same rail must never overlap. When an item grows or is inserted, later features on that rail move later. The real scheduler already handles this; the UI just re-renders from the schedule.

---

## Panel: Feature tab (grid `1.45fr 1fr 1fr`, columns `align-content: start`, padding 16px 22px 22px, separated by 1px `--color-line`)

**Column 1: identity**
- Meta line, 11px muted tabular: `<rail> · 2026-09-28 → 2026-10-07`.
- **Name:** inline input, 17px/650, lh 1.3, transparent 1px border (`#e5e5e5` on hover; brand border and white background on focus), radius 7, padding 4px 6px, margin 0 −7px. Saves on blur or Enter (`drawer/name-field.tsx` action).
- **Fields row** (wrap, gap 10, bottom-aligned). Each field has a micro-label above it.
  - **EPIC:** 34px button, min 150px, radius 8, 1px `--color-line-strong` (brand while open), with a 9px rail swatch, the name 13px/500 and a ▾. It opens a 260px popover 62px below: a search input (30px), then a list of rails, each with a swatch, the name and "current" on the current rail. Picking one **moves the feature to that rail** (replaces "Move to another rail").
  - **ESTIMATE:** stepper 34px high, radius 8: [− 30px] [input 42px, centred 13px/600 tabular] [+ 30px], dividers `--color-line`. Steps of ±0.5, typeable. Writes the feature's own estimate (`estimate-field.tsx`).
  - **SPRINT:** stepper [−] [value button min 92px: "S1" 13px/600, then "auto" or "pinned" 11px muted, then ▾] [+]. − goes down to the scheduled sprint, then clears the pin; + pins one sprint later. The value opens a 240px popover with rows "Auto · placed by schedule (S1)" and "S1 Sep 28 – Oct 9" … "S8". The current pin is ticked; sprints earlier than scheduled are marked "earlier than scheduled". Writes via `pin-field.tsx`.
  - A 1px × 34px divider.
  - **GROUP:** chips for Phase 0 / Phase 1 / No group, 5px 11px, radius 999, 12px/500, 8px dot. Selected = group tint background, dark text and a hue border; otherwise white with a `#e5e5e5` border. Writes via `group-field.tsx`.
- Hint, 11.5px/1.45 `--color-hint`, max 560px: "Sprint is placed by the schedule unless pinned. A pin is a floor: it can only delay a feature, never move it earlier."

**Column 2: dependencies** (replaces the checkbox list in `dependency-editor.tsx`)
- **"Waits for"** (12px/600 ink-soft), followed by "starts after these finish" (11.5px hint).
  - Chips: 28px, radius 7, 1px `--color-line-strong`, 7px rail dot, name (clicking opens its tab, underline on hover), and an 18px × that removes the dependency.
  - Then "+ Add" (dashed `#c9c6d6`, `#5b5675`; brand on hover). It opens an **inline** searchable list below the chips (max 360px, so it is never clipped by the panel).
  - List rows: rail dot, name, and a sub-line "<rail> · ends Oct 7". Rows that would create a cycle are greyed, `not-allowed`, with the sub-line in warn colour: "Can't: it already waits for this feature".
  - Empty state: "Nothing. It can start as soon as its rail is free." (12px `#a3a3a3`).
- **"Unblocks"**, followed by "these start after this finishes".
  - Chips: `--color-panel-strip` background, 7px dot, name, →. Clicking opens that feature's tab. Hover `brand-soft`.
  - Empty state: "Nothing waits for this yet."

**Column 3: items** (`--color-panel-col` background)
- "Items", then "4 · 8d total" (hint colour).
- List box: 1px `#ececf0`, radius 8, white, `grid-template-columns: minmax(0,1fr)` (needed so rows truncate).
  - Rows: index (11px `#a3a3a3`, tabular), name 13px truncated (click opens the item tab; hover brand and underline), and a mini stepper (24px, radius 6) [− 2d +] with 0.5 steps, minimum 0.5.
  - Last row: borderless input "New item…" plus a brand "Add" button (30px). It appends an item.

**Removed from the panel:** Move up / Move down, Move to another rail (replaced by Epic), "New feature on this rail" (replaced by the + handles and the Add strip), and the inline Delete. Suggested: a ⋯ menu on the tab for Delete.

## Panel: Item tab (grid `1.45fr 2fr`)
**Column 1**
- Meta line: `<feature> · <dates>`.
- Name input, as for the feature tab.
- Fields:
  - **FEATURE:** button up to 300px, with a searchable popover of all features. Picking one moves the item to the end of that feature.
  - **ESTIMATE:** stepper, 0.5 steps, minimum 0.5.
  - **SPRINT:** read-only pill, `--color-panel-strip` background: "S1" plus "placed by order".
- Hint: "Days of work, in halves: 0.5, 1, 1.5. Items run one after another inside their feature, so changing an estimate moves the items that follow it."

**Column 2**
- "Order in feature", then "2 of 4".
- Three cells:
  - "COMES AFTER" box (strip background, radius 8, 10px 12px; the name opens that item, or reads "Start of feature").
  - ← / → buttons (32px, radius 7) that move the item earlier or later.
  - "COMES BEFORE" box (or "End of feature").

Empty panel (no tabs): centred "Click a feature or an item on the timeline to open it here." in 13px hint colour.

---

## State management
- **URL / route:** the open tab stack and the active tab, e.g. `?open=f:<id>,i:<id>&active=i:<id>`, or the existing `/f/[featureId]` and `/i/[itemId]` routes plus a stack param. The active tab must still deep-link.
- **Cookie:** zoom (exists). Panel height (new).
- **Client only:** hovered id (existing `plan-pointer.tsx` `data-lit` mechanism); drag/draw state (kind, origin, cursor day and lane); popover open with its query.
- **Server:** rail order (new); all entity writes through existing actions.

## Assets
- `logo.webp`: the CC Guild mark, copied from the repo root (the app serves `public/img/logo.webp`).
- No other images. All glyphs are CSS shapes or the inline SVG plus above.

## Files
- `Plan Timeline Restyle.dc.html`: the design. **Section 4a is the spec.** 3a/2a/2b/1a are context only (1a = current state recreated from source).
- `support.js`: runtime needed to open the HTML locally.
- `logo.webp`
- `tokens.css`: the token additions for `globals.css`.
- `component-map.md`: which repo file each part of the design touches.
- `screenshots/`: key states of 4a at 1440×1080:
  - `01-default-sprint-feature-tab.png`: Sprint zoom, feature lines and items, feature tab open
  - `02-hover-card-and-plus-handles.png`: an item hovered, showing the card, the dimming and both + handles
  - `03-epic-picker.png`: the Epic search popover
  - `04-waits-for-search.png`: the inline dependency search, with rows that would loop greyed out
  - `05-item-tab.png`: item tab with Feature picker, estimate stepper and order controls
  - `06-quarter-zoom-feature-bars.png`: Quarter zoom, features collapsed to bars
