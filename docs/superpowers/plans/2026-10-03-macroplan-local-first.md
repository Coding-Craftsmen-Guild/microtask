# Macroplan local-first plan screen — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) — this plan is executed
> in the session that wrote it, task by task, with the gate between phases. Steps use `- [ ]` checkboxes.

**Goal:** make every plan-screen interaction (zoom, open a drawer, edit, drag, draw, hover) answer in under
~50 ms on any connection, instead of waiting for a server round trip that re-renders the whole page.

**Architecture:** the plan crosses to the browser once, as the token-free `PlanScreenModel`, into a client
store. Every write is applied to that store optimistically (the browser recomputes the schedule with
`@repo/schedule`, the same code the API runs) and persisted by the existing Server Actions in a strict FIFO
queue; each answer becomes the confirmed plan, and a refusal rolls the overlay back. Selection stays a URL,
but is changed with `history.pushState`, so a drawer opens without a request. Zoom is client state persisted
to the existing `mp_zoom` cookie by the browser. Structural writes no longer call `refresh()`.

**Tech stack:** Next 16.3 App Router, React 19.3 (`useSyncExternalStore`, `useDeferredValue`), vitest +
happy-dom, `@repo/schedule`, `@repo/canvas`.

**Baseline (audit, 2026-10-03, production build on localhost):** 25-item plan — drawer open ~325 ms (300 ms
of it React's Suspense reveal throttle), zoom 50–90 ms + 150 KB RSC, an edit 184 KB; 2,000-item plan — page
TTFB 1.1 s / 9.5 MB HTML, zoom 2.3–2.8 s + 5.1 MB, drill-open 5.3 s, hover frame 222 ms avg. Production:
origin 57–71 ms, but every interaction is ≥1 network round trip (~1 s from the user's machine).
`apps/macroplan` baseline: 127 test files, 2,109 tests, green.

---

## File structure

New, under `apps/macroplan/components/plan/store/` (pure unless noted):

| File | Responsibility |
| --- | --- |
| `edit-order.ts` | `placeAmong`, `densified`, `densifiedBy` — the domain's renumbering rules, mirrored |
| `clean-name.ts` | the domain's `cleanName`, mirrored for optimistic renames |
| `feature-edits.ts` | change / place / dependencies / label / remove / create a feature |
| `item-edits.ts` | change / place / remove / create an item |
| `rail-edits.ts` | change / reorder / remove / create a rail (epic) |
| `group-edits.ts` | change / remove / create a group (label) |
| `draw-edits.ts` | the composite edits a draw or a strip drop makes in one gesture |
| `with-schedule.ts` | `withSchedule(plan)`: the plan with the schedule recomputed by `flatSchedule` |
| `plan-store.ts` | the store: confirmed plan, FIFO queue of pending ops, overlay, failure notice |
| `optimistic-actions.ts` | wraps a `PlanEditActions` so every call goes through the store |
| `plan-provider.tsx` (client) | context + `useSyncExternalStore` hooks; adopts a server-pushed plan |

New, under `apps/macroplan/components/plan/nav/`:

| File | Responsibility |
| --- | --- |
| `drawer-route.ts` | parse a pathname + `open` param into a `Selection` |
| `plan-nav.tsx` (client) | `go(href, { replace })` over `history.pushState`, and `PlanLink` |

New, under `apps/macroplan/components/plan/app/` (client):

| File | Responsibility |
| --- | --- |
| `plan-app.tsx` | the one client root the layouts mount: provider + nav + screen |
| `plan-client-screen.tsx` | composes `PlanScreen` from store state, memoised |
| `plan-drawer.tsx` | renders the drawer the URL names, from the store |
| `item-extras.ts` | loads an item's description (and bound tasks) on demand |
| `use-zoom.ts` | zoom state + cookie persistence |

Changed: `packages/schedule` (`flatSchedule`), `packages/macroplan-domain` (`planSchedule` delegates),
`actions/plan-write.ts` (reduce, no refresh), `actions/bridge.ts`, `actions/seat-bridge.ts`,
`actions/plans.ts`, `actions/seat-plan.ts`, the two plan layouts, every drawer page (→ `null`),
`components/plan/table/*` (state-driven), `canvas/plan-pointer.tsx` + `use-drill.ts` + `use-wheel-zoom.ts`
+ `use-group-fit.ts` (local zoom), every `next/link` / `router.push` under `components/plan`
(→ `PlanLink` / `go`), `canvas/detail-lines.ts` + `table/rows.ts` (`cache()` → plan-keyed memo, O(n)),
`canvas/pointer-lights.ts` (hover scoped to the board), `module-boundaries.test.tsx` (new invariant).

Deleted: `app/(admin)/plans/[planId]/loading.tsx`, `actions/zoom.ts`, `canvas/zoom-switch` form version,
`[planId]/admin-slots.tsx` + `manage-slot.tsx` (moved client-side).

Docs: `docs/adr/0069-the-plan-screen-is-local-first.md`; status amendments on ADR 0056, 0057, 0058.

---

## Phase B — one schedule flattening for server and browser

### Task 1: `flatSchedule` in `@repo/schedule`
- [ ] Test `packages/schedule/src/flat.test.ts`: spans carry ids and sort by `(startDay, id)`; `unscheduled`
  sorts by id; `cycles` / `ignoredEdges` pass through; equals the flattening `plan-view.ts` does today.
- [ ] Implement `packages/schedule/src/flat.ts`, export from `index.ts`.
- [ ] `packages/macroplan-domain/src/views/plan-view.ts`: `planSchedule` returns `flatSchedule(manifest)`.
- [ ] Rebuild both packages; run schedule, macroplan-domain and api suites. Commit.

## Phase C — pure optimistic edits

Every edit takes and returns a `PlanScreenModel` and never touches `schedule` (the store recomputes it).
Each mirrors the domain service named beside it, rule for rule:

| Edit | Mirrors |
| --- | --- |
| `changeFeature(plan, id, { name?, estimateDays?, pinSprint? })` | `FeatureService.update` |
| `placeFeature(plan, id, { epicId, position })` | `FeatureService.place` (`placeAmong` + `densifiedFeatures`) |
| `setDependencies(plan, id, dependsOn)` | `FeatureService.setDependencies` (dedupe) |
| `labelFeature(plan, id, labelId)` | `FeatureService.setLabel` |
| `removeFeature(plan, id)` | `withoutFeatures` (edges to it dropped, its items gone, rail densified) |
| `createFeature(plan, draft, tempId)` | `FeatureService.add` (position = rail length) |
| `changeItem` / `placeItem` / `removeItem` / `createItem` | `ItemService` |
| `changeRail` / `reorderRail` / `removeRail` / `createRail` | `EpicService` (`placedRail`, `withoutEpic`) |
| `changeGroup` / `removeGroup` / `createGroup` | `LabelService` (`released`) |
| `retimePlan` / `renamePlan` | `PlanService.update` |

- [ ] Task 2: `edit-order.ts` + `clean-name.ts` with tests (clamp, renumber, stable order; whitespace
  collapse, 80-codepoint cut, empty refused → unchanged).
- [ ] Task 3: `feature-edits.ts` + tests (one per row above, including moving across rails renumbers both).
- [ ] Task 4: `item-edits.ts` + tests.
- [ ] Task 5: `rail-edits.ts`, `group-edits.ts` + tests.
- [ ] Task 6: `with-schedule.ts` + agreement test against every fixture plan's stored schedule.
- [ ] Commit after each.

## Phase D — the store

### Task 7: `plan-store.ts`
State: `confirmed` (last server answer), `queue` (pending ops, FIFO), `view` = `withSchedule` of the queue
applied to `confirmed`, `failure` (last refused op's sentence, cleared by the next success).

Rules, each with a test:
1. `run(op)` applies `op.apply` to the view **synchronously** and notifies.
2. Sends are strictly sequential: op N+1's `send` starts after op N's settles.
3. A success sets `confirmed` to the answer (reduced model) and drops the op; the remaining ops re-apply.
4. A refusal drops the op; the view re-derives from `confirmed` and the rest; `failure` is set.
5. `run` resolves with the answer, so a field can still show its own refusal.
6. `adopt(plan)` (a server re-render) replaces `confirmed` and re-applies the queue.
7. Snapshots are referentially stable between changes (for `useSyncExternalStore`).
8. A composite op (`send` running several actions) is one queue entry; its last answer is confirmed, and a
   mid-chain refusal confirms the last plan it did get before reporting the refusal.

### Task 8: `optimistic-actions.ts`
Wraps all 28 `PlanEditActions` members. Structural members get an edit; bridge members (`bindEpic`,
`unbindEpic`, `linkItem`, `unlinkItem`, `createTask`) get an identity apply. Creates use a temp id
(`pending:<n>`), which the next confirmed plan replaces. Tests with fake actions.

### Task 9: composite draw/drop
`draw-edits.ts` applies a whole draft (feature at position, label, first item, edge) at once;
`extend-write.ts` / `create-write.ts` run their existing chains inside one store op. Tests.

## Phase E — server actions

- [ ] Task 10: `adminWrite` / `seatWrite` answer `planScreenModel(result)` and **do not** `refresh()`;
  `adminBridgeWrite` / `seatBridgeWrite` keep `refresh()` (the bridge read must follow) and also reduce.
  `retimePlan` reduces and does not refresh; `renamePlan` keeps `refresh()` (crumb + title are server-drawn).
  Update `actions/*.test.ts`. This also closes a live leak: every write used to answer the admin's seat tokens.
- [ ] Task 11: drawer reads as actions: `readItemDrawer(planId, itemId)` (admin: description + bound tasks),
  `seatReadItemDrawer(token, planId, itemId)` (description). Tests.

## Phase F — the client screen

- [ ] Task 12: `plan-provider.tsx` + hooks; `adopt` when the `plan` prop changes identity.
- [ ] Task 13: `drawer-route.ts` (+ tests) and `plan-nav.tsx`; swap every `next/link` / `router.push|replace`
  under `components/plan` for `PlanLink` / `go`; scroll a `#fragment` into view after a push.
- [ ] Task 14: zoom as client state; `ZoomSwitch` becomes buttons; `useDrill` no longer awaits a round trip;
  delete `actions/zoom.ts` and its test.
- [ ] Task 15: `plan-app.tsx`, `plan-client-screen.tsx`, `plan-drawer.tsx`, `item-extras.ts`.
- [ ] Task 16: `cache()` → plan-keyed `WeakMap` memo in `rows.ts` / `detail-lines.ts`; O(n) detail lines;
  `useMemo` for axis + canvas layout.
- [ ] Task 17: render only the active view; the other (the table) mounts deferred, for assistive tech.
- [ ] Task 18: table state-driven (sort / filter / column order in render, no DOM moves).
- [ ] Task 19: hover attribute on the board, not the screen root.

## Phase G — routes

- [ ] Task 20: `[planId]/layout.tsx` and `s/[token]/layout.tsx` mount `PlanApp`; drawer pages return `null`;
  delete `loading.tsx`; seat reads plan ‖ bridge in parallel.
- [ ] Task 21: rewrite the route tests and `module-boundaries.test.tsx` for the new invariant: one client root
  is handed the plan model, and nothing handed to any client component holds a share token.

## Phase H — record

- [ ] Task 22: ADR 0069; amend ADR 0056 / 0057 / 0058 statuses; ADR index.

## Phase I — verify

- [ ] Task 23: `npx turbo run build typecheck lint test --force` in the foreground (Bash `timeout: 600000`);
  clear `apps/*/.next` first; an EPERM on `microtask#build` is cleared and re-run once.
- [ ] Task 24: browser click-through on a production build, admin and seat: every drawer kind, deep link,
  hard reload, back/forward, drag, draw, resize, stepper, rename, dependencies, groups, rail reorder, strip
  drop, delete + failure, zoom (switch, wheel, drill, chip), table sort/filter/columns.
- [ ] Task 25: re-measure against the baseline above (25 and 2,000 items).
- [ ] Task 26: code review; fix what it finds; re-run the gate.
- [ ] Task 27: push `feat/macroplan-local-first` (standing authorisation). Never `main`.
