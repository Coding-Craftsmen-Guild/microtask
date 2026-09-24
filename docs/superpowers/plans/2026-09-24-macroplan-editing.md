# Macroplan Phase 3 — Editing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Make a plan editable — a drawer, create/rename/delete, estimates, pins, reorder by drag, dependency
edges, a conflict list, an undo for a move, and the share manager — on both the admin surface and a `write` or
`manage` seat's link surface.

**Architecture:** The server is already finished; nothing in `apps/api` or either domain package changes.
`@repo/api-client` grows four operation groups over routes that have shipped since phase 1. `@repo/canvas` grows
the one impure thing a drag needs made pure: a drop target computed from a point. `apps/macroplan` grows its
first Server Action with a body, its first client boundary inside the canvas, and a drawer that is a route rather
than client state.

**Tech Stack:** Next 16.3.4 App Router · React 19.3 · Tailwind v4 (no config file) · vitest 5 with `happy-dom`
20.14 · `@testing-library/user-event` · Zod 4.6 in contracts only.

---

## What the spec fixes, and what this plan decides

Spec §9's phase-3 row is the scope, verbatim:

> | **3 — Editing** | drawer, create/rename/delete, estimates, pins, reorder, edges, conflict list, undo, **the
> share manager** | cycle refusal pinned by test; a test asserts nothing auto-moves |

Every `spec §N` in this plan means `docs/superpowers/specs/2026-09-22-macroplan-design.md`. **Not** the root
`specification.md`, which is 4 KB of Microtask tab UX with no numbered sections.

### The finding that shapes the whole phase

**Every route this phase needs already exists.** Phase 1 shipped twenty write operations under
`/v1/macroplan/*` — epic, feature and item create / update / placement / delete, `PUT .../dependencies`,
`PUT .../description`, plan create / update / delete, and the three plan share-link routes. Every payload schema
is declared and already barrel-exported from `@repo/contracts`. Phase 1 also wrote the response rule this phase
depends on, in `apps/api/src/routes/macroplan/plan-response.ts:15-27`:

> every structural edit can move every bar on the canvas … so a response carrying only the changed entity would
> leave the client to re-derive the timeline or fetch it again. **Phase 3's optimistic drag needs the
> authoritative answer in the same round trip.**

And `apps/macroplan/actions/result.ts:60-61` says of `adminCall`: "This is the shape every write in this app will
take once it has entities."

So **no task in this plan touches `apps/api`, `@repo/macroplan-domain`, `@repo/kernel` or `@repo/contracts`**
except one three-line correction (Task 18, step 4). What is missing is the typed client and the UI. A task that
finds itself editing a route handler has misread the plan and should stop.

### Decided before this plan was written

1. **`@repo/api-client` gains four operation groups**, not fourteen more methods on `PlansApi`.
   `max-lines-per-function` is 50 and `plansApi`'s whole body is one returned object literal, so twenty entries
   in it is a lint error before it is a design question. `MacroplanApi` gains `epics`, `features`, `items` and
   `shareLinks`, each from its own file, mirroring `src/operations/{folders,tasks,tabs,share-links}.ts`.
2. **Work continues on `feat/macroplan-timeline`.** Phases 1 and 2 stay unmerged; no new branch. **Never push
   `main`** — Coolify deploys it (ADR 0022).
3. **Every mutation takes at most three parameters**, `(planId, id, payload)`, using the payload-object idiom of
   `src/operations/share-links.ts:64-72`. `max-params` is 4 and `place(planId, featureId, epicId, position)`
   would sit exactly on it, leaving no room for the `signal` the transport already supports.

### Decided by this plan, with the alternative recorded

4. **The drawer is a route, and the canvas moves into the plan's layout.** `app/(admin)/plans/[planId]/layout.tsx`
   renders the canvas and the table; `children` is the drawer slot; `page.tsx` renders the empty state, and
   `f/[featureId]/page.tsx` and `i/[itemId]/page.tsx` render the drawer. A layout does not re-render when
   navigation moves between its children, so **selecting a feature does not re-render 2 000 SVG nodes**, and a
   selection is a URL somebody can send to a colleague.

   The alternative — selection in client state, the drawer as an overlay — was refused for the re-render and the
   lost deep link, and because it would put the plan's whole shape into a client component's props: today
   `app/(admin)/plans/[planId]/page.test.tsx` asserts the page hands over **no function at all**, and an overlay
   holding the plan would move the entire timeline into the Flight payload for a panel showing one feature. The
   cost of the route is one soft navigation per selection, which is a server round trip; `loading.tsx` covers it
   and the plan read is already `cache()`d (`read-plan.ts:43`).

5. **The canvas gains exactly one client boundary — a delegation root — and no transparent sheet over the bars.**
   This is not an open question: phase 2 closed it in `components/plan/canvas/feature-bar.tsx:48-50`, which says
   a transparent sheet over every bar "would swallow the drag and the click it adds". Phase 2 also left the hooks
   in place — every bar renders `data-feature-id` and `data-slot="feature-bar"` (`feature-bar.tsx:59-61`), every
   item mark the same. So one `'use client'` wrapper receives the **server-rendered SVG as `children`**, listens
   on itself, and resolves what was hit with `closest('[data-feature-id]')`. No bar becomes a client component,
   no per-bar props enter the Flight payload, and the 2 000-node budget `item-mark.tsx:22-27` defends is
   untouched.

6. **`components/plan/module-boundaries.test.tsx`'s "declares no use client anywhere" sweep is replaced by an
   allowlist, not deleted.** It becomes: these named files are client components, every other file under
   `components/plan/**` is asserted server-rendered exactly as before, and the new client files are asserted to
   receive no share token and no plan. Deleting the sweep would give up the property phase 2 built it for; keeping
   it unchanged would forbid the phase. Task 16 does this in the same commit that adds the first client file.

7. **A cycle is named by the client before the write is sent.** Spec §6 requires that a refused cycle be "refused,
   with the cycle named", and the phase gate is "cycle refusal pinned by test". The API refuses correctly —
   `assertAcyclic` throws `Conflict` with the features named — but `apps/macroplan/lib/refusal.ts:11` answers
   **every** 409 with "Someone else changed this at the same time. Reload the page and try again.", and for a
   cycle that sentence is not vague, it is false: nobody else changed anything and reloading will not help.

   `findCycles` is exported from `@repo/schedule`, that package is bundled for the browser (its own purity test
   says so — `packages/schedule/src/purity.test.ts:40`), and the drawer already holds the whole plan. So the
   dependency editor runs `findCycles` on the graph it is about to send, names the cycle from the features' own
   names, and refuses locally. The API stays the authority and the client refusal is a **message, never a gate**
   — the same rule ADR 0038 sets for capabilities. The consequence is that the existing generic sentence becomes
   *correct*: after this change a 409 from the dependency route can only mean this page's copy of the plan is not
   the server's — a concurrent edit, or a cycle that arrived some other way, which spec §6 contemplates as "a
   hand-edited volume" — and "reload the page and try again" is exactly the right instruction for both.

   The alternative — letting the API's `detail` through for a 409 — was refused because `lib/problem.ts:56-59`
   argues at length that the API's wording is written for whoever reads the API, and because it would hand one
   status an exemption from a rule the rest of the app keeps.

8. **The drawer saves one field per request.** `PATCH /plans/{planId}/features/{featureId}` runs up to three
   `authorize` calls for one body (`apps/api/src/routes/macroplan/features/handlers.ts:56-66`), and
   `feature:estimate` is a `write` action while `feature:pin` is `manage`
   (`packages/kernel/src/access/policy.ts:22,53`). A `write` seat that sends `{estimateDays, pinSprint}` in one
   body is refused wholesale and writes **neither** — so a combined save silently punishes exactly the user §7.1
   invented the `write` role for. One field per request is therefore a correctness requirement, not a preference,
   and Task 12 asserts it by name.

9. **Undo is a compensating placement, and a delete has none.** There is no undo anywhere in this repository to
   copy — no journal, no soft delete, no tombstone, no restore route; deletes are physical and cascade through
   `withoutEpic` / `withoutFeatures`. Spec §6 promises undo for **destructive drags**, and that is the case which
   is honestly invertible: the inverse of `PATCH .../placement {epicId, position}` is the same call with the
   values read before the drop. A deleted feature has no inverse — re-creating it mints a new id and does not
   bring back its items, its description or the edges that pointed at it — so a delete keeps this repo's existing
   answer, a confirm dialog that says it cannot be undone. Task 16 writes the ADR; Task 15 writes the sentence.

10. **Drag arithmetic is pure and lives in `@repo/canvas`.** `happy-dom` answers every `getBoundingClientRect`
    with a zero `DOMRect` and every `getCTM` with an identity matrix, so a drag whose maths lives in a component
    cannot be tested in this repository at all. ADR 0055 already settles the shape: the geometry is a pure
    function of a point and a layout, tested with no DOM, and the component is a thin renderer that converts one
    pointer event into one `{x, y}` and calls it.

11. **`PlanCanvas` and `PlanTable` narrow from `Plan` to `PlanScreenModel`.** Both declare `readonly plan: Plan`
    today, which includes `shareLinks`; the narrowing sits one level up on `PlanScreen`. Phase 2 recorded this as
    a ceiling rather than a floor, and this phase mounts new components beside `PlanScreen` — where the ceiling
    does not reach. Task 10 lowers it.

### Five things in shipped code that this phase falsifies

Named here so no task has to discover them. Each is prose or a test name that was true when written.

- `apps/macroplan/lib/plan-capabilities.ts:27` — "Phase 2 draws none of these". **Task 9** widens the interface,
  and Tasks 11 onward draw them.
- `packages/api-client/src/macroplan-clients.test.ts:99-105` — the test named "reads a plan through GET, the only
  method phase 2 needs". Task 4 makes the clause false; rename it in the same commit.
- `apps/macroplan/app/(admin)/plans/[planId]/page.test.tsx:130-134` — "Phase 3's first bound server action
  therefore fails that assertion rather than passing it quietly, and whoever adds it has to say how its arguments
  are proved clean." **Task 10 Step 5** is that moment — the first task in which a *page* hands a component a
  bound action. Honour the instruction: widen the sweep to read a bound function's arguments; do not relax it.
- `apps/macroplan/app/s/[token]/page.test.tsx:139-143` — a stated **KNOWN GAP**: the seat surface's leak sweep
  skips functions, and "Phase 3 will [bind one], and must widen this to read a bound function's arguments before
  it does." **Task 10 Step 5** closes it on the surface where a token is the credential. Task 8 builds the bound
  object but mounts it on no page, so nothing renders one before then — verify that rather than assuming it.
- `packages/canvas/src/plan.ts:55-62` — `CanvasSchedule` declares only `spans`, and says a later module needing
  `unscheduled`, `cycles` or `ignoredEdges` "should widen this interface rather than restate the wire shape a
  second time". Task 14 is that module.

### One phase-1 defect to fix in passing

The three plan share-link routes can each answer **409** — they all write through `PlanShareLinkService.#save`,
which calls `ShareIndex.add`, which throws `Conflict` on a cross-container token collision
(`packages/kernel/src/access/share-index.ts:44`) — and `errorHandler` passes an `AppError`'s status straight
through. But each declares only `problemResponses()`, whose statuses are `[401, 403, 404, 422, 500]`, so
`openapi.json` says a 409 cannot happen there. `PUT .../dependencies` is the only Macroplan route that declares
one. Task 18 adds the declaration to the three share-link routes. This is three lines in
`apps/api/src/routes/macroplan/share-links/routes.ts` and is the only change to `apps/api` in the phase.

---

## File structure

**Modified — `packages/api-client/`.** Four new operation modules, mirroring `operations/share-links.ts` in shape.

```
src/operations/epics.ts              NEW — EpicsApi, epicsApi(transport)
src/operations/features.ts           NEW — FeaturesApi, featuresApi(transport)
src/operations/items.ts              NEW — ItemsApi, itemsApi(transport)
src/operations/plan-share-links.ts   NEW — PlanShareLinksApi, planShareLinksApi(transport)
src/operations/plans.ts              + create, update, remove
src/macroplan-surface.ts             + epics, features, items, shareLinks
src/index.ts                         + the new type names
src/clients.test.ts                  + one `it` per new route: method, URL, serialised body
src/macroplan-clients.test.ts        the exact-key-set array, and the stale test name
```

Path builders stay **module-private**, following `operations/folders.ts:6-9` rather than `paths.ts`. `paths.ts`
holds the two the barrel test pins because a page needs them; nothing outside an operation module needs
`/epics/{epicId}/placement`.

**Modified — `packages/canvas/`.** One new module. Pure, no DOM, no React.

```
src/drag.ts        NEW — DragPoint, DropTarget, dropTargetFor, railAtY
src/drag.test.ts   NEW
src/plan.ts        CanvasSchedule widened with unscheduled, cycles, ignoredEdges
src/index.ts       + the new names
src/entry-points.test.ts + the new names
```

**Modified — `packages/ui/`.** Nothing, unless Task 12 finds it needs a numeric field, which is argued there.

**New and modified — `apps/macroplan/`.**

```
actions/
  epics.ts                  NEW — 'use server'; create, rename, recolour, reorder, remove
  features.ts               NEW — create, rename, estimate, pin, place, setDependencies, remove
  items.ts                  NEW — create, rename, estimate, describe, place, remove
  plan-share-links.ts       NEW — mint, update, revoke  (admin surface)
  seat-writes.ts            NEW — the seat mirror: token first, linkCall, one file
  <one .test.ts each>

lib/
  plan-capabilities.ts      PlanControls widened past the four share booleans
  admin-controls.ts         NEW — every control true, mirroring microtask's ADMIN_CAPABILITIES
  drawer-routes.ts          NEW — featureDrawerPath, itemDrawerPath, and the seat twins

components/plan/
  module-boundaries.test.tsx    the use-client sweep becomes an allowlist (Task 16)
  plan-screen.tsx               takes controls and actions; canvas and table narrow to the model
  admin-actions.ts              NEW — the admin surface's actions, as one object (Task 7)
  seat-actions.ts               NEW — the seat surface's, token first (Task 8)
  canvas/
    drag-root.tsx               NEW — 'use client'; the only client file under canvas/
    drag-ghost.tsx              NEW — the moving rect, rendered by drag-root
    selection.ts                NEW — which bar a point names, from data-* attributes
  drawer/
    drawer-panel.tsx            NEW — the frame, server-rendered
    name-field.tsx              NEW — 'use client'
    estimate-field.tsx          NEW — 'use client'; the null-vs-zero field
    description-field.tsx       NEW — 'use client'; counts UTF-8 bytes, because the server truncates
    pin-field.tsx               NEW — 'use client'
    dependency-editor.tsx       NEW — 'use client'
    cycle-check.ts              NEW — pure: names the cycle a change would create
    breakdown-line.tsx          NEW — planned · broken down · delta
    create-controls.tsx         NEW — 'use client'; appends after the last sibling
    delete-control.tsx          NEW — 'use client'; confirm-dialog with danger set
  conflicts/
    conflict-list.tsx           NEW — three sections, server-rendered
    conflict-rows.ts            NEW — pure: ScheduleView to named rows
  share/
    share-manager.tsx           NEW — 'use client'; tokens fetched on open, never a prop
    use-plan-seats.ts           NEW — 'use client'; load on open, forget on close
  testing/
    fake-plan-api.ts            + write routes; today it answers 405 to every non-GET

app/(admin)/plans/[planId]/
  layout.tsx                    NEW — the canvas and the table; children is the drawer slot
  page.tsx                      becomes the no-selection state
  loading.tsx                   NEW
  f/[featureId]/page.tsx        NEW — the feature drawer
  i/[itemId]/page.tsx           NEW — the item drawer

app/s/[token]/
  layout.tsx                    gains the same split for a seat
  f/[featureId]/page.tsx        NEW
  i/[itemId]/page.tsx           NEW
```

**Modified — `apps/api/`.** Three lines, Task 18 step 4:

```
src/routes/macroplan/share-links/routes.ts   + problemResponses([409]) on all three
```

---

# Group A — the client's write surface

Four tasks, one per operation group. Read `packages/api-client/src/operations/share-links.ts` before starting any
of them: it is the closest existing shape — a create with a payload type, a `PATCH` taking a partial change
object, and a `DELETE`. Copy its import style exactly, which the compiler enforces anyway: **response schemas are
value imports, payload schemas used only inside `Decoded<typeof …>` are `import type`**
(`consistent-type-imports` is `error`).

Three rules hold for every task in this group.

- **Never stringify a body.** The transport does it once, at `transport.ts:127`. Pass a plain object as `body`.
- **Every success body is parsed.** `transport.json(call, schema)` runs `schema.parse` unconditionally, so each
  method names the contract schema its route answers. A 204 route uses `transport.empty` and returns
  `Promise<void>`.
- **Errors are thrown, never returned.** No method returns a result union; `ApiError` carries `status`, `code` and
  `detail`, and the app wraps it in `ActionResult` at `apps/macroplan/actions/result.ts`.

### Task 1: epics

**Files:**
- Create: `packages/api-client/src/operations/epics.ts`
- Modify: `packages/api-client/src/macroplan-surface.ts`, `src/index.ts`, `src/clients.test.ts`

- [ ] **Step 1: the module.** Module-private path builders first, following `operations/folders.ts:6-9` — an
      `epicsPath(planId)` built from `planPath`, and an `epicPath(planId, epicId)` built from that, both running
      every id through `encodeURIComponent`. Then the interface:

```ts
export type NewEpic = Decoded<typeof CreateEpicPayload>
export type EpicChange = Decoded<typeof UpdateEpicPayload>
export type EpicPlacement = Decoded<typeof EpicPlacementPayload>

export interface EpicsApi {
  create(planId: string, epic: NewEpic): Promise<Plan>
  update(planId: string, epicId: string, change: EpicChange): Promise<Plan>
  place(planId: string, epicId: string, to: EpicPlacement): Promise<Plan>
  remove(planId: string, epicId: string): Promise<Plan>
}

export function epicsApi(transport: Transport): EpicsApi
```

Every one of the four answers `Plan` — `Decoded<typeof PlanView>`, imported from `./plans.js` rather than
redeclared. **`remove` answers a plan and not `void`**, which is the one thing here that surprises a reader: a
structural delete answers 200 with the whole plan, because deleting an epic re-rails every feature that was on it.
`apps/api/src/routes/macroplan/plan-response.ts:20-27` names the three routes that break that rule and an epic
delete is not one of them. Say so in the TSDoc, because the obvious `Promise<void>` is wrong and typechecks
against nothing.

`place` takes the payload object rather than a bare `railOrder`, even though the domain's `EpicService.place`
takes a bare number (`epic-service.ts:107`) and the handler destructures it out of the body. The wire shape is
`{railOrder}` and the client speaks the wire; matching the domain's asymmetry would put a second spelling of the
same route in the repository.

- [ ] **Step 2: wire it into the surface.** `MacroplanApi` gains `readonly epics: EpicsApi`, bound in
      `createMacroplanSurface`. Both constructors spread the same surface, so the admin and link clients gain it
      together — which is the point, and `macroplan-clients.test.ts:61-70` asserts their key sets stay equal.

- [ ] **Step 3: the exact-key-set test.** `macroplan-clients.test.ts:96` asserts
      `Object.keys(admin).sort()` equals `['credential', 'currentShare', 'plans']`. Add `'epics'` in sorted
      position. This test exists so a new group cannot appear unnoticed; update it, do not loosen it to
      `toContain`.

- [ ] **Step 4: the route assertions.** `clients.test.ts`'s describe block "every operation addresses the path the
      API actually serves" gets one `it` per new route asserting the tuple the existing writes assert —
      `[method, url]`, or `[method, url, body]` where there is a body. Follow the share-links block at
      `clients.test.ts:138-160`. Use an id with a space in it in at least one case, so the `%20` proves the
      encoding, exactly as `package-boundaries.test.ts:74-77` does for `planItemPath`.

- [ ] **Step 5: green, then commit** `"Give the client the epic writes the API has served since phase 1"`.

### Task 2: features, including the whole-list dependency write

**Files:**
- Create: `packages/api-client/src/operations/features.ts`
- Modify: `packages/api-client/src/macroplan-surface.ts`, `src/index.ts`, `src/clients.test.ts`,
  `src/macroplan-clients.test.ts`

- [ ] **Step 1: the module**, same shape as Task 1.

```ts
export type NewFeature = Decoded<typeof CreateFeaturePayload>
export type FeatureChange = Decoded<typeof UpdateFeaturePayload>
export type FeaturePlacement = Decoded<typeof FeaturePlacementPayload>

export interface FeaturesApi {
  create(planId: string, feature: NewFeature): Promise<Plan>
  update(planId: string, featureId: string, change: FeatureChange): Promise<Plan>
  place(planId: string, featureId: string, to: FeaturePlacement): Promise<Plan>
  setDependencies(planId: string, featureId: string, dependsOn: readonly string[]): Promise<Plan>
  remove(planId: string, featureId: string): Promise<Plan>
}
```

- [ ] **Step 2: name what `setDependencies` is, in its TSDoc, because the name is the only warning a caller
      gets.** It is a `PUT` of the **whole** set, not an add and not a remove: `DependenciesPayload` is
      `{dependsOn: EntityId[]}` capped at `LIMITS.edgesPerPlan`, and there is no add/remove pair anywhere in the
      contracts. So adding one edge means reading the feature's current `dependsOn`, appending, and sending all of
      it — which means two callers editing one feature's edges concurrently lose one of the two writes, with no
      `If-Match` to catch it. Record that as the known consequence rather than leaving it for a reader to find;
      `tabs.ts:54-63` is the repo's one conditional write and its `If-Match` header is the shape a later phase
      would add if this becomes a real problem.

      Take `readonly string[]` rather than the payload object here, unlike `place`. The wire body has exactly one
      field, the parameter is that field, and a `{dependsOn}` wrapper at the call site would only be ceremony.
      `folders.ts:46-50` takes a bare `name` for the same reason.

- [ ] **Step 3: assert the 409 is reachable.** `PUT .../dependencies` is the only Macroplan route declaring
      `problemResponses([409])` (`features/routes.ts:101`), and a cycle is how it is reached. Add a test to
      `clients.test.ts` proving a 409 problem document becomes an `ApiError` with `status: 409` and its `detail`
      intact — the client must carry the cycle sentence even though Task 13 will name the cycle before the request
      is sent, because the racing case is real and the sentence is all the caller has.

- [ ] **Step 4: green, then commit** `"Give the client the feature writes, edges included"`.

### Task 3: items, including the description

**Files:**
- Create: `packages/api-client/src/operations/items.ts`
- Modify: the same four files as Task 2

- [ ] **Step 1: the module.**

```ts
export type NewItem = Decoded<typeof CreateItemPayload>
export type ItemChange = Decoded<typeof UpdateItemPayload>
export type ItemPlacement = Decoded<typeof ItemPlacementPayload>

export interface ItemsApi {
  create(planId: string, item: NewItem): Promise<Plan>
  update(planId: string, itemId: string, change: ItemChange): Promise<Plan>
  place(planId: string, itemId: string, to: ItemPlacement): Promise<Plan>
  describe(planId: string, itemId: string, description: string): Promise<Plan>
  remove(planId: string, itemId: string): Promise<Plan>
}
```

`readItem` stays on `PlansApi` where phase 2 put it; do not move it. It reads one item's description and is the
read half of `describe`, but moving it now would churn a shipped call site for tidiness.

- [ ] **Step 2: record the truncation, where the caller will see it.** `DescriptionPayload` is
      `{description: z.string()}` with **no length cap at the wire** — deliberately — and the only cap is
      `cleanDescription`'s 8 192 **UTF-8 bytes** in the domain, which **truncates rather than refusing**
      (`packages/macroplan-domain/src/limits.ts:78-82`). So an over-long description is accepted, silently
      shortened, and answered 200. That is a real data-loss path and the TSDoc on `describe` is where a caller
      finds it; Task 12 is where the field counts bytes so a user is told before it happens.

      The count is UTF-8 bytes, not characters and not UTF-16 units: an emoji costs four and `ItemDocument`'s own
      `.max(MAX_ITEM_DESCRIPTION_BYTES)` counts UTF-16 units and is labelled a backstop
      (`packages/contracts/src/plan.ts:189`, the reasoning above it). A
      client that counts `description.length` will disagree with the server on any non-ASCII text.

- [ ] **Step 3: green, then commit** `"Give the client the item writes, description included"`.

### Task 4: plan settings, the seats, and the assembled surface

**Files:**
- Create: `packages/api-client/src/operations/plan-share-links.ts`
- Modify: `packages/api-client/src/operations/plans.ts`, `src/macroplan-surface.ts`, `src/index.ts`,
  `src/clients.test.ts`, `src/macroplan-clients.test.ts`

- [ ] **Step 1: `plans.ts` gains the three plan-level writes**, and these are the ones that break the pattern the
      previous three tasks established. Say which and why in each TSDoc:

```ts
create(plan: NewPlan): Promise<Plan>          // POST /plans        -> 201, PlanView
update(planId: string, change: PlanChange): Promise<Plan>  // PATCH /plans/{planId} -> 200, PlanView
remove(planId: string): Promise<void>         // DELETE /plans/{planId} -> 204, no body
```

`remove` is the one delete in Macroplan that answers `void`, because a plan that is gone has no representation.
It is also the reason `transport.empty` exists on this surface at all.

- [ ] **Step 2: the seats.**

```ts
export type NewPlanSeat = Decoded<typeof CreatePlanShareLinkPayload>
export type PlanSeatChange = Decoded<typeof UpdateShareLinkPayload>

export interface PlanShareLinksApi {
  create(planId: string, seat: NewPlanSeat): Promise<Decoded<typeof PlanShareLink>>
  update(planId: string, token: string, change: PlanSeatChange): Promise<Decoded<typeof PlanShareLink>>
  revoke(planId: string, token: string): Promise<void>
}
```

Three things here are not guessable and each needs its sentence:

- **There is no `list`.** A plan's seats arrive inside `PlanView.shareLinks`, gated server-side by
  `can(principal, 'share:read', {kind:'plan', planId})` — `packages/macroplan-domain/src/views/plan-view.ts:141`.
  Task 17's manager reads them from a plan read, not from a seats endpoint.
- **`PlanSeatChange` borrows Microtask's `UpdateShareLinkPayload`**, which unlike every plan `Update*Payload` has
  **no non-empty refinement**, so an empty change is a well-formed no-op 200 rather than a 422. A caller that
  sends `{}` gets a success and no change; Task 17 must not rely on the server to refuse an empty edit.
- **`revoke` answers 204 and the revoked lineage is discarded by the route** — the service computes it, the
  handler drops it (`share-links/handlers.ts:96`). Microtask has a `RevokedShareLinks` contract and Macroplan
  deliberately does not, so a manager cannot report "and these three descendants went with it". State that; do not
  invent a second read to recover it.

- [ ] **Step 3: assemble the surface and fix the stale name.** `MacroplanApi` now reads
      `{plans, epics, features, items, shareLinks, currentShare}`. Update the exact-key-set array one final time,
      and rename the test at `macroplan-clients.test.ts:99-105` — "reads a plan through GET, the only method
      phase 2 needs" — since the clause after the comma is now false. Keep the assertion; it is still true that
      `plans.read` issues a GET.

- [ ] **Step 4: the barrel.** Export every new type from `src/index.ts`. The package has **one** export subpath,
      `"."`, so nothing is reachable any other way, and `package-boundaries.test.ts` walks every source file for
      casts, `any`, `@ts-expect-error` and the bare word `process` — all of which must stay absent.

- [ ] **Step 5: move the Macroplan route table out of Microtask's test file.** Tasks 1–3 each appended their
      route assertions to `src/clients.test.ts`, which is Microtask's URL contract, sharing its `calls` log and its
      `sent` helper. By the end of this group that file owns both products' URL contracts and has roughly doubled.
      Split the Macroplan assertions into `src/macroplan-routes.test.ts` with their own helper, leaving
      `clients.test.ts` to Microtask. Do it here rather than earlier, because here is the first moment all four
      groups exist and the split is one move instead of four.

- [ ] **Step 6: state "answers the whole plan" once, not five times.** Each operation module now repeats that its
      methods answer the whole plan because a structural edit can move every bar. Put the reason on `Plan` in
      `operations/plans.ts`, which is the type they all import, and have each member point at it. Five copies of
      one fact is five chances for one of them to go stale — which already happened once in this group, to the
      epic module's account of `plan-response.ts`.

- [ ] **Step 7: decide `signal`, and record the decision rather than leaving it absent.** `Call` supports
      `signal` and `createTransport` rejects an already-aborted one before it reaches `fetch`, but no operation
      module exposes it, so no Macroplan write can be cancelled. **This plan's answer is that it is not needed**,
      and the reason is Task 16: the drag previews locally by re-running the forward pass and sends exactly one
      placement on drop, so there is no superseded in-flight write to abort, and `refresh()` with
      server-answer-wins covers a slow answer. Put that sentence in ADR 0058's consequences (Task 18) so the
      absence is a decision a reader can find, and do **not** add an options parameter to nineteen signatures for
      a cancellation nothing in this phase issues.

- [ ] **Step 8: the gate, then commit** `"Assemble the Macroplan write surface, seats included"`, and push the
      feature branch. **Never `main`.**

---

# Group B — the pure half

Both tasks here are `.test.ts` with no DOM, for the reason ADR 0055 records: a measurement cannot be tested in
this repository, so anything that would need one is a pure function of numbers instead.

### Task 5: where a drop lands

**Files:** Create `packages/canvas/src/drag.ts`, `src/drag.test.ts`. Modify `src/index.ts`,
`src/entry-points.test.ts`

- [ ] **Step 1: the shape.** A drag ends at a point in the canvas's own coordinate space, and the question is
      which rail and which position that names.

```ts
export interface DragPoint {
  readonly x: number
  readonly y: number
}

export interface DropTarget {
  readonly epicId: string
  readonly position: number
}

export const railAtY = (y: number, rails: readonly RailBox[]) => RailBox | null
export const dropTargetFor = (point: DragPoint, rails: readonly RailBox[], scale: PlanScale) => DropTarget | null
```

`dropTargetFor` answers `null` for a point outside every rail, which is a real state — the gutter, the band
header, below the last rail — and is what lets a component cancel a drag rather than place a feature somewhere
arbitrary. Do not clamp to the nearest rail: a clamp turns a mistaken drop into a silent move, and spec §6's
"nothing is ever auto-moved" is the phase gate.

- [ ] **Step 2: position comes from the bars already on the target rail, never from the x alone.** The position a
      feature lands at is how many of that rail's bars start before the drop point. Read them from the `RailBox`
      the caller already has rather than re-deriving order — `railLayout` ordered them by `(position, id)` and
      `packages/canvas/src/rails.ts` argues at length that a rail order derived twice is a bar drawn on the wrong
      rail. The same argument applies to a position computed twice.

- [ ] **Step 3: the tests that matter**, each named as a property rather than a case:
      - a point inside a rail's vertical band answers that rail, and the boundary belongs to exactly one rail —
        test both sides of every edge, so no y falls in two rails or in none.
      - dropping to the left of every bar answers position 0; to the right of all of them answers the count.
      - dropping a feature onto the rail it is already on, at its own place, answers **the index of its own bar**.
        This step originally said "its current position", which is **false** whenever the rail holds a feature the
        pass could not place, and Task 5b exists because of it — see there before relying on this answer.
      - a rail with no bars answers position 0.
      - `null` for a y above the first rail and below the last, and for an x inside the gutter.
      - the function mutates neither argument and two calls agree, following `rails.test.ts:144-148`.

- [ ] **Step 4: `xToDay` gets its first caller here or nowhere.** It has been exported since phase 2 and called
      by nothing (`packages/canvas/src/index.ts:21`). A drop's x becomes a day through it, and
      `packages/canvas/src/scale.ts` already carries the contract that `pxPerDay` is a positive whole number
      because "a fraction that is inexact in binary makes a hover name the day before the one it is over". If this
      task finds it does not need `xToDay` — because a placement is a position and not a day — say so in the
      TSDoc and leave the function alone rather than inventing a use. **A pin is where a day is needed**, and
      Task 12 is where that happens.

- [ ] **Step 5: green, then commit** `"Answer where a drop lands, with no DOM to measure"`.

### Task 5b: a bar's index is not a feature's position

**Files:** Modify `packages/canvas/src/drag.ts`, `src/drag.test.ts`, `src/index.ts`, `src/entry-points.test.ts`

This task exists because **Task 5's Step 3 was wrong**, and the error is one that would have moved features to
places nobody asked for rather than merely failing a check.

`railLayout` **omits a feature the forward pass could not place** — asserted at `packages/canvas/src/rails.test.ts:102-106`,
and the app draws those separately through `unplacedByRail`. But `Position` is "a dense 0-based order within one
parent: no gaps, no ties" over **every** feature of the epic, placed or not
(`packages/contracts/src/plan.ts`). So on a rail holding an unsized feature, a bar's index and its stored
`position` differ.

**A correction to this plan's own evidence, recorded rather than quietly reworded.** An earlier draft of this
paragraph cited spec §3.2 for the claim that an unsized feature is the ordinary mid-planning state, quoting the
executive who "types *Checkout: 40d* before a single item exists". §3.2 does not say that. Its example is a feature
that **has** an authored estimate — which is placed and does draw a bar — and its one "cannot be scheduled"
sentence is about an **item**. The fact this task rests on is owned by `@repo/schedule` instead:
`effectiveEstimate` answers `null` for a feature with no authored estimate and no estimated children, and
`packages/schedule/src/structure.ts` sends it to `unscheduled` as `'no-estimate'`. The defect is real on that
evidence alone; how common the state is, is a judgement this plan makes and the spec does not.

A drop therefore cannot send a bar index as `FeaturePlacementPayload.position`. It would reorder the feature
against siblings the user cannot see.

> **Superseded by what shipped. Read this box before Steps 1–3.** The sketch below proposed a second exported
> function, `positionForDrop`, taking a bar index. **It was refused and does not exist**, for a reason better than
> the sketch: two exported functions both answering "a position" is the original defect under new names, and a
> caller can reach the wrong one. `dropTargetFor` instead takes a `DropQuery` and its `DropTarget.position` **is**
> the stored position `FeaturePlacementPayload` wants. **No bar index is exported from `@repo/canvas` at all.**
> Anything below that speaks of a bar index, or of `positionForDrop`, describes a design that was rejected — do not
> implement it and do not compare against it.

- [ ] **Step 1: one more pure function, not a fix inside the component.** Task 16's component is a thin renderer by
      ADR 0055, and this is arithmetic, so it belongs here where it is testable with no DOM:

```ts
export const positionForDrop = (
  features: readonly ScheduleFeature[],
  placedIds: readonly string[],
  barIndex: number,
) => number
```

Take the rail's features in their stored order and the ids that actually got a bar, and answer the stored
position to send. The rule is **land where the bar you were dropped in front of sits in the stored order**: the
position of the placed feature now at `barIndex`, or one past the rail's last position when the drop is past every
bar. That is the only rule with an observable meaning, because the user is reasoning about the bars they can see
and cannot see the others at all.

- [ ] **Step 2: the properties to pin.**
      - a rail whose every feature is placed answers the bar's own stored position **for a feature arriving from
        another rail**. For a feature moving along the rail it already sits on the answer is one lower on a
        rightward move, because `placeAmong` lands it among the siblings left once it is lifted out. Those two
        cannot both be "the identity" and an earlier draft of this step wrongly said they were.
      - a rail with an unsized feature **before** the target answers the stored position, not the bar index, and
        a test names the two numbers differing.
      - a drop past every bar answers one past the rail's highest position, so a feature dragged to the end lands
        at the end and not on top of an unplaced sibling.
      - an unsized feature's relative order is **not** disturbed by a drop that lands elsewhere on the rail.
      - a `barIndex` no bar has answers the past-the-end position rather than throwing, because that is what
        `dropTargetFor` answers for a drop to the right of everything.

- [ ] **Step 3: say in the TSDoc which of the two numbers each function speaks.** `DropTarget.position` is a bar
      index and `positionForDrop`'s answer is a stored position, and the whole defect was those two sharing a name.
      Consider renaming `DropTarget.position` to `barIndex` so the type system carries the distinction rather than
      a comment — **prefer that** if it does not ripple past this package, since a name is the only thing that
      survives a copy.

- [ ] **Step 4: green, run `pnpm --filter macroplan test` as well, then commit**
      `"Send the position a plan stores, not the index a bar happens to have"`.

### Task 6: the conflict list's rows

**Files:** Create `apps/macroplan/components/plan/conflicts/conflict-rows.ts`, `conflict-rows.test.ts`. Modify
`packages/canvas/src/plan.ts`, `src/index.ts`, `src/entry-points.test.ts`

- [ ] **Step 1: widen `CanvasSchedule`, as its own TSDoc instructs.** It declares only `spans` and says a module
      needing `unscheduled`, `cycles` or `ignoredEdges` "should widen this interface rather than restate the wire
      shape a second time" (`packages/canvas/src/plan.ts:55-62`). Widen it with the three, each optional in the
      sense that the wire always carries them — `ScheduleView` is `{spans, cycles, unscheduled, ignoredEdges}` —
      so they are required members and a phase-2 caller passing a parsed `ScheduleView` still satisfies it.
      Declare the three member types by extending `@repo/schedule`'s `Cycle`, `Unscheduled` and `IgnoredEdge`
      rather than restating them, exactly as `CanvasSpan extends Span`.

      **Corrected after implementation: "widen it" means declare a widened interface, not mutate the base — and
      mutating the base would have broken something real.** `treatment.ts:41-44` says of its own
      `CanvasScheduleWithStatus extends CanvasSchedule`: "`cycles` is not here because it would be a second route
      to the same answer — every feature in a cycle already carries an `'in-cycle'` entry in `unscheduled`, so
      reading `cycles` too would let two derivations of one mark's treatment disagree." Putting `cycles` on the base
      hands `treatmentOf` exactly that route back and leaves that paragraph claiming a protection the types no
      longer give, while making `CanvasScheduleWithStatus` structurally identical to `CanvasSchedule` — a name that
      lies. So this task declares its own `CanvasScheduleWithConflicts extends CanvasSchedule`, which is also how
      the one module that already followed the instruction read it.

      The extend-the-three instruction is also not literally possible: the wire carries `Cycle`, `Unscheduled` and
      `IgnoredEdge` exactly as the forward pass holds them, so there is nothing to add and
      `interface CanvasCycle extends Cycle {}` is a `no-empty-object-type` error under `tseslint.configs.strict`.
      Import the three directly, which is what `treatment.ts` already does with `Unscheduled`.

- [ ] **Step 2: three sections, three sentences, and the distinction that matters most.** The rows are a
      rendering of `ScheduleView`, and the whole reason `ignoredEdges` is carried separately is argued in
      `packages/contracts/src/schedule-view.ts:34-42`: "A canvas that could not tell 'this bar ignores a
      dependency' from 'this bar could not be placed' would have to guess which sentence to show" — the subject is
      a canvas, not "a client", which an earlier draft of this line had. So:

      - **`cycles`** — features waiting on each other. Every feature in the cycle is named, and the plan
        contradicts itself. This is the one section a user must act on.
      - **`ignoredEdges`** — a feature that **did** get a span, because one of its stated dependencies was set
        aside to produce it. Phase 2's `treatmentOf` deliberately refuses to draw this as a treatment, precisely
        so this section can say it properly (`packages/canvas/src/treatment.ts`, and the phase-2 plan's Task 10).
      - **`unscheduled`** — `'no-estimate'`, nothing was sized; or `'in-cycle'`, a cycle kept it off the axis.
        Two reasons, two sentences: `UnscheduledReason` is a two-case union and collapsing it into "could not be
        scheduled" hides which one the user can fix.

        **Do not write "a cycle already named above".** An earlier draft did, and it is false for an item:
        `Cycle` carries only `featureIds`, and an in-cycle feature "drags every item under it down too, whether or
        not those items carry estimates of their own" (`schedule-view.ts:28-29`), so an **item** with that reason
        appears in no `cycles` entry anywhere. Blame the cycle without claiming membership.

- [ ] **Step 3: rows carry names, not ids.** An id is a ULID and means nothing on screen. Resolve each id against
      the plan's own features and items, and answer a row whose text is ready to render, following
      `components/plan/table/rows.ts`. An id the plan does not hold answers a row that says so rather than
      throwing — a schedule and a plan that disagree is a bug worth showing, not a crash.

- [ ] **Step 4: assert the count, then the content.** Read "each lands in exactly one section" as **each schedule
      entry becomes exactly one row**, not as each id appearing once: a feature in a cycle legitimately shows up
      twice — once in its `cycles` row and once as an `'in-cycle'` unscheduled row — because the forward pass
      reports it twice and the two statements say different things. An earlier draft of this step said "exactly one
      section" without that distinction and is not satisfiable as written.

      A plan with no conflicts answers no rows at all, so the
      component can render nothing rather than an empty heading. Build one fixture that has all four states at
      once — a cycle, an ignored edge, an unestimated feature and an in-cycle one — and assert each lands in
      exactly one section.

- [ ] **Step 5: green, then commit** `"Turn a schedule's three refusals into rows that name them"`.

---

# Group C — the actions, and who may see a control

### Task 7: the structural writes, one field at a time

**Files:**
- Create: `apps/macroplan/actions/epics.ts`, `actions/features.ts`, `actions/items.ts`, and a `.test.ts` each
- Create: `apps/macroplan/components/plan/admin-actions.ts`

Read `apps/microtask/actions/tasks.ts` first. It is the template and every rule below is already visible in it.

- [ ] **Step 1: the shape of one action**, which never varies:

```ts
'use server'

export async function renameFeature(
  planId: string,
  featureId: string,
  name: string,
): Promise<ActionResult<Plan>> {
  const result = await adminCall(planPath(planId), (api) =>
    api.features.update(planId, featureId, { name }),
  )
  if (result.ok) refresh()
  return result
}
```

Four things in that are load-bearing and each has a reason recorded somewhere in the repo:

- **`refresh()` from `next/cache`**, not `revalidatePath` and not `revalidateTag`. `refresh` is the only
  revalidation call anywhere in this repository — eighteen call sites in `apps/microtask/actions/*.ts` — and it is
  called **only on success**, because a refused write changed nothing and re-rendering would replace the sentence
  the user needs to read.
- **Positional typed arguments, not `FormData`.** The only `FormData` action in the repo is `signIn`, because a
  login form posts before any JavaScript has run. Everything else takes typed arguments from a client component.
- **The pathname is built from route facts** by the caller, never read from a header, because it only ever reaches
  `?next=` through `safeNextPath` and an action is a public endpoint that any POST can reach.
- **`adminCall` re-derives authority from `mp_admin` on every call.** An id in the arguments is a *target* for the
  API to judge, never proof the caller may touch it (`actions/result.ts:47-53`).

- [ ] **Step 2: split every field the API authorises separately into its own action.** This is header decision 8
      and it is the one place a reasonable-looking shortcut produces a real defect. `PATCH .../features/{id}`
      branches over `name`, `estimateDays` and `pinSprint` and issues **up to three** `authorize` calls for one
      body; `feature:estimate` is a `write` action and `feature:pin` is `manage`. A single `updateFeature` action
      taking all three fields therefore fails wholesale for a `write` seat that touched two of them, writing
      neither and reporting one 403.

      So: `renameFeature`, `estimateFeature`, `pinFeature` — three actions, three requests, each carrying exactly
      one field. Split items the same way — `renameItem`, `estimateItem`, `describeItem` — but **not for the same
      reason, and do not write that it is**: `item:rename` and `item:estimate` are **both** `write`
      (`packages/kernel/src/access/policy.ts`), so no seat can be half-refused there today, and
      `packages/api-client/src/operations/items.ts` already calls that split "a seam for a later role split rather
      than a reason to send one field per request". An earlier draft of this step said "same for items" and implied
      the authorisation argument carries over. It does not. `describeItem` is a different route entirely
      (`PUT …/description`, `item:describe`) and was never mergeable. **Write the test that proves it**:
      a fake API recording every request, driven by a save of two fields, asserting two separate `PATCH`es with
      one field each. Name it for the property, not the mechanism — a `write` seat may set an estimate on a
      feature it may not re-pin, and both fields must still land.

- [ ] **Step 3: `placeFeature` and `placeItem` answer the plan, and that is what makes undo possible.** Every
      structural write answers the whole `PlanView`, which phase 1 wrote for this phase by name. An action
      therefore returns `ActionResult<Plan>` and not `ActionResult<void>`, and Task 16's undo reads the placement
      it is undoing from the plan it was given before the drop rather than keeping a shadow copy.

- [ ] **Step 4: collect the actions into one object per audience**, following
      `apps/microtask/components/projects/admin-actions.ts:17-46`. A component takes the object as a prop and
      **never imports an action** — which is what lets one component serve the admin surface and a seat, and what
      makes a test able to hand it `vi.fn()`s typed off the real interface.

      Every action in the object must be able to answer an `ActionFailure`, because `eachOrNoAnswer`'s
      `Refusable<Actions>` constraint requires it (`packages/app-session/src/no-answer.ts:45-51`). An action typed
      `Promise<void>` will not typecheck into it, which is the compiler catching a write whose refusal had nowhere
      to go.

- [ ] **Step 5: the test setup is boilerplate and getting it wrong looks like a bug in Next.** Follow
      `apps/microtask/actions/tasks.test.ts:1-19` exactly: mock `../lib/api`, then
      `vi.mock('next/cache', () => ({ refresh: () => refresh() }))`, then `vi.mock('next/navigation', …)` throwing
      a `Redirected` sentinel, then `await import('./features')` **after** the mocks. Without the `next/cache`
      mock, each test that reaches a `refresh()` throws `refresh can only be called from within a Server Action`
      on Next 16.3.4 — the import itself succeeds, so the symptom is a run of individually failing tests rather
      than the import-time explosion an earlier draft of this step claimed.

- [ ] **Step 6: green, then commit** `"Write one field per request, because the API authorises one field at a time"`.

### Task 8: the same writes from a seat

**Files:**
- Create: `apps/macroplan/actions/seat-writes.ts`, `seat-writes.test.ts`
- Create: `apps/macroplan/components/plan/seat-actions.ts`

- [ ] **Step 1: the token is the first argument of every seat action**, and the reason is ADR 0040: on the link
      surface the token in the URL **is** the credential, there is no cookie behind it, and `linkCall` builds the
      client from it per call. Follow `apps/microtask/actions/link-share-links.ts:15-30`, which argues the same
      first-argument convention for the same reason.

- [ ] **Step 2: a seat's refusal never becomes a password form.** `linkCall` already routes a 401 to
      `/s/unavailable` rather than `/login`, and `linkRemedyFor` in `lib/problem.ts` explains why at length: a
      holder with no password must never be answered with one — it has no `'login'` branch at all, so a 401 there
      can only produce `unavailable`. Do not add a pathname argument to a seat action — there is nothing
      for `?next=` to carry that would not be the credential itself, which is the leak `proxy.ts` rule 2 exists to
      prevent.

- [ ] **Step 3: the seat writes are a subset, and the subset is not chosen here.** A `view` seat may write
      nothing, a `write` seat holds seven of the eighteen, a `manage` seat the rest. **Derive that from the
      kernel's `GRANTS` and not from spec §7.1's table** — the two disagree, which Task 8 discovered: the table's
      `write` row omits `item:describe`, which `GRANTS` holds. The grant is the gate; Task 18 Step 5c amends the
      table. The seat action file exposes **all** of them and lets the API refuse — a client-side subset would be
      a second, drifting copy of the policy. What decides whether a *control* is drawn is Task 9, and that is a
      rendering answer.

- [ ] **Step 3b: factor the shared body, as Task 7 did for the admin.** Task 7 extracted `adminWrite(planId, call)`
      rather than repeating `if (result.ok) refresh()` eighteen times, and a reviewer judged that the right seam.
      The seat's twin belongs beside it in `actions/plan-write.ts`, which is deliberately **not** a `'use server'`
      module: Next registers every export of such a module as a public Server Action with its own id, and both
      helpers take a callback no browser could serialise. Work that out before deciding where it goes, because
      putting it in `seat-writes.ts` — which *is* `'use server'` — would publish a broken endpoint.

      Decide `refresh()` for the seat **separately** rather than copying the admin's answer, and say what settled
      it: what a seat page renders from, and whether `linkCall` can carry the refresh itself given that it is also
      the body of `linkRead`, which a page calls while it renders.

- [ ] **Step 3c: wire them into `components/plan/seat-actions.ts`,** which must produce the same
      `PlanEditActions` the admin wiring satisfies, so one component serves both audiences. The token is bound in;
      `apps/microtask/components/link/link-actions.ts` is the precedent and states what binding costs.

      **The trap:** `admin-actions.test.ts` guards its wiring by asserting each member's `.name` equals its key —
      the only check that catches `renameFeature` wired where `renameItem` belongs, their signatures being
      identical. `.bind(null, token)` names a function `"bound renameFeature"`, so that sweep cannot be copied.
      Resolve it; do not leave the seat side unguarded and do not weaken the admin's sweep to accommodate it.

- [ ] **Step 4: green, then commit** `"Let a seat write what its role allows, with the token as the credential"`.

**For whoever next adds a seat write: split the file first.** `seat-writes.ts` shipped at 137 code lines against
ADR 0027's 150, and the headroom is smaller than that gap suggests. It buys the margin with a
`type Answer = Promise<ActionResult<Plan>>` alias that its three admin twins do not use; spelling the return type
out the way they do adds ~21 characters to five signatures that are already 94–103 wide, breaking each across
several lines and putting the file **over** the cap. So the alias is load-bearing rather than cosmetic, and it is
also the one place the seat file stops mirroring the admin files its own TSDoc says it mirrors.

The split is **by entity, exactly as the admin side is split** — `seat-epics.ts` (5), `seat-features.ts` (7),
`seat-items.ts` (6), landing each at roughly its twin's size and restoring the one-file-to-one-file mirror. Not by
"first N actions": there is no seam there. The type aliases and the import block get duplicated three ways, which
is already this repo's habit — `features.ts` and `items.ts` each declare their own `Estimate`. The file-level
charter needs one home rather than three copies, and that home is `seatWrite`'s own TSDoc in `plan-write.ts`.

Steps 3b and 3c were added **after** Task 8 shipped. They are what its Files list implied and its steps never said,
and I handed them to the implementer as though the plan carried them. Recorded here so Task 18's audit compares
against what was actually asked.

### Task 9: which controls to draw

**Files:**
- Modify: `apps/macroplan/lib/plan-capabilities.ts`, `lib/plan-capabilities.test.ts`
- Create: `apps/macroplan/lib/admin-controls.ts`, `admin-controls.test.ts`
- Modify: `apps/macroplan/components/plan/plan-screen.tsx`,
  `apps/macroplan/components/plan/canvas/plan-canvas.tsx`,
  `apps/macroplan/components/plan/table/plan-table.tsx`, `apps/macroplan/app/s/[token]/page.tsx`, and their tests

- [ ] **Step 1: widen `PlanControls` past the four share booleans.** It exists, it is correct, and it has **no
      shipped call site** — `planCapabilities` is called only by its own test, and its TSDoc says "Phase 2 draws
      none of these". Add one boolean per control this phase draws: create, **rename**, **recolour**, reorder and
      delete an epic; create / rename / estimate / place / pin / delete a feature; create / rename / estimate /
      **describe** / place / delete an item; and edit dependencies. **Eighteen booleans, one per member of
      `PlanEditActions`, and no nineteenth.**

      This sentence read "the same for an item" until Task 9 checked it against the interface. That asked for a
      `pinItem` — no action, no route, no grant, and none by design: spec §3.1 makes a pin the way a fixed point in
      time enters the model, which is a *feature's* business, while an item is the breakdown under one. It also
      dropped `describeItem`, which both surfaces ship. The two lists both total eighteen, which is why the error
      survived four readings. Derive from the interface; a count agreeing proves nothing.

      **Derive that list from `PlanEditActions` rather than from this sentence**, and say in the commit whether the
      two agree. An earlier draft of this step omitted rename and recolour, which would have left `renameEpic` and
      `recolourEpic` shipped in Task 7 with no control that could ever call them — dead surface nothing would have
      caught, since a missing boolean is not a type error. Epic hue is not decoration: spec §4 settles that "**Epic
      owns hue. Status owns treatment**", so an epic's colour is the only thing making it traceable across rails,
      and a plan that cannot recolour one cannot fix a clash. One boolean each even though every `epic:*` action is
      a single `manage` grant, because a control is a rendering answer and the drawer draws these separately.

      **"Change plan settings" was in that list and is now out**, which is the same mistake in the mirror. There is
      no plan-settings action on either surface — no `actions/plans.ts`, nothing in `PlanEditActions` — and no task
      in this phase builds one, so the boolean would have had nothing behind it. `plans.update` does exist in the
      client from Task 4, and `plan:rename` and `plan:retime` are `manage` grants, so the *capability* is real; what
      is missing is any UI, and spec §9's phase-3 row does not ask for one. Retiming a plan moves every bar on it,
      which is not a control to add as a side effect of drawing a list. If a later phase wants it, it adds the
      action, the control and the surface together. Audit item **7l** sweeps both directions so neither half can
      ship alone again.

      **Read the three `share:*` rows through `mayReach(role, scope, action, 'plan')` and the rest off the
      record.** This is not stylistic: `capabilities()` answers each action against its own declared `target`, and
      the three share rows name `'project'` because one `GRANTS` row serves both products — so reading them off
      the record answers `false` for a `manage` seat the server would serve. `plan-capabilities.ts:19-38` already
      argues this in full, including why `share:create` is the one of the four that may be read off the record.
      Follow the file that is already right; the failure mode is a share manager that renders no controls at all.

- [ ] **Step 2: the admin is not a role.** Build `ADMIN_CONTROLS` as every control `true`, mirroring
      `apps/microtask/components/shared/admin-capabilities.ts:12-14` and its rationale. Do not invent a synthetic
      `'admin'` role to pass through `planCapabilities` — `can()` short-circuits for an admin before any role is
      consulted (`policy.ts:119`) and a fourth role in a client would be a second policy.

- [ ] **Step 3: a control is a rendering answer and never a gate.** Put that sentence in the interface's TSDoc,
      as `apps/microtask/components/task-tree/controls.ts:4` does. A seat re-roled between render and click meets
      the API's own 403, and the test that matters asserts a refused write still surfaces its sentence — not that
      the control was hidden.

- [ ] **Step 4: thread the seat's role in, which means keeping something the seat page currently throws away.**
      `app/s/[token]/page.tsx:62-66` reads `PlanShareView` and uses only `scope.planId` and `plan.name`. Its
      `role` and `scope` are what `planCapabilities` needs. Pass the resulting `PlanControls` — **not the role,
      and never the `PlanShareView`** — into the screen, so nothing downstream can re-derive a permission from a
      credential-shaped value.

- [ ] **Step 5: lower the ceiling onto the two components that render the plan.** `PlanCanvas` and `PlanTable`
      both declare `readonly plan: Plan`, which includes `shareLinks`; the narrowing to `PlanScreenModel` sits one
      level up on `PlanScreen`, and `plan-screen.tsx:58-59` calls it a ceiling. This phase mounts components
      **beside** `PlanScreen` — a drawer, a conflict list, a share manager — where a ceiling one level up reaches
      nothing. Change both props to `PlanScreenModel`. It makes the guarantee structural instead of positional.

      **It is not "a one-word change in each", as this step claimed.** `PlanScreenModel` is deliberately *not*
      assignable to `Plan` — `shareLinks?: never` is what makes the strip a `TS2375` rather than a silent pass, and
      `plan-screen-model.ts` argues that at length — so the floor has to go all the way down to everything those
      two hand a plan to: `railNames`, `tableRows`, `QuarterBandLayer`, `SprintTickLayer` and `TodayMark`, each
      typed `Plan` today. That is the step working as intended rather than a complication, since a ceiling that
      stops above the layers is the positional guarantee this step exists to replace. Two more files also need it:
      `app/(admin)/plans/[planId]/page.tsx` must pass `ADMIN_CONTROLS` once `controls` is required, and
      `plan-hover.test.tsx` and `rows.test.ts` move with the narrowed props.

- [ ] **Step 6: green, then commit** `"Decide which controls to draw, and make the token-free type the floor"`.

---

# Group D — the surfaces

### Task 10: the drawer is a route

**Files:**
- Create: `apps/macroplan/app/(admin)/plans/[planId]/layout.tsx`, `loading.tsx`,
  `f/[featureId]/page.tsx`, `i/[itemId]/page.tsx`, and a test each
- Modify: `apps/macroplan/app/(admin)/plans/[planId]/page.tsx`, `page.test.tsx`
- Create: `apps/macroplan/lib/drawer-routes.ts`, `drawer-routes.test.ts`
- Create: `apps/macroplan/components/plan/drawer/drawer-panel.tsx` and its test
- Modify: `apps/macroplan/app/s/[token]/page.test.tsx`

- [ ] **Step 1: move the canvas and the table into the layout, and make `children` the drawer slot.** This is
      header decision 4. A layout does not re-render when navigation moves between its children, so selecting a
      feature costs one soft navigation and re-renders the drawer alone — not the 2 000 SVG nodes beside it. The
      plan read is already `cache()`d (`read-plan.ts:43`), so the layout and the drawer share one read on a cold
      load and the drawer reads alone on a soft one.

- [ ] **Step 2: two segments, and the paths in one module.** `f/[featureId]` and `i/[itemId]`, short because a
      URL is read by people, and both spelled by `lib/drawer-routes.ts` alongside the seat twins under
      `/s/[token]/`. `lib/routes.ts` already holds `planPath` and `linkPath`; follow it, and export the four
      builders from one file so no component concatenates a path.

- [ ] **Step 3: an id that names nothing is `notFound()`, not an empty drawer.** The plan read already answers a
      whole `PlanView`; a `featureId` absent from it is a stale link, and `missingIsNotFound` is the existing
      idiom for the shape (`packages/app-session/src/action-result.ts:41-44`). The drawer's own `not-found.tsx`
      should leave the canvas on screen — which it does for free, because it renders inside the layout.

- [ ] **Step 4: the empty state is a page, not a hidden panel.** `page.tsx` becomes the no-selection state and
      says what to do. Do not render a collapsed drawer: the table is always mounted for the reason
      `plan-screen.tsx:84-90` gives, and a second always-mounted panel with no content is markup nobody reads.

- [ ] **Step 5: honour the instruction phase 2 left in the leak sweep, on both surfaces.** This is the task that
      trips two deliberately-placed tripwires, and neither may be relaxed:

      - `app/(admin)/plans/[planId]/page.test.tsx:291-293` asserts the page "hands over no function at all, so no
        token is hiding in a bound action's arguments", and the comment at `:130-134` says phase 3's first bound
        action "fails that assertion rather than passing it quietly, and whoever adds it has to say how its
        arguments are proved clean." **Widen the sweep to read a bound function's arguments** and assert that
        every argument handed across the boundary is an id the plan itself holds — never a token, never a whole
        plan, never a `PlanShareView`.
      - `app/s/[token]/page.test.tsx:139-143` records the mirror image as a **KNOWN GAP**: the seat surface's
        sweep *skips* functions entirely, and "Phase 3 will [bind one], and must widen this to read a bound
        function's arguments before it does." Close it here. This is the surface where a token **is** the
        credential, so it is the one where a bound argument leaking one matters most.

      If the honest answer turns out to be that no function needs binding at all — because a seat action takes its
      token as a plain first argument supplied by a client component that read it from its own route params —
      then say that, and keep both assertions at zero. A sweep that stays green for a stated reason is a better
      outcome than a widened one.

- [ ] **Step 6: green, then commit** `"Make a selection a URL, and teach both leak sweeps to read an argument"`.

### Task 11: the name and the estimate

**Files:**
- Create: `apps/macroplan/components/plan/drawer/name-field.tsx`, `estimate-field.tsx`, `description-field.tsx`,
  and a test each

- [ ] **Step 1: the field idiom is already established — copy it rather than inventing one.**
      `apps/microtask/components/task-tree/inline-name.tsx` is the model: a `'use client'` field, a bare `async`
      handler (no `useTransition` — the repo has exactly one, in `create-project.tsx`), commit on blur and on
      Enter, `role="alert"` for the refusal, and **what is shown after a write is what the server stored**, not
      what was typed (`inline-name.tsx:79` keeps `result.value`). There is no `react-hook-form`, no Zod resolver,
      no `Form`/`FormField` in `@repo/ui`, and no toast — `sonner` exists and has never been imported. An inline
      `role="alert"` line is the house answer.

- [ ] **Step 2: the estimate field, which has no precedent in this repository and one genuine trap.**
      `type="number"`, `inputMode` and `valueAsNumber` appear **nowhere** in `apps` or `packages`, so this is the
      first numeric field. The trap is that `EstimateDays` is **nullable** on both features and items, and
      `packages/contracts/src/plan.ts:116` records why null and 0 differ: **0 is a milestone**, a real estimate
      meaning no time, and `null` means nothing was sized. `effectiveEstimate` tests `=== null` and never
      truthiness, and `packages/schedule/src/estimate.ts:28-31` warns that a truthiness check "would silently
      resurrect the authored value and draw a bar where the plan says there is none".

      So the field has **three** states, not two: empty means `null`, `0` means a milestone, and a number means
      days. The microtask string idiom — `''` means "no change, send nothing" — does not cover it, because here
      `''` is a value worth sending. Decide it explicitly, test all three transitions including
      **`0` → empty** and **empty → `0`**, and reject a negative or fractional value in the field rather than
      letting the API answer 422 with a generic sentence.

- [ ] **Step 3: the description field counts UTF-8 bytes.** The cap is 8 192 **bytes** and the domain
      **truncates** rather than refusing (`limits.ts:78-82`), answering 200 with silently shortened text. So the
      field must count bytes and refuse before sending, or a user loses the tail of what they wrote with no
      message at all. `description.length` is the wrong count — it is UTF-16 units, so one emoji reads as 2 and
      costs 4. **No character ever encodes to fewer UTF-8 bytes than UTF-16 units**, so a `.length` check is always
      the permissive one and can only ever under-report the cost — it will let through exactly the strings that get
      truncated, which is the one thing this field exists to prevent. Use
      `new TextEncoder().encode(value).length`, and put the remaining budget on screen near the cap
      rather than only at it.

- [ ] **Step 3b: this task adds the first `'use client'` file under `components/plan/**`, so it is this task that
      turns that sweep into an allowlist — not Task 16.** `module-boundaries.test.tsx:168-172` asserts **every**
      non-test file under `components/plan/**` declares no `'use client'`. The field idiom this task copies is a
      client component (`apps/microtask/components/task-tree/inline-name.tsx:1`), so the three fields break that
      assertion the moment they exist. Task 16 Step 6 was written as the task that converts the sweep, which was
      simply wrong about which task gets there first.

      **Do not delete the assertion and do not weaken it.** Make it a named allowlist — the client files this task
      adds, listed explicitly — with the same sweep asserting every other file under the subtree is still
      server-rendered. Add the assertion the old one implied but never had to state: **no client file under
      `components/plan/**` receives a share token or a whole plan.** A file added to the allowlist without a line in
      this plan is then a visible decision rather than a quiet one.

- [ ] **Step 3c: the fields need a `planId` and an action, and `drawer-panel.tsx` receives neither.** Task 10 built
      the panel to take one worded `TableRow` and a `closeHref`; `planId` exists there only inside that href, and no
      `PlanEditActions` reaches it. Thread both, and note what Task 10's review established: the `tableRows` seam
      the panel reads is **worded for display** — an estimate arrives as `planned 40d · broken down to 5d · -35d`,
      a sentence and not a field value. A field needs `feature.name` and `estimateDays: number | null`. So the
      panel's read-only wording and the fields' raw values are two different needs on one subject; decide how both
      arrive without the panel growing a second source of truth for the same fact.

- [ ] **Step 4: green, then commit** `"Take a name, a nullable estimate and a byte-capped description"`.

### Task 12: the pin, and the number that matters

**Files:**
- Create: `apps/macroplan/components/plan/drawer/pin-field.tsx`, `breakdown-line.tsx`, and a test each

- [ ] **Step 1: the pin is a sprint index, it is `manage`, and the server will not sanity-check it.**
      `pinSprint` is one nullable integer on features only, it joins `max()` as one more lower bound, and it is
      "the *only* way a fixed point in time enters the model" (spec §3.1). `SprintIndex` is
      `int min 0` with **no upper bound** (`packages/contracts/src/plan.ts:59-63`), so a typo of `500` is accepted
      and places a feature a decade out. Give the control its own ceiling and say in the TSDoc that the ceiling is
      the client's, because the contract does not have one.

      Show the sprint as the dates it means, not as a bare index. `rangeOfSprint` is exported from
      `@repo/schedule` and is the one **inclusive** range in that package — its `to` is the last day, where
      `endDay` everywhere else is exclusive. Getting that backwards shows a pin one day short.

- [ ] **Step 2: the breakdown line is the most useful number in the application, and it already exists.** Spec
      §3.2: an executive types *"Checkout: 40d"*, a team later breaks it into items totalling 62, the authored 40
      is **kept, not overwritten**, and the pair renders as *planned 40d · broken down to 62d · +22d*. That gap
      "is where a macro plan is wrong, stated in days, before anything is late."

      `breakdown(feature, items)` is already exported from `@repo/schedule` and answers exactly
      `{planned, brokenDown, delta}` or `null`. Do not recompute it. Two properties from its TSDoc must reach the
      screen intact: it answers `null` when there is no **pair** to compare, and a **negative delta is a real and
      reportable state** — a part-sized breakdown under a whole-feature estimate — not an error to hide.

- [ ] **Step 3: an estimate authored on a feature that has estimated items does not move a bar.** That is ADR 0051
      and `effectiveEstimate`'s gate is *at least one estimated item*, not *has items*. So a `write` seat typing a
      feature estimate under a broken-down feature sees the discrepancy change and the canvas stay still. Assert
      it — it reads as a bug to anyone who has not been told, and it is the behaviour the ADR chose.

- [ ] **Step 4: green, then commit** `"Pin to a sprint, and show the gap between planned and broken down"`.

### Task 13: dependencies, and the cycle named before it is sent

**Files:**
- Create: `apps/macroplan/components/plan/drawer/cycle-check.ts`, `cycle-check.test.ts`,
  `dependency-editor.tsx`, `dependency-editor.test.tsx`

This is the phase gate's first half — "cycle refusal pinned by test" — and header decision 7 is the design.

**The action already exists.** `setDependencies` is on `PlanEditActions` and wired into both audiences before this
task opens, so this task creates no action file and modifies none. The plan inventory always declared it in
`actions/features.ts`; this task's file list never did, and that disagreement was found by Task 7's spec review
rather than by anybody reading the task. Take the write as given and spend the task on the refusal. Two properties
of it are this task's to reckon with, and both are visible in `packages/api-client/src/operations/features.ts`
rather than in this sentence — read them there: what the route replaces, and what it does **not** send that would
let two editors' writes be ordered.

- [ ] **Step 1: `cycle-check.ts` is pure, and it is where the gate is met.** Given the plan's features and a
      proposed `dependsOn` for one of them, answer either the cycle it would create — as the **names** of the
      features in it, in the order they wait on each other — or `null`.

```ts
export interface ProposedCycle {
  readonly featureIds: readonly string[]
  readonly sentence: string
}

export const cycleFrom = (
  features: readonly PlanFeature[],
  featureId: string,
  dependsOn: readonly string[],
) => ProposedCycle | null
```

Use `findCycles` from `@repo/schedule`; do not write a second graph walk. It is already exported, already
property-tested, and this package is bundled for the browser by its own assertion
(`packages/schedule/src/purity.test.ts:40`). Two properties to match the server's behaviour exactly, both visible
in `packages/macroplan-domain/src/services/feature-service.ts`:

- **A self-edge is refused separately** and is not a cycle (`feature-service.ts:76` throws `Invalid`, not
  `Conflict`). Say so with its own sentence.
- **Any cycle in the resulting graph refuses the write, not only one through the edge just added**
  (`feature-service.ts:157-162`). A plan that already contains a cycle refuses an unrelated edge, and a user who
  is not told that will think the editor is broken. Test it.

Also dedupe, as the server does (`[...new Set(dependsOn)]`), and mind the edge budget: `assertWithin` is asked
"may one more be added" and is therefore called with `total - 1` (`feature-service.ts:185`). A client that
compares against `LIMITS.edgesPerPlan` directly will be off by one at exactly the cap, which is where caps are
tested.

- [ ] **Step 2: the editor refuses locally and the API stays the authority.** State it in the TSDoc in those
      words, because it is the same rule ADR 0038 sets for capabilities and the same rule this repo applies to
      every client-side check: **a message, never a gate.** The write is still sent in every case the local check
      passes, and a 409 that comes back anyway is rendered — which after this task can only mean this page's plan
      is not the server's, and "Someone else changed this at the same time. Reload the page and try again." is then
      the true sentence.
      That is the whole reason this design was chosen over letting the API's `detail` through: it makes an existing
      sentence correct rather than carving out an exception to `lib/problem.ts`'s rule.

- [ ] **Step 3: the editor sends the whole list.** `PUT .../dependencies` replaces the set; there is no add and no
      remove. So the control's model is the feature's current `dependsOn` plus or minus one, sent entire. Two
      editors on one feature lose a write, which Task 2 recorded on the client method — repeat it here in one
      sentence rather than making a reader find it.

- [ ] **Step 4: edges exist at the feature level and nowhere else.** Spec §3.1 says why, and it is not an
      oversight to be helpful about: a feature is a contiguous block, "contiguity is what makes an edge between
      two features mean something at the year rung, and it is why edges exist at the feature level and nowhere
      else". The item drawer therefore has no dependency control at all, and spec §8 records cross-plan
      dependencies as **rejected**, so the candidate list is this plan's features and never a search.

- [ ] **Step 5: green, then commit** `"Refuse a cycle by naming it, and leave the API the authority"`.

### Task 14: the conflict list

**Files:**
- Create: `apps/macroplan/components/plan/conflicts/conflict-list.tsx`, `conflict-list.test.tsx`
- Modify: `apps/macroplan/components/plan/plan-screen.tsx`

- [ ] **Step 1: render Task 6's rows, server-side, with no client boundary.** Three sections, each with a heading
      that says what the section means, and nothing at all when there are no conflicts. It is the fourth thing
      mounted beside the canvas and the table, so it takes `PlanScreenModel` like they now do.

- [ ] **Step 2: a conflict row links to the thing it names.** Each row's feature is a drawer link built from
      `lib/drawer-routes.ts`, so the list is how a user gets from "this is wrong" to the control that fixes it.
      That is the whole reason the list is worth building rather than a badge.

- [ ] **Step 3: no class name built by interpolation.** `module-boundaries.test.tsx:105-120` sweeps the rendered
      DOM of every tree under `components/plan/**` and asserts every class token appears verbatim in non-test
      source, because `globals.css` sets `source(none)` and the scanner cannot read a composed name. A severity
      tint per section is the obvious thing to reach for and it must be a closed record of literals, exactly as
      `TREATMENT_CLASS` is (`canvas/treatments.ts:29`). Add the new tree to that sweep's roots.

- [ ] **Step 4: green, then commit** `"Show the three ways a plan can contradict itself"`.

### Task 15: create, and delete

**Files:**
- Create: `apps/macroplan/components/plan/drawer/create-controls.tsx`, `delete-control.tsx`, and a test each

- [ ] **Step 1: new things append after the last sibling, and there is no placement control on create.** Spec §6:
      "a new item after the last item in its feature, a new feature after the last feature on its epic's rail.
      Work is usually added in the order it will be done, so the common case requires no placement at all." So the
      create payloads carry a parent and a name and nothing else, and the position is the server's.

- [ ] **Step 2: delete uses the existing confirm dialog and says the truth about undo.**
      `@repo/ui/shell/confirm-dialog` exists, takes `danger?: boolean`, and — the part worth knowing — when
      `danger` is set it moves focus to the dialog body rather than the confirm button, **so Enter cannot delete**
      (`packages/ui/src/shell/confirm-dialog.tsx:33-42,58`). Use it with `danger`.

      The message must name what goes with it, following the four existing ones in this repository verbatim in
      shape — `'All of its folders, tasks, tabs, content and share links are deleted. This cannot be undone.'`
      Deleting an epic re-rails or removes every feature on it and deleting a feature takes its items; the domain's
      `withoutEpic` and `withoutFeatures` do the cascade and nothing is written aside for recovery. **Say "this
      cannot be undone", because it cannot** — Task 16's undo covers a move and not a delete, and a message that
      implied otherwise would be the worst kind of wrong.

- [ ] **Step 3: a delete answers the whole plan, and the drawer it was opened from is gone.** Navigate back to the
      plan's no-selection page on success. A drawer left open over a deleted feature would then 404 on its next
      read, which is a worse answer than the one the user asked for.

- [ ] **Step 4: green, then commit** `"Append after the last sibling, and delete with the truth in the dialog"`.

### Task 16: drag, undo, and the first client boundary in the canvas

**Files:**
- Create: `apps/macroplan/components/plan/canvas/drag-root.tsx`, `drag-ghost.tsx`, `selection.ts`, and a test each
- Modify: `apps/macroplan/components/plan/canvas/plan-canvas.tsx`,
  `apps/macroplan/components/plan/module-boundaries.test.tsx`

This is the largest task in the phase and the one with the most ways to go wrong. Read header decisions 5, 6, 9
and 10 before starting.

- [ ] **Step 1: one client component, wrapping the server-rendered SVG as `children`.** Not a client canvas, not a
      client component per bar, and **not a transparent sheet over the bars** — phase 2 closed that last option in
      `canvas/feature-bar.tsx:48-50`: a sheet "would swallow the drag and the click it adds". `drag-root.tsx`
      listens on itself, and every bar and mark already carries `data-feature-id` / `data-item-id` and
      `data-slot` from phase 2, so what was hit is resolved with `closest('[data-slot="feature-bar"]')`. No bar
      becomes a client component, no per-bar props enter the Flight payload, and `item-mark.tsx:22-27`'s
      one-element-per-item budget is untouched.

- [ ] **Step 2: the maths is Task 5's, and the component converts exactly one thing — but that conversion is where
      this phase's likeliest defect lives.** A pointer event becomes one `{x, y}` in the SVG's coordinate space, and
      `dropTargetFor` answers the rest. Nothing in this component computes a position, a rail or a day.

      **Both coordinates carry a contract, and a raw pointer value is wrong for each.** `DropQuery` wants the
      position the dragged **bar** landed at, not where the pointer is:

      - `x` is `pointerX - (pointerDownX - bar.x)`. Pass the raw pointer x and "dropped back on its own x changes
        nothing" fails by the grab offset — at `CANVAS_SCALE`'s 14 px/day, grabbing a five-day bar near its right
        end and releasing without moving shifts the value by 70px, five days, which on a dense rail is past two
        bars.
      - `y` is `pointerY - (pointerDownY - railTop(start)) + railHeight / 2` — the y at which the bar's
        **band-relative centre** landed. The half-band term is not a fudge: it is what makes the rail handoff
        symmetric at half a band each way. Without it the handoff is one pixel upward and a full band downward,
        because `railAtY` claims a band from its top, so a bar nudged up by a single pixel would change rails.

      Neither can be checked by measuring, since `happy-dom` returns a zero `DOMRect` — but both are arithmetic, so
      **both are testable without measuring anything**: assert that the x handed to `dropTargetFor` equals the bar's
      own `x` attribute plus the pointer delta, and that a bar nudged up by `railHeight / 2 - 1` still answers its
      own rail while `railHeight / 2` down answers the next one. That is ADR 0055's rule and it is also the only way any of this is
      testable: `happy-dom` answers `getBoundingClientRect` with a zero `DOMRect` and `getCTM` with an identity
      matrix, so a component that did the arithmetic would be tested against zeroes that always agree.

      **Which means the one line that converts screen coordinates to SVG coordinates cannot be tested here at
      all.** Say so in the TSDoc, keep it to one line, and put it where a browser check can find it — this is the
      single highest-value item on the browser-verification list this phase hands forward.

- [ ] **Step 3: the preview re-runs the whole forward pass rather than patching a span.** Spec §3.4 ends on the
      sentence written for this task: the pass is `O(n·(n+e))` over features, "at this product's own caps … on the
      order of 10^5 operations and sub-millisecond, which is what lets phase 3 re-run the whole pass per pointer
      move rather than patch a span." So a drag in progress builds the plan as it would be, calls `schedule()`,
      and draws the ghost from the result. Do not hand-patch offsets: a patched span and a derived one disagreeing
      is the class of bug ADR 0048 exists to prevent.

- [ ] **Step 4: undo is a compensating placement, one step deep.** Read the feature's `(epicId, position)` from
      the plan **before** the drop, and keep it. On undo, send the same `place` call with those values. It is one
      step, it is cleared by any other write, and it is not a history — a stack would need every write to be
      invertible and a delete is not.

      Offer it where the user is looking, which is the canvas, and follow the repo's notice idiom
      (`apps/microtask/components/tabs/use-notice.ts:34-42`, `Notice { tone: 'error' | 'done'; text }`) rather
      than mounting the never-used `sonner` Toaster for one affordance.

- [ ] **Step 5: this is the phase gate's second half — "a test asserts nothing auto-moves".** Assert it as a
      property, over a real placement against the fake API: after moving one feature, **every other feature's
      `position`, `railOrder` and `pinSprint` is byte-for-byte what it was**. Spans change — that is derivation,
      and spec §3.4 says the schedule is derived on read and never stored — but nothing the user did not move has
      moved. Spec §8 records auto-scheduling and a constraint solver as **rejected**: "Validation only. Dates are
      derived, never repaired." A solver that silently moved an executive's committed plan is named in §6 as a
      worse failure than a visible contradiction, and this test is what keeps that true.

      Also assert the no-op: dropping a feature back where it started sends **no request at all**. The oracle is
      **the answer `dropTargetFor` gives for the bar's own x** — compare the placement you are about to send with
      that, and send nothing when they agree. Do **not** compare against `feature.position` directly, and do not
      look for a bar index or a `positionForDrop`: neither exists, and an earlier draft of this step named both.
      `dropTargetFor`'s `position` is already the stored position, and getting a no-op right in the presence of
      hidden siblings is what Task 5b and its three follow-up fixes were about.

- [ ] **Step 5b: pin the forward and inverse rail arithmetic against each other.** `railTop(index)` in
      `apps/macroplan/components/plan/canvas/view.ts` decides where rail *n* is drawn; `railAtY` in `@repo/canvas`
      decides which rail a `y` is in. They are the two directions of one number and they live in different
      packages, which is the residual hazard Task 5 accepted when it chose to pass `RailMetrics` in rather than
      move the metrics into the package. Only a test that calls both can catch them disagreeing, and it can only
      live here, in the app that owns `LAYOUT`:

```ts
expect(railAtY(railTop(i) + 1, rails, LAYOUT)).toBe(rails[i])
```

      Assert it for every rail index a fixture has, and for the first pixel of each band rather than its middle,
      because an off-by-one in either direction shows up at the edge and nowhere else.

      **Then make the subset relation a compile error rather than a coincidence.** `LAYOUT` satisfies
      `@repo/canvas`'s `RailMetrics` structurally — all `readonly` numbers, and passing the identifier rather than a
      fresh literal means no excess-property check — so `dropTargetFor(…, LAYOUT)` compiles today by hand-maintained
      luck. Write it `export const LAYOUT = { … } as const satisfies RailMetrics`. Then renaming a field in either
      package is a compile error here instead of a surprise at the call site, which is what Task 5 accepted as the
      residual cost of passing the metrics in rather than moving them.

- [ ] **Step 5c: the drop refuses a gutter only on a canvas that starts at day 0, and this is where that stops
      being true.** `dropTargetFor` refuses a point whose x names a day before **day 0**. `view.ts`'s `gutterX`
      exists precisely because "a viewport scrolled to day 40 has its gutter at `dayToX(40) - 160`", so on a panned
      canvas the label gutter sits over positive days and a drop on a rail's **name** would be accepted as a drop on
      the axis at position 0. It cannot fire today because `CANVAS_RANGE` is `{fromDay: 0, toDay: 60}` and nothing
      pans — but this task is the first to send a placement from a pointer, so either pass the `DayRange` into the
      drop query and refuse below `range.fromDay`, or assert in a test that the canvas does not pan and say that the
      refusal is a precondition rather than a property. **Do not leave it as a hedge in a TSDoc**, which is what it
      is now: a component will be the thing that violates it.

- [ ] **Step 6: extend the use-client allowlist with this task's client files.** **Task 11 already converted the
      sweep**, because it adds the first `'use client'` file under `components/plan/**` and this step was wrong
      about which task gets there first — see Task 11 Step 3b. So this step no longer converts anything: it adds
      `drag-root.tsx` and `drag-ghost.tsx` (and nothing else) to the existing allowlist, and confirms the
      accompanying assertion still holds of them — **no client file under `components/plan/**` receives a share
      token or a whole plan**, which for a delegation root wrapping the server-rendered SVG means it receives
      `children` and metrics and never the plan.

      If the allowlist somehow does not exist when this task opens — because Task 11 shipped no client file after
      all — then do the conversion here as originally written, and say why it landed late.

- [ ] **Step 7: keyboard reorder, because a pointer-only reorder is unreachable and untestable.** There is no a11y
      tooling in this repository (ADR 0056 records that as the reason its assertions are role-based), `happy-dom`
      cannot drive a real drag, and a control that exists only under a pointer is a control a keyboard user does
      not have. Microtask's answer is two menu items, `Move up` / `Move down`, disabled at the ends
      (`apps/microtask/components/task-tree/task-menu.tsx:19-33`), computed by a shared pure helper so "the tree
      and the strip cannot disagree about what a step is". Do the same here, from the drawer, over the same
      `place` action. **This is what the tests drive**; the pointer path is the same action reached another way.

      **The drawer's epic control belongs here too**, and it is the other half of the same action. Spec §6 lists
      `epic` among the drawer's fields and says a drag "moves a feature to another rail" — both are
      `place(planId, featureId, {epicId, position})` with a different `epicId`, so the drawer gets a select over
      this plan's epics and the drag gets the rail under the pointer. One action, two ways in, and a feature moved
      between rails keeps its position in the list it lands in exactly as a drop does. An item's drawer gets the
      same control over its **feature**, since `ItemPlacementPayload` is `{featureId, position}`.

- [ ] **Step 8: the gate, then commit** `"Move a bar by hand, put it back, and move nothing else"`, and push.

### Task 17: the share manager

**Files:**
- Create: `apps/macroplan/components/plan/share/share-manager.tsx`, `use-plan-seats.ts`, and a test each
- Create: `apps/macroplan/actions/plan-share-links.ts` and its test
- Modify: `apps/macroplan/components/plan/plan-screen.tsx`

- [ ] **Step 1: read `apps/microtask/components/share-manager/` first and follow it.** It is the same product
      decision twice — ADR 0035's rename and re-role, ADR 0010's revocation cascade, ADR 0037's URL shape — and
      spec §7.1 is explicit that "the machinery already exists and is not rebuilt". `use-share-links.ts` is the
      hook to mirror: **load on open, forget on close, and a `generation` ref to drop a late answer**
      (`use-share-links.ts:55,64-81`).

- [ ] **Step 2: tokens are fetched when the manager opens and are never a prop.** This is the phase's sharpest
      security line and phase 2 already paid for it once: the admin plan page handed `shareLinks` to `PlanScreen`
      and ADR 0033's *rejected alternative* forbids relying on the server-only boundary to keep them out of the
      client. `PlanScreenModel` now makes it a compile error (`shareLinks?: never`), and `PlanCanvas` and
      `PlanTable` narrowed to it in Task 9. A client component's props land in the Flight payload and therefore in
      the HTML, so the manager asks for the seats through an action after it is open, exactly as Microtask's does.

- [ ] **Step 3: there is no list route, and that is not a gap to fill.** A plan's seats arrive inside
      `PlanView.shareLinks`, gated server-side by `can(principal, 'share:read', {kind:'plan', planId})`
      (`packages/macroplan-domain/src/views/plan-view.ts:141`). So the action re-reads the plan and returns the
      seats it was given; it does not call a seats endpoint, because `POST`, `PATCH` and `DELETE` are the only
      three that exist (`apps/api/src/routes/macroplan/share-links/routes.ts:18-21` says so).

- [ ] **Step 4: three facts about these routes that a reader will get wrong.**
      - **An empty `PATCH` body is a well-formed no-op 200.** `UpdateShareLinkPayload` is Microtask's schema
        reused, and unlike every plan `Update*Payload` it carries **no non-empty refinement**. Do not rely on the
        server to refuse an empty edit; refuse it in the form.
      - **Revoke answers 204 and the revoked lineage is discarded by the route.** The service computes the whole
        `createdBy` cascade and the handler drops it (`share-links/handlers.ts:96`); Macroplan deliberately has no
        `RevokedShareLinks` contract where Microtask does. So the manager cannot report "and these three
        descendants went with it" — the confirm dialog must warn **before** the write that revoking a link revokes
        everything minted through it (ADR 0010), because afterwards there is nothing to show.
      - **`share:create` is gated on the scope being minted, not the plan in the path**
        (`share-links/handlers.ts:47-48`), which is why `planCapabilities` reads that one off the capability record
        and the other three through `mayReach`. Task 9 built that; use it and do not re-derive.

- [ ] **Step 5: the URL, not the token.** Follow ADR 0037's shape and
      `apps/microtask/components/link/copy.ts` for putting it on the clipboard. A token on screen without its URL
      is a credential a user will paste somewhere it does not belong.

- [ ] **Step 6: green, then commit** `"Mint, rename, re-role and revoke a plan's seats, tokens fetched on open"`.

---

# Group E — the record

### Task 18: four ADRs, the amendments, one API declaration, and the audit

**Files:**
- Create: `docs/adr/0057-the-drawer-is-a-route.md`, `0058-one-delegation-root-over-a-server-rendered-canvas.md`,
  `0059-undo-is-a-compensating-placement.md`, `0060-a-cycle-is-named-before-the-write.md`
- Modify: `docs/adr/0055-canvas-geometry-is-its-own-pure-package.md`, `docs/adr/README.md`
- Modify: `apps/api/src/routes/macroplan/share-links/routes.ts`
- Modify: `docs/superpowers/specs/2026-09-22-macroplan-design.md` (§11 table)

Read three existing ADRs before writing any of these. The house form is `# ADR 00NN — <a decision as a sentence>`,
`**Status:** Accepted · <date>`, then Context / Decision / Consequences / Alternatives considered, 90–200 lines,
full prose paragraphs, every rejected alternative given its real reason. **0052 stays reserved** for the phase-4
bridge; do not renumber into it.

- [ ] **Step 1: ADR 0057 — the drawer is a route.** Why selection is a URL and not client state: the canvas lives
      in the layout so 2 000 nodes are not re-rendered per selection, a selection is a link somebody can send, and
      the plan's whole shape never enters a client component's props for the sake of a panel showing one feature.
      Record the cost honestly — a soft navigation per selection — and record **per-field saving as a consequence
      of the same decision**: `PATCH .../features/{id}` authorises per field, `feature:estimate` is `write` while
      `feature:pin` is `manage`, and a combined body refuses wholesale for the exact user the `write` role exists
      for.

- [ ] **Step 2: ADR 0058 — one delegation root over a server-rendered canvas.** The three options and why two
      lost: a client component per bar (2 000 of them in the Flight payload), a transparent sheet over the bars
      (phase 2 refused it in `feature-bar.tsx:48-50` — it swallows the drag and the click), and one root that
      takes the server-rendered SVG as `children` and delegates by `data-*`. Record that phase 2 left the
      attributes there for this, and record the consequence that the screen-to-SVG coordinate conversion is the
      one line in the phase no test in this repository can cover.

- [ ] **Step 3: ADR 0059 — undo is a compensating placement, and a delete has none.** Spec §6 promises undo for
      destructive drags. Record that there was nothing to copy — no journal, no soft delete, no tombstone, no
      restore route anywhere in this repository — that a placement's inverse is exactly expressible and a
      delete's is not (a new id, no items, no description, no incoming edges), and that the four existing confirm
      dialogs already tell users a delete cannot be undone. The rejected alternatives are a command journal and a
      soft delete, each with its real cost: a journal needs every write invertible, and a soft delete changes
      every read in the domain.

- [ ] **Step 4: ADR 0060 — a cycle is named before the write, and the API stays the authority.** The problem is
      that `lib/refusal.ts` answers every 409 with "Someone else changed this at the same time", which for a cycle
      is false rather than vague. Record the three options — let the API's `detail` through for one status, change
      the generic sentence, or detect locally — and why local detection wins: `findCycles` is already exported and
      already browser-bundled, the client already holds the graph, and detecting locally leaves
      `lib/problem.ts`'s rule intact **and makes the generic sentence true**. State the rule it inherits: a
      client-side check is a message, never a gate.

      **Be precise about "true", because it has two cases and naming only one would make the ADR false.** The
      domain refuses **any** cycle in the graph it is about to save, not only one the caller introduced
      (`packages/macroplan-domain/src/services/feature-service.ts:81-86`). So a 409 is reachable from a concurrent
      edit *and* from a cycle that arrived some other way — a hand-edited volume, which spec §6 contemplates by
      name. Both mean the same thing, which is that this page's copy of the plan is not the server's, and that is
      what "Someone else changed this at the same time. Reload the page and try again." says. The client check
      catches both whenever its own copy is current, because Task 13 runs `findCycles` over the whole resulting
      graph rather than over the one edge.

- [ ] **Step 5: amend ADR 0055.** It was written for layout geometry. `drag.ts` adds a second kind of pure
      function — an inverse projection, a point to a target — and the ADR's argument covers it exactly, including
      the `happy-dom` consequence. Say so, and correct anything phase 3 falsified.

- [ ] **Step 5b: close the one authorisation gap this phase found, which is a real one.**
      `POST /plans/{planId}/features` runs exactly one gate — `feature:create`, a **`write`** action — and
      `CreateFeaturePayload` accepts `pinSprint`, whose own action `feature:pin` is **`manage`**
      (`apps/api/src/routes/macroplan/features/handlers.ts`, `packages/contracts/src/structure-payloads.ts`,
      `packages/kernel/src/access/policy.ts`). So a `write` seat can create a feature **already pinned to a
      sprint**, and then be refused `pinFeature` on that same feature a second later.

      That contradicts spec §7.1's own principle — "**`write` changes what the work is and what it costs; `manage`
      changes where it sits and what the plan is**" — and §3.1 calls a pin "the *only* way a fixed point in time
      enters the model", which is exactly the authority §7.1 reserves to the executive who owns the timeline. It is
      not a hole this phase opened; it has been there since phase 1, and no UI could reach it until this phase.

      The fix mirrors what `updateFeature` in the same file already does for the same field: when the draft carries
      a `pinSprint` that is not `null`, ask `feature:pin` as well. Two lines, one existing pattern, and it makes
      the create route agree with the edit route about who may fix a date. **Assert it by name** — a `write` seat
      creating a pinned feature is refused, and creating an unpinned one is not — because this is the class of
      thing `capabilities()` agreeing with `can()` is supposed to guarantee and does not, the target being
      per-resource rather than a collection.

      Together with the 409 declaration below this makes **two** changes to `apps/api` in the phase, against the
      "no task touches `apps/api`" claim in this plan's header. Correct the header rather than leaving it, and say
      why each exception earned itself.

- [ ] **Step 5c: amend spec §7.1's table, which is narrower than the policy it describes.** The table gives `write`
      "create and rename features and items, and set their estimates". `GRANTS` also holds **`item:describe`** in
      `WRITE` (`packages/kernel/src/access/policy.ts`), so a `write` seat may write an item's description and the
      table does not say so. Task 8 found it by checking the grant instead of trusting the prose.

      **The grant is right and the table is incomplete** — do not "fix" this in `policy.ts`. §7.1's own principle is
      that "`write` changes what the work is and what it costs", and a description is what the work is; it is also
      the one field §3 caps and sanitises rather than refuses, which is a `write`-shaped decision. Add it to the
      table, and check the rest of that row against `GRANTS` in the same pass rather than only this one entry: the
      table is prose and the record is the gate, so anywhere they disagree the table is what changes.

- [ ] **Step 6: declare the 409 the three plan share-link routes can already answer.** They all write through
      `PlanShareLinkService.#save` → `ShareIndex.add`, which throws `Conflict` on a cross-container token
      collision, and `errorHandler` passes an `AppError`'s status through untouched — but each route declares only
      `problemResponses()`, so `openapi.json` says a 409 cannot happen there. Add `problemResponses([409])` to all
      three, exactly as `PUT .../dependencies` does. This is the only change to `apps/api` in the phase; if the
      generated `openapi.json` is checked in, regenerate it in the same commit.

- [ ] **Step 7: the audit.** Each of these found something in an earlier phase; run them all and report a verdict
      per item, never a count.
      - **7a:** the cold gate — delete `apps/*/.next`, then the full `--force` run, green with `Cached: 0`.
      - **7b:** `node scripts/check-exports.mjs` exits 0.
      - **7c:** every `ADR 00NN` citation in every new and changed file — **open each ADR and confirm it makes the
        claim attributed to it.** Five of phase 1's eight mis-citations came from a number someone repeated
        without opening the file, and three pointed at ADRs that exist, so a resolve-check passes and the reader is
        misled anyway.
      - **7d:** `grep -rn "getBoundingClientRect\|getBBox\|getScreenCTM\|getCTM" apps/macroplan packages/canvas`
        — every hit is in the one documented line from Task 16 step 2, or in a test that stubs it. Any other hit
        is a measurement silently reading zero.
      - **7e:** no class name under `apps/macroplan/components/**` is built by interpolation or concatenation, and
        every new component tree is in the sweep's roots.
      - **7f:** `apps/macroplan/vitest.projects.test.ts` passes, every new test file is claimed by exactly one
        lane, and no directory glob has appeared in `vitest.config.ts`. A file matching no project does not fail —
        it silently never runs.
      - **7g:** the phase gate in the spec's own words — **cycle refusal pinned by test** (Task 13) and **a test
        asserts nothing auto-moves** (Task 16 step 5). Name the test file and the test for each.
      - **7h:** **either** both leak sweeps read a bound function's arguments and the seat surface's stated KNOWN
        GAP is gone from `app/s/[token]/page.test.tsx`, **or** no shipped file binds a server action at all and
        every surface asserts it hands over no function — with a planted bound action proving that zero can fail.

        This item was written as the first form only. Task 10 satisfied the second and was right to: nothing needed
        binding, so widening a walker for a case no code reaches would have been ceremony, and Step 5 authorised
        exactly that outcome — "a sweep that stays green for a stated reason is a better outcome than a widened
        one." What it added instead is worth more than the widening would have been: the sweep **moved** with the
        read, because one left on a page that reads no plan passes by having nothing to look at.

        So audit the disjunction, not the first branch. If any task after 10 bound something, the first form is
        owed and the gap must be gone. If none did, confirm all three surfaces assert zero, each with its plant,
        and that the KNOWN GAP comment still describes the code it sits in — it is a live instruction to whoever
        binds the first action, not a defect to clear.
      - **7i:** `apps/macroplan/eslint.config.js`'s allowlist is **unchanged** — six packages. This phase adds no
        dependency, and a drag or form library appearing there is a decision this plan did not take.
      - **7j:** no `'use client'` file anywhere in `apps/macroplan` imports `@repo/api-client` for a value. A
        client component that constructed a client would need a credential in the browser.
      - **7k:** the Macroplan client's **exact key set is asserted in two places** —
        `packages/api-client/src/macroplan-clients.test.ts` and `apps/macroplan/lib/api.test.ts` — and the second
        one went red at Group A's first commit and stayed red for three, because each task ran only its own
        package's tests. Both are correct now. Decide whether the app's copy should keep enumerating keys at all:
        what it is really asserting is *"this client reaches this product's routes and no Microtask route"*, and a
        test of that property would not need editing every time the surface grows. Phase 4's bridge methods break
        the enumerated version again. Either rewrite it as the property or record why the list is worth the
        maintenance, and in the same step confirm no third copy exists.
      - **7l:** every control on `PlanControls` has a call site, and **every member of `PlanEditActions` has a
        control**. These are two different sweeps and neither is a type error: a boolean nothing reads is dead
        weight, and an action no control can reach is a write the product cannot perform. Task 9's first draft
        omitted the two epic controls that Task 7 had already shipped actions for, which is exactly this failure.
        Enumerate both directions and name any survivor with the reason it survives.
      - **7m:** `apps/macroplan/components/plan/admin-actions.test.ts` is scope neither Task 7's steps nor the file
        inventory asked for — Task 7's spec review flagged it and I kept it. Confirm it still earns that: it asserts
        each member's function `.name` equals its key, which is the one wiring error the compiler is blind to,
        because `renameFeature` and `renameItem` have identical signatures and swapping them typechecks. If Task 8's
        seat mirror binds its token, that sweep cannot work unchanged there — a bound function's `.name` is
        `"bound renameFeature"`. Say how the seat side is checked, or why it needs no check.
      - **7n:** `apps/macroplan/lib/admin-controls.ts` keeps a hand-written literal naming all twenty-two controls,
        policed by a mapped type. **Microtask keeps no such literal** — `components/task-tree/controls.ts` derives
        its admin answer by pushing an all-true record through the same projection its seat answer goes through, so
        there is one list of names in that app and drift is impossible rather than merely a type error. Task 9's
        quality review judged our version the weaker of the two and it is right.

        The blocker is real and is one export: `@repo/contracts` publishes no all-true `Capabilities`, and this app
        cannot build one without a type assertion. Adding `ALL_CAPABILITIES` beside `CAPABILITY_ACTIONS` — where an
        assertion already lives, behind a contract boundary — lets `planCapabilities` and `ADMIN_CONTROLS` both come
        out of one `planControls(can, seats)` projection, deleting the literal and the mapped type together. Deferred
        out of Task 9 deliberately: it changes a package every app and the API load from `dist/`, so it needs its own
        commit and a full gate rather than riding along in a UI task. Decide it here — do it, or record why the
        second literal is worth keeping.

- [ ] **Step 8: update spec §11's table** with 0057–0060, leave 0052 reserved, and add the four to
      `docs/adr/README.md`.

- [ ] **Step 9: commit** `"Record the four decisions phase 3 took"` and push the feature branch. **Never `main`** —
      Coolify deploys it (ADR 0022).

---

## Verification targets, and where each is met

| Spec §9 phase-3 deliverable | Met by |
| --- | --- |
| drawer | Task 10 (the route), Tasks 11–12 (the fields) |
| create / rename / delete | Task 15 (create, delete), Task 11 (rename) |
| estimates | Task 11 step 2, with the null-versus-zero distinction asserted |
| pins | Task 12 step 1 |
| reorder | Task 16 — drag in step 1, keyboard in step 7, one `place` action behind both |
| edges | Task 13, over `PUT .../dependencies` as a whole-list write |
| conflict list | Task 6 (the rows), Task 14 (the rendering) |
| undo | Task 16 step 4, scoped by ADR 0059 to a move |
| the share manager | Task 17 |
| **gate:** cycle refusal pinned by test | Task 13 step 1, asserted against the server's own two rules |
| **gate:** a test asserts nothing auto-moves | Task 16 step 5 |

## What phase 3 does not ship

- **The bridge, and everything that needs progress.** `epic:bind` and `item:link` are in `ACTIONS` and in
  `ACTION_DECISIONS` with **no route, no payload and no service method** — recorded as `PENDING_ROUTES`. The
  drawer's "linked task" and "progress readout" from spec §6 therefore have no data in this phase. Do not build a
  placeholder that reads a field nothing writes; phase 4 adds both, and ADR 0052 is reserved for it.
- **The two treatments that need progress.** *Done* and *carry-over* stay unshipped, and `Treatment` is **widened**
  in phase 4 rather than re-pointed: `'solid'` currently means *placed*, and re-aiming it at *done* would make
  every phase-2 and phase-3 reading of the canvas false.
- **A rung control.** Detail is derived from the time scale and never controlled separately (spec §5), and
  `CANVAS_RANGE` is a fixed 60 working days for the reason `canvas/view.ts:5-24` gives — widening it silently
  empties the canvas, because `rungFor` answers `'epic'` above 60 days and the epic rung draws no bars.
- **Plan create and delete as UI.** Task 4 adds the client methods because the surface is assembled once; the plan
  list grows no create button and no delete in this phase. `workspace:create-plan` is admin-only and the plan list
  is one page — it is a small task, and it is not in spec §9's phase-3 row.
- **Dependency editing anywhere but a feature.** Spec §3.1 and §8: edges exist at the feature level, and
  cross-plan dependencies are rejected.
- **A second editor.** Anything longer than a note opens the linked Microtask task (spec §6). One plain-text
  description, capped and sanitised at the boundary, and no tabs and no rich text.



