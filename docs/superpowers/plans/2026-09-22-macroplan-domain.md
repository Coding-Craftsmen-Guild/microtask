# Macroplan phase 1 — domain and API implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute
> this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the whole of Macroplan's timeline model below the UI — the wire schemas, the pure
scheduling engine, the storage domain, and `/v1/macroplan/plans/**` — so that phase 2 can draw a
canvas over interfaces that are already real.

**Architecture:** A plan's entire structure lives in one `plan.json` manifest and one small file per
item's description (ADR 0005). The schedule is **derived on every read and never stored** (spec §3.4)
by `@repo/schedule`, a new package with no dependencies at all, so the API and — from phase 2 — the
browser run the same forward pass. Routes hang under the existing service-key and principal guards
(ADR 0013). A plan is shared at **plan scope** through the share-link system that already exists
(spec §7.1) — one new `Scope` variant, one widened action set, and **one token index serving both
products** rather than one each. What keeps a Microtask token out of a plan is the scope check, not a
blanket admin-only rule: ids are per-product, so a `manage` token scoped to project `X` must be
refused on plan `X`, and that refusal is a named test.

**Tech stack:** TypeScript 5.9, Zod 4.6 (`@repo/contracts` only), Hono 4.13 + `@hono/zod-openapi`
1.6, vitest 5. No UI, no React, no new runtime dependency anywhere.

---

## Why this plan does not dictate code

Carried from [the Microtask app plan](2026-09-11-microtask-app.md): the generation of plans that
dictated implementation line by line shipped a live XSS hole, a byte cap measured in UTF-16 units and
a parity check that walked the wrong object — all of it past two clean review gates, because the
reviewers were reading the plan's own code back to themselves.

So this plan fixes **interfaces, decisions and acceptance criteria**, and names the behaviour each
test must pin. Type signatures, schema shapes, route paths, limit values and algorithms are stated
exactly, because they are load-bearing. Function bodies are not, and the tests judge them.

---

## Binding constraints

| Rule | Source |
| --- | --- |
| Every task ends with `npx turbo run build typecheck lint test --force` green and `Cached: 0`. Without `--force`, turbo reports `FULL TURBO` and a clean run proves nothing | plan convention |
| Delete `.next` before a **repeat** `--force` run, or the second build fails with a bogus `EPERM` symlink error | measured |
| `apps/api` loads `@repo/*` from `dist/`. A change to a package's `src` is invisible to the API suite until that package is rebuilt | ADR 0026 |
| Files cap at 150 lines (`.tsx` at 80), functions at 50, complexity at 10, params at 4, depth at 3 | ADR 0027 |
| TSDoc only. No other comments, no file-level `eslint-disable` | ADR 0027 |
| TSDoc goes on **exported** declarations only — `local/tsdoc-comments-only` rejects it on a private helper, and directs rationale to `docs/adr/` or to a test's name instead. Put the reasoning in the exported block above, and let helpers speak through their names | measured: 8 lint errors in Task 7 |
| Shared code must not import a `*-domain` package — spread `noProductImports` into every new package's `eslint.config.js` | ADR 0014 |
| `@repo/schedule` is imported by apps, so it must never reach a node builtin, directly or transitively | ADR 0001, 0027 |
| Every read-modify-write runs inside `lock.run`; `Lock` is not reentrant, so a method holding it calls only helpers that do not take it | ADR 0006, 0030 |
| A write that touches a file and the manifest writes the **file first**; a delete writes the **manifest first** | ADR 0006 |
| Use `pnpm`, never `npm install` at the root — a `package-lock.json` is forbidden and gitignored | ADR 0026 |
| Never merge or push `main`; the feature branch only | ADR 0022 |

---

## What phase 1 does not ship

Stated so a reviewer does not read an absence as an omission.

- **No UI.** `apps/macroplan` is untouched. Its dashboard stays empty until phase 2.
- **No `@repo/api-client` surface.** `createSurface` is `MicrotaskApi`; a `MacroplanApi` is phase 2's
  first task, when there is a caller for it.
- **No bridge.** `PlanEpic.binding` and `PlanItem.linkedTaskId` are **reserved in the model and
  always `null`** — spec §9 requires phase 4 to add behaviour rather than a migration. A test asserts
  no phase-1 route can set either.
- **No deploy change.** Compose already carries `MACROPLAN_API_KEY` and `SERVICE_KEYS` already reads
  `macroplan=…` (shell design §5). Nothing here touches the Dockerfile, compose, or the cutover.
- **No `/s/[token]` surface.** Phase 1 serves share links over the API and mints them; the landing
  page a holder actually opens is phase 2, and the share manager that mints them from a screen is
  phase 3. Until then a link is minted by an API call and pasted by hand.
- **No epic-scoped links.** `Scope` gains `{kind:'plan'}` and nothing else (spec §7.1). Because
  `Scope` is a discriminated union this is additive later — no migration, no token invalidated.
- **No bridge role composition.** `effectiveBridgeRole` (spec §7.3) is phase 4 behaviour. Phase 1
  decides the actions and scopes it will compose over, and asserts `epic:bind` is admin-only so a
  link holder can never raise their own ceiling.

---

## File structure

```
packages/kernel/src/
  storage/contained.ts          MOVED here from microtask-domain; both domains build paths
  access/action.ts              + 24 macroplan actions
  access/scope.ts               + { kind: 'plan', planId }
  access/target.ts              + plan · epic · feature · item, each carrying planId alone
  access/policy.ts              grants widened; inScope rewritten scope-first;
                                3 join ADMIN_ONLY_ACTIONS (2 collections + epic:bind)
  access/token-index.ts         MOVED from microtask-domain, keyed { product, containerId }
  access/share-index.ts         MOVED from microtask-domain, now indexing plain tokens

packages/contracts/src/
  limits.ts                     + 6 collection caps, + 3 value caps
  share-link.ts                 Scope gains the plan variant
  capabilities.ts               ROWS gains 24; CapabilityTarget gains 4
  plan.ts                       IsoDate · Timezone · EstimateDays · EpicBinding
                                PlanEpic · PlanFeature · PlanItem · PlanManifest · ItemDocument
  schedule-view.ts              the wire form of a ScheduleResult
  plan-payloads.ts              every request body under /v1/macroplan
  plan-views.ts                 PlanView · PlanListItem · PlanList · ItemView
  index.ts                      exports all of the above

packages/schedule/              NEW. No dependencies. Never reaches a node builtin.
  src/structure.ts              PlanCalendar · PlanStructure · ScheduleEpic/Feature/Item
                                Span · Cycle · Unscheduled · ScheduleResult · Breakdown
  src/calendar.ts               isWorkingDay · dayToDate · dateToDay · todayIn
  src/sprints.ts                sprintOf · rangeOfSprint
  src/estimate.ts               effectiveEstimate · breakdown
  src/cycles.ts                 findCycles
  src/forward-pass.ts           schedule
  src/testing/arbitrary.ts      the seeded generator the property tests draw from
  src/index.ts                  the barrel

packages/macroplan-domain/src/
  entities/{plan,epic,feature,item,binding}.ts   the interfaces the store round-trips
  limits.ts                     assertWithin · cleanName · cleanDescription, over @repo/contracts
  ports/plan-store.ts           the PlanStore port and its write-ordering promises
  storage/paths.ts              plansDir · planDir · manifestFile · itemsDir · itemFile
  storage/fs-plan-store.ts      FsPlanStore
  services/context.ts           PlanContext
  services/refs.ts              PlanRef · ItemRef
  services/plan-service.ts      list · create · read · update · remove
  services/share-link-service.ts  create · update · revoke, with ADR 0010's cascade
  services/epic-service.ts      add · update · place · remove
  services/feature-service.ts   add · update · place · setDependencies · remove
  services/item-service.ts      add · update · place · remove · readOne · writeDescription
  services/positions.ts         dense renumbering, shared by the three placement methods
  views/plan-view.ts            planView · planListItem · itemView
  testing/{fixtures,memory-plan-store,plan-store-contract,index}.ts
  index.ts                      the barrel

apps/api/src/
  deps.ts                       + planStore
  runtime.ts                    + FsPlanStore; warmTokenIndex walks both stores
  auth/link-directory.ts        LinkDirectory + one adapter per product
  auth/principal-resolver.ts    takes a directory per product, indexed by owner.product
  routes/v1.ts                  + app.route('/macroplan', createMacroplan(deps))
  routes/macroplan/
    index.ts                    the product mount and its guard
    product.ts                  PRODUCT = 'macroplan'
    params.ts                   planParams · epicParams · featureParams · itemParams
                                planShareLinkParams
    plan-scoped.ts              mounted at /plans/:planId
    plans/{routes,handlers}.ts
    epics/{routes,handlers,app}.ts
    features/{routes,handlers,app}.ts
    items/{routes,handlers,app}.ts
    share-links/{routes,handlers,app}.ts
    shares/{routes,handlers}.ts   GET /shares/current, the bootstrap call
  testing/macroplan-harness.ts  the fixture plan, plus one token per role
```

---

## Decisions this plan makes that the spec left open

Each one is a place the spec is silent or admits two readings. They are listed together so a reviewer
can disagree with them in one place rather than hunting them through twenty-two tasks.

| Question | Decision | Why |
| --- | --- | --- |
| The spec's model nests Item inside Feature inside Epic. Store it nested? | **Flat.** `PlanManifest` holds three sibling arrays — `epics`, `features` (each with `epicId`), `items` (each with `featureId`) | It mirrors `ProjectManifest.tasks` with its `folderId`; the plan-wide caps (§4.3) are then directly expressible as `.max()` on the array they bound, where nesting makes every cap a per-parent bound plus a service check; and a move is a field change, not a splice in two places |
| §3 gives `railOrder` to Epic; §3.1 then says "`x.railOrder` makes 'previous sibling' well defined" of a **feature** | `PlanEpic.railOrder` is the **vertical** order of rails. `PlanFeature.position` is the order **along** a rail, `PlanItem.position` the order inside a feature. Both are dense and 0-based per parent | Two different orderings were being spelled with one word. `position` is the name Microtask already uses for exactly this |
| What is `end(x)` — inclusive or exclusive? | **Exclusive.** `end = start + effectiveEstimate`, so a zero-estimate milestone has `start === end` | The only reading under which §3's "a milestone occupies no time" and §3.1's arithmetic are the same statement |
| §3.2 says children win "when they exist". What if children exist but none is estimated? | Children win when **at least one child carries an estimate**; the sum is over estimated children only | Otherwise a freshly broken-down feature silently becomes a zero-day milestone the instant its first item is named |
| What happens to a feature that depends on a feature inside a cycle? | The edge is **ignored** and the dependent feature still schedules. Only features **in** the cycle are unscheduled | §4.1 requires `schedule` to be total and to render everything outside the cycle. Cascading would unschedule an arbitrary fraction of the plan for one bad edge |
| `unscheduled: readonly Id[]` — one list, two causes | Widened to `readonly Unscheduled[]`, each `{ id, reason: 'no-estimate' \| 'in-cycle' }` | §3.2's unscheduled rail and §6's conflict list are two different screens. One list of bare ids cannot feed both |
| Are there holidays? | **No.** Saturday and Sunday are the only non-working days, fixed | Nothing in the spec asks for a holiday calendar, and one needs a locale the product has no notion of |
| How many plans per product? | `plansPerProduct: 200` | §4.2 wants many plans and §4.3 caps everything else. 200 is deliberately below `projectsPerProduct: 500`: a plan is a year of an organisation, not a unit of work, and the plan list is one unpaginated read |
| §10 wants a "named problem code" for exceeding a cap | `invalid` (422), with a message naming the limit — the code `assertWithin` already produces | A new problem code for a refusal that is already `invalid` would give one failure two names depending on which product produced it |
| Property tests with no `fast-check` in the workspace | A seeded generator in `packages/schedule/src/testing/arbitrary.ts` | No new dependency, and a failing seed is printed so the case can be pinned as a literal regression test. The cost is no shrinking; state it in the file's TSDoc |
| One `QueueLock` for both products | Yes — a Macroplan write serialises behind a Microtask write | Every write in this API is already serial (ADR 0006), and a second lock would be a second place for the ordering rules to be got wrong |
| Are the kernel's `GRANTS` and `capabilities()`'s `ROWS` collapsed into one table? | **No.** Both gain the twenty-four actions, and the existing exhaustive agreement test is what keeps them identical | It is not a choice: `@repo/contracts` holds `@repo/kernel` as a **devDependency only**, so `node:crypto` never reaches a browser bundle, and neither package can import the other at runtime. The duplication is forced by the bundle boundary; the test — full cross product, enumerated from the kernel's own `ACTIONS` — is the consolidation |
| One `plan:write` action, or twenty-four fine-grained ones? | **Twenty-four.** An earlier draft of this plan collapsed them, on the reasoning that nothing sliced the set | A role slices it. The collapse was correct only while every action was admin-only, and it stopped being correct the moment a plan could be shared — which is exactly the kind of decision that cannot be revisited once tokens encoding a role are in clients' hands |
| Is `plan:retime` separate from `plan:rename`? | **Yes** | Changing `startDate` or `sprintLengthDays` moves every derived date on the canvas; a rename moves nothing. They do not belong at the same authority |
| Who may bind an epic to a Microtask project? | **The admin only.** `epic:bind` is in `ADMIN_ONLY_ACTIONS` | Spec §7.3 makes the binding's role the ceiling on everything a link holder reaches in Microtask. A holder who could re-role a binding could raise their own ceiling, and every bound in that section would be decoration |
| Does the token index move, or does Macroplan get its own? | **Moves to `@repo/kernel`, generalised to `{product, containerId}`** | A bearer is an opaque string: the index is what *tells* you which product owns it. Two indexes would mean asking both on every request, which is the drift that consolidating exists to prevent — and a token held by a project and a plan at once would be undetectable |
| Does `ShareLink` move to the kernel too? | **No.** The port indexes **strings** | `ShareIndex.add` already begins `manifest.shareLinks.map(l => l.token)`; lifting that one line to the caller makes the port a matter of strings and a `Product`, both already in the kernel. Zero type moves, and a 96-file refactor avoided |

---

# Group A — the shared vocabulary

### Task 1: `contained()` moves into `@repo/kernel`

Two domains are about to build filesystem paths from ids. The containment backstop must not exist
twice.

**Files:**
- Create: `packages/kernel/src/storage/contained.ts` (moved, content unchanged)
- Create: `packages/kernel/src/storage/contained.test.ts` (moved from the domain)
- Modify: `packages/kernel/src/index.ts` — `export { contained } from './storage/contained.js'`
- Delete: `packages/microtask-domain/src/storage/contained.ts` and `contained.test.ts`
- Modify: `packages/microtask-domain/src/storage/paths.ts` — import `contained` from `@repo/kernel`

- [ ] **Step 1: move the file and its test, unchanged.** The TSDoc travels with it; only the sentence
      naming ADR 0005 gains "and the plan directory ADR 0050 gives a plan".
- [ ] **Step 2: run the kernel suite.** `pnpm --filter @repo/kernel test` — the moved test passes
      where it now lives.
- [ ] **Step 3: rebuild the kernel, then run the domain suite.**
      `pnpm --filter @repo/kernel build && pnpm --filter @repo/microtask-domain test`
      Expected: the whole existing suite passes **unchanged**. That is the evidence this was a move.
- [ ] **Step 4: the gate.** `npx turbo run build typecheck lint test --force`, green, `Cached: 0`.
- [ ] **Step 5: commit.** `git commit -m "Move path containment to the kernel, for a second domain"`

### Task 2: the kernel learns about plans, and about who may reach one

The single most consequential task in the plan. A role is stored in every token a client holds, so
these grants are decided here or they are decided against links already issued (spec §10).

**Files:**
- Modify: `packages/kernel/src/access/action.ts`
- Modify: `packages/kernel/src/access/scope.ts`
- Modify: `packages/kernel/src/access/target.ts`
- Modify: `packages/kernel/src/access/policy.ts`
- Modify: `packages/kernel/src/access/policy.test.ts`

`Scope` gains one variant and **only** one (spec §7.1):

```ts
| { readonly kind: 'plan'; readonly planId: string }
```

`Target` gains four, so an action can be decided against the thing it actually touches:

```ts
| { readonly kind: 'plan'; readonly planId: string }
| { readonly kind: 'epic'; readonly planId: string }
| { readonly kind: 'feature'; readonly planId: string }
| { readonly kind: 'item'; readonly planId: string }
```

Only `planId` on each — a scope is plan-wide, so no rule can turn on an `epicId`, and a field no rule
reads is a field that will one day be compared wrongly.

`ACTIONS` gains twenty-four. An earlier draft of this plan had **one** `plan:write` covering every
mutation, on the reasoning that nothing sliced it. A role slices it, so it is un-collapsed:

```ts
'plan:read'
'plan:rename'          'plan:retime'          'plan:delete'
'epic:create'          'epic:rename'          'epic:delete'      'epic:reorder'
'epic:bind'
'feature:create'       'feature:rename'       'feature:estimate'
'feature:delete'       'feature:place'        'feature:depend'
'item:create'          'item:rename'          'item:estimate'    'item:describe'
'item:delete'          'item:place'           'item:link'
'workspace:list-plans' 'workspace:create-plan'
```

`plan:retime` is separate from `plan:rename` because changing `startDate` or `sprintLengthDays` moves
every derived date on the canvas while a rename moves nothing — one is a cosmetic edit and the other
reshapes the plan, and they do not belong at the same authority.

`share:read`, `share:create`, `share:revoke` and `share:update` are **reused unchanged**. They are not
Microtask's actions; they are the share system's, and `GRANTS` is keyed by role rather than by product,
so one entry serves both. What separates the products is the scope check, never the grant table.

The grants, per spec §7.1's table — appended to the existing `VIEW`, `WRITE` and `MANAGE` arrays,
which already compose (`WRITE = [...VIEW, …]`), so inheritance stays structural:

| Array | Gains |
| --- | --- |
| `VIEW` | `plan:read` |
| `WRITE` | `feature:create`, `feature:rename`, `feature:estimate`, `item:create`, `item:rename`, `item:estimate`, `item:describe`, `item:link` |
| `MANAGE` | `plan:rename`, `plan:retime`, `plan:delete`, `epic:create`, `epic:rename`, `epic:delete`, `epic:reorder`, `feature:delete`, `feature:place`, `feature:depend`, `item:delete`, `item:place` |

`ADMIN_ONLY_ACTIONS` gains **three**: `workspace:list-plans`, `workspace:create-plan`, and
`epic:bind`. The third is the load-bearing one. Spec §7.3 makes the epic's binding role the ceiling on
everything a link holder can reach in Microtask; a holder who could re-role a binding could raise
their own ceiling, and every sentence in that section would be decoration.

The scope rule, rewritten so it narrows explicitly rather than by elimination. Today
`withinProjectScope` reads `target.kind !== 'workspace' && target.projectId === scope.projectId`,
which does not compile once a target has no `projectId`. Replace it with a scope-first shape:

```
inScope(scope, action, target):
  scope.kind === 'plan'     -> target is one of plan|epic|feature|item AND target.planId === scope.planId
  scope.kind === 'project'  -> target is one of project|folder|task|tab AND target.projectId === scope.projectId
  scope.kind === 'task'     -> the project rule, plus the existing task narrowing
  a 'workspace' target      -> never in any scope
```

The cross-product refusal falls out of this and is not a special case: a `project` scope reaches no
`plan` target because the two branches do not overlap, whatever the ids are.

- [ ] **Step 1: write the failing tests** in `policy.test.ts`:
      - **the cross-product probe, by id collision.** A `manage` link scoped to
        `{kind:'project', projectId: X}` is refused **every** plan action on
        `{kind:'plan', planId: X}` — the *same* id. Ids are per-product; a collision must not be a
        grant. Enumerate the actions from `ACTIONS` by prefix, never by hand
      - **and the reverse**: a `manage` link scoped to `{kind:'plan', planId: X}` is refused every
        `project:*`, `folder:*`, `task:*` and `tab:*` action on the matching project target
      - **`write` cannot become `manage`** (spec §10): a plan-scoped `write` holder is cleared for
        each of the eight `WRITE` additions by name, and refused each of the twelve `MANAGE`
        additions by name, and refused all four `share:*`
      - a plan-scoped `view` holder is cleared for `plan:read` and refused everything else
      - a plan-scoped `manage` holder is cleared for all four `share:*` actions
      - **no link role reaches `epic:bind`**, at any scope — the ceiling test
      - `workspace:list-plans` and `workspace:create-plan` are refused to every link role at every
        scope, and an admin is cleared for all twenty-four
- [ ] **Step 2: run them and watch them fail.** `pnpm --filter @repo/kernel test`.
- [ ] **Step 3: make the four edits.** Watch `max-lines-per-function` on `inScope` — four branches is
      a table, not a chain of `if`s.
- [ ] **Step 4: run the kernel suite.** Green, and **every pre-existing policy case passes
      unchanged** — that is the evidence the scope rewrite preserved Microtask's behaviour rather
      than re-deriving it.
- [ ] **Step 5: the gate**, then commit
      `"Teach the policy that a plan is not a project with the same id"`.

### Task 2a: each product names the scope it means

**Found during Task 2, not anticipated by this plan.** Widening the kernel's `Scope` with a `plan`
variant broke every Microtask consumer that reads `scope.projectId` without narrowing — the union no
longer guarantees that field. These are type-only failures with no runtime behaviour change, but they
are a genuine blast radius the plan's Task 2b did not cover, and the gate stays red until they are
fixed.

**Files:**
- Modify: `packages/kernel/src/access/scope.ts` — two named narrowings
- Modify: `packages/kernel/src/index.ts` — export them
- Modify: `packages/microtask-domain/src/import/link-checks.ts` (~49–53),
  `src/import/remint.ts` (~44), `src/services/share-link-mapper.ts` (~66),
  `src/entities/contracts.test.ts` (~26–27), `src/export/bundle.test.ts` (~25),
  `src/import/remint.test.ts` (~155–156)
- Modify: `apps/api/src/routes/microtask/shares/handlers.ts` (~47), and the `RouteHandler`
  inference cascade it causes in `routes/microtask/projects/handlers.ts` and
  `routes/microtask/share-links/handlers.ts`
- Modify: `apps/api/src/routes/authorize-targets.test.ts`

The decision, taken here rather than at eight call sites:

```ts
/** A scope rooted at a Microtask project — the project itself, or one task inside it. */
export type ProjectScope = Extract<Scope, { kind: 'project' | 'task' }>

/** A scope rooted at a Macroplan plan. */
export type PlanScope = Extract<Scope, { kind: 'plan' }>
```

`Scope` stays the union of everything a link can reach, because `Principal` and `can()` genuinely
handle all of it. What every *product-specific* consumer means is one of these two, and saying so is
better than `Extract<…>` repeated inline or a cast. A `PlanScope` that nothing imports yet is not
speculative: it is the symmetric half, and its absence would make the next author reach for the
inline `Extract` the narrowing exists to replace.

**`authorize-targets.test.ts` needs a pending list.** It asserts every action in `ACTIONS` is reached
by some route literal, and twenty-four Macroplan actions now exist with no routes until Tasks 15, 16
and 16b. Give it an explicit `PENDING_ROUTES` set naming exactly those actions, with a TSDoc saying
which tasks empty it. Task 17 asserts the set is empty. A pending list makes the debt visible and
self-clearing; deleting the assertion would make it permanent and silent.

- [ ] **Step 1: add the two types** and export them from the kernel barrel. Rebuild:
      `pnpm --filter @repo/kernel build`. **`apps/api` and the domains load `@repo/*` from `dist/`,
      so nothing downstream sees this until the rebuild.**
- [ ] **Step 2: narrow the six domain sites.** Each is a signature or local annotation changing from
      `Scope` to `ProjectScope`. **Do not add runtime guards** — these are compile-time narrowings,
      and a thrown error where the type already excludes the case is dead code that reads as a real
      possibility. In `remint.ts`, `movedScope`'s `else` branch stopped being exhaustive: restore
      exhaustiveness through the narrowed type, not by adding a branch for a case that cannot occur.
- [ ] **Step 3: narrow the API sites.** `shares/handlers.ts:47` is the root; the two other handlers
      fail only by inference cascade and should need no edit once it is fixed. If they do, say so.
- [ ] **Step 4: add `PENDING_ROUTES`** to `authorize-targets.test.ts`, listing exactly the 24
      Macroplan actions, and assert the test still fails if a *Microtask* action loses its route —
      the pending list must not become a hole for the product it was not written for.
- [ ] **Step 5: `pnpm --filter @repo/microtask-domain test` and `pnpm --filter api test`**, both
      green, with the same counts as before Task 2 (881 and 985).
- [ ] **Step 6: the gate.** Green **except `@repo/contracts`**, whose agreement test Task 2b fixes.
      Confirm that is the only failing package.
- [ ] **Step 7: commit** `"Let each product name the scope it actually means"`.

### Task 2b: `capabilities()` learns the same twenty-four

The kernel's grants and the UI's projection are two encodings of one fact. They cannot be collapsed —
`@repo/contracts` holds `@repo/kernel` as a **devDependency only**, so that `node:crypto` never
reaches a browser bundle, and neither package can import the other at runtime. What keeps them honest
is the exhaustive agreement test, which already enumerates from the kernel's own `ACTIONS`. It will
fail the moment Task 2 lands, and that failure is the design working.

**Files:**
- Modify: `packages/kernel/src/access/target.ts` — add `TARGET_KINDS`, derive `Target['kind']` from it
- Modify: `packages/kernel/src/access/action.ts` — split the flat list into two composed halves
- Modify: `packages/kernel/src/access/policy.test.ts` — the exhaustiveness test below
- Modify: `packages/kernel/src/index.ts` — export `TARGET_KINDS`
- Modify: `packages/contracts/src/share-link.ts` — `Scope` gains the `plan` variant
- Modify: `packages/contracts/src/capabilities.ts` — `ROWS` gains twenty-four, `CapabilityTarget` gains
  `'plan' | 'epic' | 'feature' | 'item'`
- Modify: `packages/contracts/src/capabilities.test.ts` — `TARGETS` and `SCOPES` widen

**First, close a gap Task 2's quality review found.** `SCOPE_TARGETS` is total over `Scope['kind']`
— a new scope variant fails the build — but **not** over `Target['kind']`. A fifth target kind left
out of both `PROJECT_TARGETS` and `PLAN_TARGETS` compiles clean, and at runtime becomes reachable by
the admin alone, because `can()` short-circuits on admin before `inScope` runs. That is the safe
direction, but it is safe by accident of `can()`'s ordering rather than by anything the table
enforces, and it would ship as "share links cannot reach the new resource" — a support ticket, not a
red build.

The reason no test catches it is that nothing enumerates `Target['kind']` the way `ACTIONS`
enumerates `Action`, so `capabilities.test.ts` hand-derives its target list today. Add the missing
array, and derive the union from it rather than the other way round:

```ts
/** Every kind of thing a request can act on. The list `Target` is derived from. */
export const TARGET_KINDS = [
  'workspace', 'project', 'folder', 'task', 'tab', 'plan', 'epic', 'feature', 'item',
] as const
```

Then the exhaustiveness test in `policy.test.ts`:

```ts
it('places every target kind in exactly one scope family, so a kind added and left out is unreachable rather than silently open', () => {
  const placed = [...PROJECT_TARGETS, ...PLAN_TARGETS, 'workspace' as const]
  expect([...placed].sort()).toEqual([...TARGET_KINDS].sort())
})
```

`'workspace'` is added explicitly because it is deliberately in no scope; listing it here is what
makes its absence from both families a stated decision rather than an oversight that reads the same.
Sorting both sides also catches a kind placed in **two** families, which would be the more dangerous
direction.

**Second, split `ACTIONS` into two composed halves.** The list is 51 entries and
`workspace:list-plans` / `workspace:create-plan` sit orphaned at the end, far from the three other
`workspace:*` entries a reader scanning for "gated the same way" would expect them beside. A comment
header is not an option — `local/tsdoc-comments-only` bans it. Compose instead, the way
`policy.ts`'s own `WRITE = [...VIEW, …]` already does:

```ts
const MICROTASK_ACTIONS = [...] as const
const PLAN_ACTIONS = [...] as const

/** Every action the policy can decide. Adding one requires a policy decision. */
export const ACTIONS = [...MICROTASK_ACTIONS, ...PLAN_ACTIONS] as const
```

Both halves stay private; only `ACTIONS` is exported, so no consumer gains a way to ask about one
product's actions and accidentally treat that as the whole set. The existing suite must pass
unchanged — this is a reordering of one array literal and nothing else.

Each new row is a `{ minimum, target }` pair, and `minimum` is the **weakest** role that holds the
action — an ordering, not three sets, exactly as the file's existing TSDoc explains. Read the minimum
straight off Task 2's grants table: `VIEW` additions are `'view'`, `WRITE` additions `'write'`,
`MANAGE` additions `'manage'`, and `epic:bind`, `workspace:list-plans` and `workspace:create-plan`
are `'admin'`.

- [ ] **Step 1: run the existing agreement test and watch it fail.**
      `pnpm --filter @repo/kernel build && pnpm --filter @repo/contracts test`
      Expected: a failure naming the twenty-four actions the kernel declares and `ROWS` does not. **Do
      not skip this step** — seeing the test catch them unaided is the only proof it would catch the
      twentieth.
- [ ] **Step 2: widen `TARGETS` and `SCOPES`** in the test, and extend `targetIn` to build a plan,
      epic, feature and item target from a plan scope. The cross product grows from
      `3 roles × 2 scopes × 28 actions × 6 targets` to `3 × 3 × 47 × 10`; it is still a loop.
- [ ] **Step 3: add the `plan` variant to the contracts `Scope`** and the twenty-four `ROWS`.
- [ ] **Step 4: run the suite.** Green — `capabilities()` and `can()` now agree on every tuple,
      plan scope included. Spec §10 names this as the phase gate's third half.
- [ ] **Step 5: assert `@repo/kernel` is still absent from `dependencies`** — the existing test does
      this; confirm it still passes. A runtime edge here puts `node:crypto` in a browser bundle.
- [ ] **Step 6: the gate**, then commit `"Project the new grants where a browser can read them"`.

### Task 2c: one token index, for both products

> **DEFERRED — this task runs after Task 12, not here.** It is written in this position because it
> belongs to the same argument as Tasks 2, 2a and 2b: one policy, one scope union, one index. But it
> cannot be executed yet. `PrincipalResolver` needs a `LinkDirectory` per product, and the Macroplan
> adapter is written over `PlanStore` — a port **Task 12 creates**. Running this before then means
> either inventing a port Task 12 will then have to reconcile, or shipping a
> `Record<Product, LinkDirectory>` with one key missing, which does not typecheck.
>
> **Execution order is therefore: 3 → 4 → 5 → 11 → 12 → 2c → 13 → 14 → 14b → 15 → …** Task 2c must
> still land **before Task 15**, which mounts the routes the resolver guards, and before Task 14b,
> which mints tokens the index has to refuse collisions for.
>
> **One more thing this task must fix.** `apps/api/src/routes/microtask/shares/handlers.ts` casts
> `principal as MicrotaskLink`, justified by `PrincipalResolver` only ever resolving a project-rooted
> scope. That is true today and **stops being true here**: once one index serves both products,
> `resolve()` can legitimately return a plan-scoped principal, and the cast then asserts something
> false in the authorization path. Two other guards still refuse such a request — a plan scope cannot
> parse into a project manifest, and `inScope` refuses a `project` target to a `plan` scope — so this
> is not a hole before and will not be one after. But the cast has to become a narrowing that the
> resolver or the mount actually proves, rather than an assertion nothing does.

`TokenIndex` and `ShareIndex` live in `@repo/microtask-domain` and are typed to `ProjectManifest`. A
Macroplan bearer has to resolve too, and two indexes would mean `PrincipalResolver` trying both —
which is precisely the drift that consolidating avoids. A bearer is an opaque string; the index is
what *tells* you which product it belongs to, so it cannot be per-product without being asked twice.

**Files:**
- Create: `packages/kernel/src/access/token-index.ts` (the port, generalised)
- Create: `packages/kernel/src/access/share-index.ts` + `share-index.test.ts` (moved)
- Modify: `packages/kernel/src/index.ts`
- Delete: `packages/microtask-domain/src/ports/token-index.ts`,
  `src/storage/share-index.ts`, `src/storage/share-index.test.ts`
- Modify: `packages/microtask-domain/src/index.ts`, `src/services/context.ts`, and the call sites in
  `src/services/share-link-service.ts` and `src/import/remint.ts`
- Modify: `apps/api/src/auth/principal-resolver.ts`, `src/runtime.ts`, `src/testing/harness.ts`

The generalisation is smaller than it looks. `ShareIndex.add` already begins
`manifest.shareLinks.map((link) => link.token)`; lifting that one line to the caller makes the whole
port a matter of **strings and a product**, both of which the kernel already has. **No type moves**,
and `ShareLink` stays where it is:

```ts
/** Which container — a project or a plan — a share token belongs to. */
export interface TokenOwner {
  readonly product: Product
  readonly containerId: string
}

/** Resolution of a share token to the one container that owns it. */
export interface TokenIndex {
  /** Resolves a token to its owning container, or null when nothing owns it. */
  find(token: string): TokenOwner | null

  /** Reports which of `tokens` are already owned by a container other than the one named. */
  collisions(owner: TokenOwner, tokens: readonly string[]): readonly string[]

  /**
   * Replaces the tokens recorded for one container, throwing `Conflict` — and recording
   * nothing — if any belongs to another.
   */
  add(owner: TokenOwner, tokens: readonly string[]): void

  /** Drops every token belonging to one container, leaving others alone. */
  remove(owner: TokenOwner): void
}
```

Grouping `product` and `containerId` into `TokenOwner` also brings `collisions` from three parameters
to two, which is the direction ADR 0027 wants.

`PrincipalResolver` then needs to read the live link from **whichever** product owns it. Its TSDoc
already records why it re-reads on every request rather than caching beside the token — a revocation
or a downgrade must take effect on the next call — and that stays true for both products:

```ts
/** Reads one token's live role and scope from whichever manifest holds it. */
export interface LinkDirectory {
  readLink(containerId: string, token: string): Promise<LiveLink | null>
}

/** The two facts a principal is built from, read fresh on every request. */
export interface LiveLink {
  readonly role: Role
  readonly scope: Scope
}
```

The resolver takes `directories: Readonly<Record<Product, LinkDirectory>>` and indexes it by
`owner.product`. Two four-line adapters in `apps/api/src/auth/link-directory.ts` — one over
`ProjectStore`, one over `PlanStore` — satisfy it. A `Record` keyed by `Product` rather than a lookup
chain means adding a third product is a compile error until it is wired, not a token that silently
resolves to nothing.

- [ ] **Step 1: move `share-index.test.ts` into the kernel first** and rewrite its calls to the new
      signatures, **before** touching the implementation. It must fail to compile.
- [ ] **Step 2: add two cases it does not have**, which are the point of the consolidation:
      - a token owned by `{product:'microtask', containerId: X}` and then added under
        `{product:'macroplan', containerId: X}` is a **`Conflict`**, and the index still resolves it
        to the original owner — nothing is recorded. The same id under two products is two
        containers, and a bearer belongs to exactly one
      - `remove({product:'macroplan', containerId: X})` leaves the Microtask container's tokens
        untouched
- [ ] **Step 3: move the port and the implementation**, generalise both, and export from the kernel.
- [ ] **Step 4: update the four domain call sites**, lifting `.map((link) => link.token)` to each.
- [ ] **Step 5: rebuild the kernel, then run the domain suite.**
      `pnpm --filter @repo/kernel build && pnpm --filter @repo/microtask-domain test`
      Expected: **the whole existing suite passes unchanged.** That is the evidence this was a
      generalisation and not a rewrite. `share-link-service.test.ts` and `remint.test.ts` are the two
      that would catch a mistake.
- [ ] **Step 6: write `link-directory.ts`** and rework `PrincipalResolver` and its test. Add a case:
      a bearer whose index entry names a container that no longer exists resolves to `null`, not a
      throw — a deleted plan must read as a dead link.
- [ ] **Step 7: rework `warmTokenIndex`** to walk both stores. Its TSDoc already warns that without
      it *every share link minted before this process started answers 401*; that failure is now
      possible in two products, and the test asserts a plan's tokens are warmed too.
- [ ] **Step 8: rebuild the packages, run the API suite.** Green, unchanged.
- [ ] **Step 9: the gate**, then commit `"One token index, because a bearer names its own owner"`.

### Task 3: the limits

**Files:**
- Modify: `packages/contracts/src/limits.ts`
- Modify: `packages/contracts/src/limits.test.ts`
- Modify: `packages/microtask-domain/src/limits.ts` — the `LABEL` map is narrowed to Microtask's own keys

`LIMITS` gains six **collection counts**:

```ts
plansPerProduct: 200,
epicsPerPlan: 40,
featuresPerPlan: 200,
itemsPerPlan: 2_000,
edgesPerPlan: 400,
shareLinksPerPlan: 50,
```

`shareLinksPerPlan` matches `shareLinksPerProject` exactly. The two bound the same thing — how many
live bearer credentials one container may hold — and a plan is not a place where more seats make sense
than a project.

Three **value bounds** are added as siblings of `MAX_DOCUMENT_BYTES`, *not* inside `LIMITS`, because
`CountLimitKey` is `Exclude<LimitKey, 'nameLength'>` and a value bound there would be offered to
`assertWithin`, which counts collections:

```ts
/** The largest a single estimate may be, in working days — about four years. */
export const MAX_ESTIMATE_DAYS = 1_000

/** The longest a sprint may be, in working days. */
export const MAX_SPRINT_LENGTH_DAYS = 60

/** The largest an item's plain-text description may be, in UTF-8 bytes. */
export const MAX_ITEM_DESCRIPTION_BYTES = 8_192
```

`LABEL` in `packages/microtask-domain/src/limits.ts` is a `Record<LimitKey, string>`, so it stops
compiling until the five new keys are given sentences: `'plans'`, `'epics in this plan'`,
`'features in this plan'`, `'items in this plan'`, `'dependencies in this plan'`.

- [ ] **Step 1: write the failing test.** `limits.test.ts` asserts the exact numeric value of each of
      the six new keys and of the three new constants. A cap is a promise to a client and the
      canvas is sized from it; a silent change must fail a test, not a screenshot.
- [ ] **Step 2: run it and watch it fail.** `pnpm --filter @repo/contracts test`.
- [ ] **Step 3: add the constants**, then narrow `LABEL` and `assertWithin`.
- [ ] **Step 4: run the contracts and domain suites.** Both green.
- [ ] **Step 5: the gate**, then commit `"Bound every collection a plan can grow"`.

### Task 4: the plan schemas

**Files:**
- Create: `packages/contracts/src/plan.ts`
- Create: `packages/contracts/src/plan.test.ts`
- Modify: `packages/contracts/src/index.ts`

```ts
/** A calendar date with no time and no zone: the one date a plan carries. */
export const IsoDate = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'must be YYYY-MM-DD')

/** An IANA time-zone name, accepted only if this runtime's Intl can resolve it. */
export const Timezone = z.string().min(1).max(64)

/** A non-negative whole number of working days. Zero is a milestone. */
export const EstimateDays = z.number().int().min(0).max(MAX_ESTIMATE_DAYS)

/** Which sprint a feature is pinned to, 0-based, as a lower bound and nothing else. */
export const SprintIndex = z.number().int().min(0)

/** A dense 0-based order within one parent. */
export const Position = z.number().int().min(0)

/** A rail's hue, as a lowercase six-digit hex colour. */
export const RailColour = z.string().regex(/^#[0-9a-f]{6}$/, 'must be #rrggbb')

/** What an epic is bound to in Microtask. Reserved by phase 1; written by phase 4. */
export const EpicBinding = z.object({
  projectId: EntityId,
  role: z.enum(['view', 'manage']),
  sealedToken: z.string().min(1),
})

export const PlanEpic = z.object({
  id: EntityId,
  name: EntityName,
  colour: RailColour,
  railOrder: Position,
  binding: EpicBinding.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const PlanFeature = z.object({
  id: EntityId,
  epicId: EntityId,
  name: EntityName,
  position: Position,
  estimateDays: EstimateDays.nullable(),
  pinSprint: SprintIndex.nullable(),
  dependsOn: z.array(EntityId).max(LIMITS.edgesPerPlan).readonly(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const PlanItem = z.object({
  id: EntityId,
  featureId: EntityId,
  name: EntityName,
  position: Position,
  estimateDays: EstimateDays.nullable(),
  linkedTaskId: EntityId.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Everything about a plan except its item descriptions. The canvas is one read of this. */
export const PlanManifest = z.object({
  id: EntityId,
  name: EntityName,
  startDate: IsoDate,
  sprintLengthDays: z.number().int().min(1).max(MAX_SPRINT_LENGTH_DAYS),
  timezone: Timezone,
  epics: z.array(PlanEpic).max(LIMITS.epicsPerPlan),
  features: z.array(PlanFeature).max(LIMITS.featuresPerPlan),
  items: z.array(PlanItem).max(LIMITS.itemsPerPlan),
  shareLinks: z.array(ShareLink).max(LIMITS.shareLinksPerPlan),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** The contents of one item file: its description and nothing else. */
export const ItemDocument = z.object({
  id: EntityId,
  description: z.string().max(MAX_ITEM_DESCRIPTION_BYTES),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

Every schema carries `.meta({ id, description })` in the style of the file beside it, because the
OpenAPI document is generated from these and an unnamed component is inlined at every use.

Note on `ItemDocument.description`: the Zod `.max()` is a **character** bound and is a backstop only.
The byte cap is enforced in the domain (Task 12), where `MAX_ITEM_DESCRIPTION_BYTES` is measured in
UTF-8. A `.max()` in UTF-16 units is the exact mistake the Microtask plan records.

- [ ] **Step 1: write the failing tests.** In `plan.test.ts`:
      - `IsoDate` accepts `'2026-01-05'` and rejects `'2026-1-5'`, `'2026-01-05T00:00:00Z'`, `''`
      - `EstimateDays` accepts `0` and `MAX_ESTIMATE_DAYS`, rejects `-1`, `1.5`,
        `MAX_ESTIMATE_DAYS + 1`
      - `RailColour` rejects `'#ABCDEF'` (uppercase), `'red'`, `'#abc'`
      - a `PlanManifest` holding exactly `LIMITS.itemsPerPlan` items parses; one holding
        `LIMITS.itemsPerPlan + 1` does not. **At the cap, not near it** (spec §4.3)
      - the same at the cap for `epics`, `features`, and for `dependsOn` at `edgesPerPlan`
      - `binding` and `linkedTaskId` accept `null` and parse when present, so phase 4 adds no
        migration
- [ ] **Step 2: run them and watch them fail.** `pnpm --filter @repo/contracts test`.
- [ ] **Step 3: write `plan.ts`** and export every name from `index.ts`.
- [ ] **Step 4: run the suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Give a plan a wire shape"`.

### Task 5: payloads, the schedule's wire form, and the views

**Files:**
- Create: `packages/contracts/src/schedule-view.ts`
- Create: `packages/contracts/src/plan-payloads.ts`
- Create: `packages/contracts/src/plan-views.ts`
- Create: `packages/contracts/src/plan-views.test.ts`
- Modify: `packages/contracts/src/index.ts`

The schedule crosses the wire as arrays, because a `Map` does not survive JSON:

```ts
export const ScheduleSpan = z.object({ id: EntityId, startDay: z.number().int(), endDay: z.number().int() })
export const ScheduleCycle = z.object({ featureIds: z.array(EntityId).readonly() })
export const UnscheduledEntry = z.object({ id: EntityId, reason: z.enum(['no-estimate', 'in-cycle']) })

export const IgnoredEdge = z.object({ featureId: EntityId, dependsOnId: EntityId })

export const ScheduleView = z.object({
  spans: z.array(ScheduleSpan).readonly(),
  cycles: z.array(ScheduleCycle).readonly(),
  unscheduled: z.array(UnscheduledEntry).readonly(),
  ignoredEdges: z.array(IgnoredEdge).readonly(),
})
```

`ignoredEdges` carries the dependencies the forward pass could not honour because they contradict
rail order (see Task 10). It is a **fourth** conflict channel beside `cycles` and `unscheduled`, not
a variant of either: a cycle is mutual, an unscheduled feature has no span, and an ignored edge is a
feature that *did* get placed while one of its stated dependencies was set aside. The canvas has to
say which — "this bar ignores a dependency" is a different sentence from "this bar could not be
placed", and a client that could not tell them apart would have to guess.

The views:

```ts
/** A plan and the schedule derived from it, which is never stored (spec §3.4). */
export const PlanView = PlanManifest.extend({
  epics: PlanManifest.shape.epics.readonly(),
  features: PlanManifest.shape.features.readonly(),
  items: PlanManifest.shape.items.readonly(),
  shareLinks: PlanManifest.shape.shareLinks.readonly().optional(),
  schedule: ScheduleView,
})

/** A plan as a list describes it: its settings and three counts, never its contents. */
export const PlanListItem = z.object({
  id: EntityId,
  name: EntityName,
  startDate: IsoDate,
  sprintLengthDays: PlanManifest.shape.sprintLengthDays,
  timezone: Timezone,
  epicCount: z.number().int().min(0),
  featureCount: z.number().int().min(0),
  itemCount: z.number().int().min(0),
  shareLinkCount: z.number().int().min(0).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const PlanList = z.object({ plans: z.array(PlanListItem).readonly() })

/** One item with the description its own file holds. */
export const ItemView = PlanItem.extend({ description: z.string() })
```

The payloads. The distinction that matters throughout: **`undefined` means "leave it alone", `null`
means "clear it"** — so every clearable field is `.nullable().optional()` and every non-clearable one
is merely `.optional()`.

```ts
export const CreatePlanPayload = z.object({
  name: EntityName,
  startDate: IsoDate,
  sprintLengthDays: PlanManifest.shape.sprintLengthDays.optional(),
  timezone: Timezone.optional(),
})

export const UpdatePlanPayload = z.object({
  name: EntityName.optional(),
  startDate: IsoDate.optional(),
  sprintLengthDays: PlanManifest.shape.sprintLengthDays.optional(),
  timezone: Timezone.optional(),
})

export const CreateEpicPayload = z.object({ name: EntityName, colour: RailColour.optional() })
export const UpdateEpicPayload = z.object({ name: EntityName.optional(), colour: RailColour.optional() })
export const EpicPlacementPayload = z.object({ railOrder: Position })

export const CreateFeaturePayload = z.object({
  epicId: EntityId,
  name: EntityName,
  estimateDays: EstimateDays.nullable().optional(),
  pinSprint: SprintIndex.nullable().optional(),
})
export const UpdateFeaturePayload = z.object({
  name: EntityName.optional(),
  estimateDays: EstimateDays.nullable().optional(),
  pinSprint: SprintIndex.nullable().optional(),
})
export const FeaturePlacementPayload = z.object({ epicId: EntityId, position: Position })
export const DependenciesPayload = z.object({
  dependsOn: z.array(EntityId).max(LIMITS.edgesPerPlan).readonly(),
})

export const CreateItemPayload = z.object({
  featureId: EntityId,
  name: EntityName,
  estimateDays: EstimateDays.nullable().optional(),
})
export const UpdateItemPayload = z.object({
  name: EntityName.optional(),
  estimateDays: EstimateDays.nullable().optional(),
})
export const ItemPlacementPayload = z.object({ featureId: EntityId, position: Position })
export const DescriptionPayload = z.object({ description: z.string() })
```

Each of the four `Update*Payload` schemas carries
`.refine((value) => Object.keys(value).length > 0, 'at least one field must be given')`, so an empty
`PATCH` is a 422 rather than a write that stamps `updatedAt` and changes nothing.

- [ ] **Step 1: write the failing tests** in `plan-views.test.ts`:
      - `UpdateFeaturePayload` parses `{}` as a **failure**, `{ estimateDays: null }` as a success
        that carries the key, and `{}` after `estimateDays` is omitted as *not* carrying the key —
        the test reads `'estimateDays' in parsed` to prove clear and leave-alone are distinguishable
      - `PlanListItem` has no `epics`, `features` or `items` key: a list of 200 plans at the item cap
        is 400 000 items on the one screen that renders none of them
      - `PlanView` carries `schedule`, and `PlanManifest` does not — a stored manifest must never
        contain a schedule (spec §3.4), and this is the test that stops one being added
      - `DependenciesPayload` rejects an array longer than `LIMITS.edgesPerPlan`
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: write the three files** and export from `index.ts`.
- [ ] **Step 4: run the contracts suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Say what a plan request and a plan response look like"`.

---

# Group B — `@repo/schedule`

### Task 6: the package, and the test that keeps it pure

**Files:**
- Create: `packages/schedule/package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `eslint.config.js`, `vitest.config.ts`
- Create: `packages/schedule/src/structure.ts`, `src/index.ts`
- Create: `packages/schedule/src/purity.test.ts`
- Modify: `turbo.json` — `@repo/schedule#build` joins `tasks['//#check-exports'].dependsOn`

`package.json`, copied in shape from `@repo/contracts` with **no `dependencies` key at all**:

```json
{
  "name": "@repo/schedule",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@repo/eslint-config": "workspace:*",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "eslint": "catalog:",
    "vite": "catalog:"
  }
}
```

The types, which every later task in this group builds on:

```ts
/** What turns a working-day offset into a calendar position. */
export interface PlanCalendar {
  readonly startDate: string
  readonly sprintLengthDays: number
  readonly timezone: string
}

export interface ScheduleEpic { readonly id: string; readonly railOrder: number }

export interface ScheduleFeature {
  readonly id: string
  readonly epicId: string
  readonly position: number
  readonly estimateDays: number | null
  readonly pinSprint: number | null
  readonly dependsOn: readonly string[]
}

export interface ScheduleItem {
  readonly id: string
  readonly featureId: string
  readonly position: number
  readonly estimateDays: number | null
}

/** Everything the forward pass reads. A `PlanManifest` satisfies it structurally. */
export interface PlanStructure extends PlanCalendar {
  readonly epics: readonly ScheduleEpic[]
  readonly features: readonly ScheduleFeature[]
  readonly items: readonly ScheduleItem[]
}

/** Working-day offsets from the plan's first working day. `endDay` is **exclusive**. */
export interface Span { readonly startDay: number; readonly endDay: number }

/** Feature ids that depend on each other, in ascending id order. */
export interface Cycle { readonly featureIds: readonly string[] }

export type UnscheduledReason = 'no-estimate' | 'in-cycle'
export interface Unscheduled { readonly id: string; readonly reason: UnscheduledReason }

export interface ScheduleResult {
  readonly days: ReadonlyMap<string, Span>
  readonly cycles: readonly Cycle[]
  readonly unscheduled: readonly Unscheduled[]
}

/** An authored estimate beside what its children add up to. */
export interface Breakdown {
  readonly planned: number
  readonly brokenDown: number
  readonly delta: number
}
```

- [ ] **Step 1: write `purity.test.ts` first.** It reads `packages/schedule/package.json` and asserts
      `dependencies` is absent or empty, and it reads every `.ts` file under `src/` and asserts none
      contains `from 'node:` or `require('node:`. This package is imported by a browser bundle from
      phase 2 onward; a `node:crypto` edge is a build failure a week later in a different package,
      and it is trivially preventable here.
- [ ] **Step 2: run it and watch it fail.** `pnpm --filter @repo/schedule test` — the package does
      not exist yet, so this step is really "watch `pnpm --filter` report no such package", which is
      the correct failure.
- [ ] **Step 3: scaffold the package.** Copy `tsconfig.json`, `tsconfig.build.json` and
      `vitest.config.ts` verbatim from `packages/contracts`. `eslint.config.js` is
      `packages/macroplan-domain/eslint.config.js` verbatim — `base` plus `noProductImports`.
      Write `structure.ts` and an `index.ts` that re-exports its types.
- [ ] **Step 4: install and run.** `pnpm install`, then `pnpm --filter @repo/schedule test`. Green.
- [ ] **Step 5: add `@repo/schedule#build` to `turbo.json`**, then
      `node scripts/check-exports.mjs` exits 0. Without the turbo entry that script exits 1 by
      design, naming the package.
- [ ] **Step 6: the gate**, then commit `"Open a package for the one real algorithm in this product"`.

### Task 7: calendar arithmetic

**Files:**
- Create: `packages/schedule/src/calendar.ts`
- Create: `packages/schedule/src/calendar.test.ts`
- Modify: `packages/schedule/src/index.ts`

```ts
/** Whether a calendar date is a working day. Saturday and Sunday are not; holidays do not exist. */
export function isWorkingDay(date: string): boolean

/**
 * The calendar date a working-day offset lands on.
 *
 * Day 0 is the plan's `startDate` when that is a working day, and otherwise the next working day.
 * Negative offsets count backwards through working days.
 */
export function dayToDate(day: number, calendar: PlanCalendar): string

/**
 * The working-day offset a calendar date sits at.
 *
 * A weekend date answers the offset of the **next** working day, so a Saturday, a Sunday and the
 * Monday after them share one offset — which is what puts a today line drawn at the weekend on the
 * left edge of Monday, where no work has started.
 */
export function dateToDay(date: string, calendar: PlanCalendar): number

/** Today's calendar date in a plan's own zone, from an instant. */
export function todayIn(timezone: string, at: Date): string
```

**The decision that makes DST a non-event.** All three of the first functions do their arithmetic on
`(year, month, day)` triples converted to a **UTC** midnight instant, advanced by whole multiples of
86 400 000 ms, and converted back. UTC has no DST, so no offset transition can shift a day boundary
and no `startDate` can ever land on a date that does not exist. The plan's `timezone` is read by
`todayIn` and by nothing else, because the only question that needs it is "what is today's date where
this plan lives" — every other date in the product is a calendar date to begin with.

`todayIn` uses `Intl.DateTimeFormat(locale, { timeZone, year, month, day })` with `formatToParts`,
never `toLocaleDateString` with a locale string, whose output format is not fixed across runtimes. An
unresolvable `timeZone` throws `RangeError` from `Intl`; `todayIn` lets it through rather than
falling back to UTC, because a plan silently drawn in the wrong zone is worse than a refusal.

- [ ] **Step 1: write the failing tests.** `calendar.test.ts`:
      - a plan starting on each of the **seven weekdays**: `dayToDate(0, …)` is the start date itself
        for Monday–Friday and the following Monday for Saturday and Sunday (spec §10)
      - `dayToDate(5, …)` for a Monday start is the following Monday — five working days is a week
      - `dateToDay(dayToDate(d, c), c) === d` for every `d` in `0..400`, for a Monday start and for a
        Saturday start
      - a Saturday, the Sunday after it and the Monday after that all answer the same `dateToDay`
      - a sprint spanning a **year boundary**: `dayToDate` across 31 December into January is
        continuous, including across a leap year (2027→2028 and 2028→2029)
      - a **DST transition** inside the range: a plan in `'Europe/Belgrade'` whose days span the
        March and October transitions produces exactly the same dates as the same plan in `'UTC'` —
        the point being that the structure makes the zone irrelevant to `dayToDate`
      - `todayIn('Pacific/Kiritimati', new Date('2026-09-22T11:00:00Z'))` is `'2026-09-23'` and
        `todayIn('Pacific/Niue', …)` is `'2026-09-22'`: the same instant, two dates, which is the
        whole reason the plan carries a zone rather than trusting the server's
      - `todayIn('Not/AZone', …)` throws
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: implement `calendar.ts`.**
- [ ] **Step 4: run the suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Count working days without ever touching a clock"`.

### Task 8: sprints

**Files:**
- Create: `packages/schedule/src/sprints.ts`
- Create: `packages/schedule/src/sprints.test.ts`
- Modify: `packages/schedule/src/index.ts`

```ts
/** Which sprint a working-day offset falls in. 0-based; a UI adds one to label it. */
export function sprintOf(day: number, calendar: PlanCalendar): number

/** The first and last calendar dates of one sprint. Both inclusive. */
export function rangeOfSprint(sprint: number, calendar: PlanCalendar): { from: string; to: string }
```

`sprintOf` is `Math.floor(day / calendar.sprintLengthDays)`. `rangeOfSprint(n)` spans days
`n * sprintLengthDays` through `(n + 1) * sprintLengthDays - 1` inclusive, mapped through `dayToDate`.

Sprints are **gridlines, not containers** (spec §3.3): nothing is assigned to one, nothing is counted
against one, and an item straddling a boundary is silent. There is no capacity function here and
there is not going to be one.

- [ ] **Step 1: write the failing tests.**
      - with `sprintLengthDays: 10`, days 0–9 are sprint 0 and day 10 is sprint 1
      - `sprintOf(-1, …)` is `-1`, not `0`. Not because a feature can be pinned before the start — it
        cannot, `SprintIndex` is `.min(0)` and the forward pass floors at 0 — but because `sprintOf`
        is a general axis utility and phase 2's today line can fall before a plan's `startDate`. A
        day before the axis begins must not fold onto sprint 0 silently
      - `rangeOfSprint(0, …)` for a Monday start is that Monday through the Friday of the week after
      - `rangeOfSprint(n).to` is always a working day, for `n` in `0..40`
      - `sprintOf(dateToDay(rangeOfSprint(n).from, c), c) === n` for `n` in `0..40`
      - `sprintLengthDays: 1` works: every sprint is one day, and `sprintOf(k) === k`
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: implement `sprints.ts`.**
- [ ] **Step 4: run the suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Draw the sprint gridlines the plan never stores"`.

### Task 9: estimates and cycles

**Files:**
- Create: `packages/schedule/src/estimate.ts`, `src/estimate.test.ts`
- Create: `packages/schedule/src/cycles.ts`, `src/cycles.test.ts`
- Modify: `packages/schedule/src/index.ts`

```ts
/**
 * What a feature is actually worth, in working days.
 *
 * The sum of its **estimated** items when it has at least one, and its own authored estimate
 * otherwise. `null` means it cannot be scheduled at all.
 */
export function effectiveEstimate(
  feature: ScheduleFeature,
  items: readonly ScheduleItem[],
): number | null

/**
 * The authored estimate beside what the breakdown came to, or `null` when there is no pair.
 *
 * Present only when a feature carries an authored estimate **and** at least one estimated item.
 * That gap is spec §3.2's "most useful number in the application": where a macro plan is wrong,
 * stated in days, before anything is late.
 */
export function breakdown(
  feature: ScheduleFeature,
  items: readonly ScheduleItem[],
): Breakdown | null

/**
 * Every dependency cycle among features, each as ascending ids, the whole list in ascending
 * order of first id. A self-edge is a cycle of one.
 */
export function findCycles(features: readonly ScheduleFeature[]): readonly Cycle[]
```

`items` is the feature's own items, already filtered by the caller. `findCycles` is Tarjan's
strongly-connected components over the `dependsOn` graph: every component of size greater than one is
a cycle, plus every node carrying an edge to itself. An edge naming a **feature id that does not
exist** is ignored rather than reported — `schedule` must be total, and a dangling edge is a storage
fault, not a plan the user can see or fix.

- [ ] **Step 1: write the failing tests** for `effectiveEstimate` and `breakdown`:
      - no items, authored `40` → `40`; no items, authored `null` → `null`
      - three items of 20, 20, 22 with authored `40` → `62`, and `breakdown` is
        `{ planned: 40, brokenDown: 62, delta: 22 }`
      - the authored value is **never overwritten**: the same feature passed twice returns the same
        pair, and nothing in this module mutates its arguments
      - items exist but **none** is estimated, authored `40` → `40`. This is the case the naive
        reading gets wrong: summing over zero estimated children would answer `0` and turn a
        40-day feature into a milestone the moment its first item is named
      - one item estimated at 5 among three unestimated, authored `40` → `5`, and `breakdown` is
        `{ planned: 40, brokenDown: 5, delta: -35 }` — a negative delta is a real and reportable
        state. **`delta` is `brokenDown - planned`**, which is what spec §3.2 renders as
        *planned 40d · broken down to 62d · +22d*. An earlier draft of this plan wrote `-5` here,
        which no single formula can produce alongside the `+22` above; the `+22` example is the
        one the spec pins, so it wins
      - a zero estimate is an estimate: authored `0` → `0`, not `null`
- [ ] **Step 2: write the failing tests** for `findCycles`:
      - an acyclic graph returns `[]`
      - `a → b → a` returns one cycle `['a','b']`
      - a self-edge `a → a` returns `['a']`
      - two disjoint cycles return two entries, ordered by first id
      - a diamond (`a→b`, `a→c`, `b→d`, `c→d`) is **not** a cycle
      - an edge to an id no feature carries returns `[]` and throws nothing
      - shuffling the input array changes nothing about the output
- [ ] **Step 3: run both and watch them fail.**
- [ ] **Step 4: implement both modules.**
- [ ] **Step 5: run the suite.** Green.
- [ ] **Step 6: the gate**, then commit `"Decide what a feature is worth, and when it cannot be"`.

### Task 10: the forward pass

The heart of the product. Spec §3.1, restated as an algorithm.

**Files:**
- Create: `packages/schedule/src/forward-pass.ts`, `src/forward-pass.test.ts`
- Create: `packages/schedule/src/testing/arbitrary.ts`
- Create: `packages/schedule/src/forward-pass.property.test.ts`
- Modify: `packages/schedule/src/index.ts`

```ts
/**
 * Places every feature and item on a working-day axis, in one pass.
 *
 * Never throws and never partially fails: a structure with a cycle, a dangling edge, a missing
 * estimate or no epics at all returns a result describing exactly that.
 */
export function schedule(plan: PlanStructure): ScheduleResult
```

**The algorithm, stated once.**

1. Order is total and derived, never array order: epics by `(railOrder, id)`, features by
   `(position, id)` within their epic, items by `(position, id)` within their feature. This is what
   makes the output independent of input ordering.
1b. **Ids are assumed unique and the assumption is not defended here.** Task 9's `findCycles`
   indexes features into a `Map`, so a repeated id silently keeps the last one's edges; build your
   own index the same way and state it, rather than inventing a merge nobody asked for. A manifest
   with duplicate ids is corrupt — the store mints ULIDs and no service writes one twice — and
   `schedule()` must stay total, so it is not the place to refuse. If that refusal is wanted it
   belongs at the schema or service boundary (Tasks 4 and 14), where there is a caller to tell.
2. `cycles = findCycles(plan.features)`. Every feature in a cycle is **unscheduled**
   (`reason: 'in-cycle'`), and so is every item of one.
3. A feature is **schedulable** when it is not in a cycle and `effectiveEstimate` is not `null`;
   otherwise it is unscheduled with `reason: 'no-estimate'`.
4. Build a precedence graph over the schedulable features. Each one has an incoming edge from:
   - its **rail predecessor** — the nearest earlier schedulable feature on the same epic, so an
     unschedulable feature does not break the chain; and
   - every feature in its `dependsOn` that is itself schedulable. An edge to an unknown id, to a
     cycle member, or to an unestimated feature is **ignored**.
   **This graph is NOT acyclic by construction** — an earlier draft of this plan claimed it was,
   and that claim is false. Rail edges and dependency edges together close cycles `findCycles`
   cannot see, because the `dependsOn` graph alone is acyclic in every one of them: a feature at
   position 0 that depends on the feature at position 1 says both `f1 → f2` (rail) and
   `f2 → f1` (dependency). Measured on the seeded generator, **679 of 1000 plans contain one**, so
   it is the ordinary case, and it is user-reachable — reordering features without updating their
   dependencies produces exactly it.

   **Rail order wins, and the dropped edge is named.** When relaxation stalls, release the stalled
   feature earliest in derived order and ignore what it still waits on; because that feature is the
   earliest unplaced one, no rail-predecessor edge is ever dropped and every dependency running
   forward through the derived order is always honoured. Rail order wins rather than the dependency
   because a bar out of sequence on its own rail reads as a broken canvas, not as a conflict.

   Every edge dropped this way is reported in `ScheduleResult.ignoredEdges`. Silently resolving it
   is what spec §6 forbids — *"a solver that silently moves an executive's committed plan is a worse
   failure than a visible contradiction"* — and reporting it is also what keeps "dependencies hold"
   a universal property rather than one qualified by a forward-only projection.
5. Relax in topological order:
   `start = max(0, every predecessor's end, pinSprint * sprintLengthDays)`, then
   `end = start + effectiveEstimate`. `pinSprint` joins the `max` as one more lower bound and never
   as an upper one — it can only delay, never pull anything earlier (spec §3.1).
6. Items flow inside their feature: the first estimated item starts at its feature's `start`, each
   subsequent one at the previous one's `end`. An item with no estimate is unscheduled
   (`reason: 'no-estimate'`), contributes nothing, and does not interrupt the flow.
7. `days` holds a span for every scheduled feature and every scheduled item. `unscheduled` is sorted
   by id. `cycles` is `findCycles`' output unchanged.

**Feature contiguity is a consequence, not a rule**: because a feature's effective estimate is the
sum of its estimated items and those items flow head to tail from its start, a feature's span always
equals the sum of its items with no internal gaps. That is what makes an edge between two features
mean something at the year rung (spec §3.1), and it is asserted as a property rather than assumed.

The seeded generator, so the property tests need no new dependency:

```ts
/** A deterministic pseudo-random `PlanStructure`, reproducible from its seed. */
export function arbitraryPlan(seed: number): PlanStructure
```

It draws 1–6 epics, 0–12 features per epic, 0–8 items per feature, estimates in `0..30` or `null`,
`pinSprint` in `0..8` or `null`, and 0–3 `dependsOn` edges per feature drawn from **all** features
including its own rail and including itself — so cycles and self-edges occur naturally rather than
being a special case the tests remember to write. It uses a small xorshift PRNG defined in the file;
`Math.random()` is banned here, because a property test that cannot be replayed is a flake.

- [ ] **Step 1: write the failing example tests** in `forward-pass.test.ts`. Each is one named,
      hand-built structure with the expected spans written out:
      - one epic, three features of 4, 3, 5 days, no edges → spans `0–4`, `4–7`, `7–12`
      - **three epics advance independently**: three rails of one 10-day feature each all start at
        day 0, and the plan's length is 10 and not 30. This is spec §3.1's whole claim and the
        difference the user chose the model for
      - a dependency across rails: `checkout/f1` (4d) → `billing/g1` (3d) puts `g1` at `4–7` even
        though `g1` is the first feature on its own rail
      - a dependency that is **already satisfied** by rail order moves nothing
      - `pinSprint: 2` with `sprintLengthDays: 10` puts a feature at day 20 even though its rail
        cursor is at day 3, and its rail successor follows at day 20 + its estimate
      - `pinSprint: 0` on a feature whose rail cursor is already at day 30 changes **nothing** — a
        pin is a lower bound and never a command to move earlier
      - an estimate of `0` is a milestone: `start === end`, it appears in `days`, it is **not** in
        `unscheduled`, and it does not advance its rail's cursor
      - a feature with items 2, 3, 4 spans `0–9` and its items span `0–2`, `2–5`, `5–9` — the
        contiguity case, written as a literal
      - a feature with items 2, `null`, 4 spans `0–6`, its two estimated items span `0–2` and `2–6`,
        and the unestimated one is in `unscheduled` with `reason: 'no-estimate'`
      - a two-feature cycle: both are in `cycles`, both and all their items are in `unscheduled` with
        `reason: 'in-cycle'`, **and every feature outside the cycle still has a span** (spec §4.1)
      - a feature depending on a cycle member still schedules, the edge ignored
      - an empty plan — no epics — returns empty `days`, `cycles` and `unscheduled`, and throws
        nothing
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: write `arbitrary.ts`**, and a test of the generator itself: the same seed twice
      produces deeply equal structures, and two different seeds do not. A generator that is not
      reproducible makes every property below worthless.
- [ ] **Step 4: write the property tests** in `forward-pass.property.test.ts`, each over seeds
      `0..999`, printing the failing seed in the assertion message:
      - **totality** — `schedule` never throws, for any seed
      - **partition** — every feature and every item appears in `days` or in `unscheduled`, never in
        both and never in neither
      - **order independence** — shuffling `epics`, `features` and `items` (by the same seeded PRNG)
        produces a deeply equal result. Spec §10 names this one
      - **monotonicity** — adding one edge to a plan never moves anything **earlier**: every id
        scheduled in both results has a `startDay` in the second at least as large as in the first.
        Spec §10 names this one
      - **pins hold** — for every scheduled feature with `pinSprint = n`,
        `startDay >= n * sprintLengthDays`. Spec §10 names this one
      - **cycles are contained** — every id in `cycles` is unscheduled, and every feature outside
        every cycle with a non-null effective estimate is scheduled. Spec §10 names this one
      - **contiguity** — for every scheduled feature, `endDay - startDay` equals the sum of its
        estimated items' estimates when it has any, and its items tile `[startDay, endDay)` with no
        gap and no overlap. Spec §10 names this one
      - **dependencies hold** — for every scheduled feature and every scheduled feature it depends
        on, `startDay >= that feature's endDay`
      - **rail order holds** — on every rail, scheduled features in `position` order have
        non-decreasing `startDay`
- [ ] **Step 5: run them and watch them fail.**
- [ ] **Step 6: implement `forward-pass.ts`.** Note the 150-line and 50-line caps: the topological
      relaxation, the item flow and the ordering are three functions, not one.
- [ ] **Step 7: run the whole schedule suite.** Green, all properties included.
- [ ] **Step 8: the gate**, then commit `"Schedule a plan in one pass, and prove it nine ways"`.

---

# Group C — `@repo/macroplan-domain`

### Task 11: entities, limits and paths

**Files:**
- Create: `packages/macroplan-domain/src/entities/{plan,epic,feature,item,binding}.ts`
- Create: `packages/macroplan-domain/src/limits.ts`, `src/limits.test.ts`
- Create: `packages/macroplan-domain/src/storage/paths.ts`, `src/storage/paths.test.ts`
- Modify: `packages/macroplan-domain/src/index.ts`
- Modify: `packages/macroplan-domain/package.json` — add `@repo/contracts` and `@repo/schedule` to
  `dependencies`; add `vitest`, `vite`, `@types/node` and `@repo/store` to `devDependencies`; add
  `"test": "vitest run"` to `scripts` and the `./testing` subpath to `exports`
- Create: `packages/macroplan-domain/vitest.config.ts`

The entities are the TypeScript interfaces the store round-trips — the same relationship
`entities/manifest.ts` has to `contracts/project.ts` in Microtask: the same shape, `readonly`
throughout, and no Zod. `PlanManifest`, `PlanEpic`, `PlanFeature`, `PlanItem`, `ItemDocument`,
`EpicBinding`.

```ts
/** Collapses whitespace, trims, and caps a display name. Re-exported from the shared rule. */
export function cleanName(value: unknown, fallback?: string): string

/**
 * Normalises and caps one item's plain-text description.
 *
 * Normalises `\r\n` and lone `\r` to `\n`; strips every C0 control character except `\n` and
 * `\t`, and strips `U+007F`; then truncates to `MAX_ITEM_DESCRIPTION_BYTES` in **UTF-8 bytes**,
 * never cutting a code point in half.
 */
export function cleanDescription(value: unknown): string

/** Throws Invalid when adding one more would exceed a bound. */
export function assertWithin(key: PlanCountKey, current: number): void
```

`cleanName` and `assertWithin` are **re-implemented here over the same `@repo/contracts` constants**,
not imported from `@repo/microtask-domain`: a `*-domain` package must not import another one
(ADR 0014, and `noProductImports` enforces it). The `LABEL` map here names only the six plan keys.
The duplication is four lines; the alternative is a dependency edge between two products, and the
constants both copies read from are shared already.

`cleanDescription` is the plain-text analogue of ADR 0029's document sanitiser. It is **not** an HTML
sanitiser and there is no HTML here: the value is stored and returned as text, and phase 2 renders it
as text. Byte-measured truncation is called out because the Microtask plan records a byte cap
measured in UTF-16 units shipping past two review gates.

Paths, mirroring `microtask-domain/src/storage/paths.ts` over the kernel's `contained`:

```ts
/** `<root>/macroplan/plans/` — every plan for one product. */
export function plansDir(root: string, product: Product): string

/** `<root>/macroplan/plans/<planId>/` */
export function planDir(root: string, product: Product, planId: string): string

/** `<root>/macroplan/plans/<planId>/plan.json` */
export function manifestFile(root: string, product: Product, planId: string): string

/** `<root>/macroplan/plans/<planId>/items/` */
export function itemsDir(root: string, product: Product, planId: string): string

/** `<root>/macroplan/plans/<planId>/items/<itemId>.json` */
export function itemFile(root: string, product: Product, planId: string, itemId: string): string
```

`plans/` is a **sibling** of `projects/` under the product root, not a child. That is what keeps
`FsProjectStore.listManifests('macroplan')` and `FsPlanStore.listManifests('macroplan')` from ever
seeing each other's directories — and `warmTokenIndex` already walks `PRODUCTS` calling the former,
so the two must not overlap.

- [ ] **Step 1: write the failing tests.** `paths.test.ts`:
      - each builder produces the documented path, asserted with `path.join` and never with a
        literal separator — this repo is developed on win32 and deployed on Linux
      - a plan id that is not a ULID throws `Invalid`, including `'..'`, `'../other'`, `'a/b'` and an
        absolute path. Every builder, not just the first
      - an item id that is not a ULID throws `Invalid`
      - an unknown product throws `Invalid`
      `limits.test.ts`:
      - `cleanDescription` truncates a string of 8 192 ASCII characters to 8 192 bytes unchanged, and
        a string of 4 097 emoji (4 bytes each) to a whole number of code points under the cap with
        **no lone surrogate** at the end — assert by re-encoding and comparing byte length, and by
        asserting the result round-trips through `TextEncoder`/`TextDecoder` unchanged
      - `cleanDescription` turns `'a\r\nb\rc'` into `'a\nb\nc'`, strips `U+0000`, `U+001B` and
        `U+007F`, and keeps `'\n'` and `'\t'`
      - `assertWithin('itemsPerPlan', 1_999)` passes and `assertWithin('itemsPerPlan', 2_000)` throws
        `Invalid` with a message containing `2000` — the cap is tested **at** the cap (spec §4.3)
- [ ] **Step 2: run them and watch them fail.** `pnpm --filter @repo/macroplan-domain test`.
- [ ] **Step 3: write the entities, `limits.ts` and `paths.ts`.**
- [ ] **Step 4: run the suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Give the plan domain its entities, its bounds and its paths"`.

### Task 12: the `PlanStore` port, its contract suite, and two adapters

> **Task 2c runs immediately after this one.** It is written earlier in this document, beside the
> other access-control tasks, but it needs the `PlanStore` port this task defines. Do 2c next.

This task is the phase gate the spec names: *"`PlanStore` contract suite green against fs and
memory"*.

**Files:**
- Create: `packages/macroplan-domain/src/ports/plan-store.ts`
- Create: `packages/macroplan-domain/src/testing/{fixtures,memory-plan-store,plan-store-contract,index}.ts`
- Create: `packages/macroplan-domain/src/testing/memory-plan-store.test.ts`
- Create: `packages/macroplan-domain/src/storage/fs-plan-store.ts`, `src/storage/fs-plan-store.test.ts`

```ts
/** Persistence for plans, with the write ordering that keeps a crash recoverable. */
export interface PlanStore {
  /** Reads every plan manifest, newest update first. A manifest that cannot be decoded is left out. */
  listManifests(product: Product): Promise<readonly PlanManifest[]>

  /** Reads one plan manifest, or null when the plan is absent or its content cannot be decoded. */
  readManifest(product: Product, planId: string): Promise<PlanManifest | null>

  /** Reads one item's description file, or null when it is absent or cannot be decoded. */
  readItem(product: Product, planId: string, itemId: string): Promise<ItemDocument | null>

  /** Writes the manifest alone, for every change that touches no item file. */
  saveManifest(product: Product, manifest: PlanManifest): Promise<void>

  /** Writes the item file, then the manifest, so a crash can only orphan a file (ADR 0006). */
  saveItem(product: Product, manifest: PlanManifest, item: ItemDocument): Promise<void>

  /**
   * Writes the manifest, then removes every named item file, in that order (ADR 0006).
   *
   * Takes a list rather than one id because deleting an epic deletes its features and every item
   * under them, and that must be **one** manifest write. A loop of single deletes republishes the
   * manifest per item, so an interrupted epic delete would leave the plan half-removed in the
   * manifest, which is the state ADR 0006 exists to prevent.
   */
  deleteItems(product: Product, manifest: PlanManifest, itemIds: readonly string[]): Promise<void>

  /** Removes a plan and everything under it, reporting whether it existed. */
  deletePlan(product: Product, planId: string): Promise<boolean>
}
```

There is deliberately **no `publishPlan`**. Microtask needs a whole-project atomic write because a
bulk import builds a project from nothing; Macroplan has no import (spec §12) and nothing that writes
more than one item file and the manifest in one operation.

`MemoryPlanStore` keeps **serialised JSON** in `Map<string,string>`, exactly as `MemoryProjectStore`
does, so a caller mutating a manifest it was handed cannot reach back into the store. That is what
makes the two adapters interchangeable rather than merely similar, and the contract suite pins it.

`FsPlanStore` takes `{ files: FileSystem, root: () => string }` and writes with
`writeTextAtomic(file, JSON.stringify(value, null, 2))`, like `FsProjectStore`.

The contract suite mirrors `describeProjectStore`:

```ts
export interface PlanStoreHarness {
  store: PlanStore
  reset(): Promise<void>
  writeUndecodableManifest?(product: Product, planId: string, raw: string): Promise<void>
  writeUndecodableItem?(product: Product, planId: string, itemId: string, raw: string): Promise<void>
  addContainerWithoutManifest?(product: Product, name: string): Promise<void>
}

export function describePlanStore(name: string, makeHarness: () => PlanStoreHarness): void
```

- [ ] **Step 1: write the port** with its TSDoc, and `testing/fixtures.ts` — `STAMP`, `marked`,
      `planManifest`, `epic`, `feature`, `item`, `itemDocument`, each taking an id and overrides, in
      the style of `microtask-domain/src/testing/fixtures.ts`. Ids come from `marked`, so a failure
      names the entity it is about.
- [ ] **Step 2: write `describePlanStore`** with these cases, and nothing about atomicity — which
      cannot be observed from inside a sequential case and belongs in the adapter's own test:
      - a plan never written reads back as `null`
      - a manifest round-trips
      - an item file and its manifest entry round-trip together
      - the **product is part of the identity**: the same plan id under `'microtask'` reads back
        absent
      - `listManifests` is newest-update-first
      - `deleteItems` removes both the entries and the files, for one id and for twelve
      - `deleteItems` with an id the plan does not name removes the others and throws nothing
      - a manifest entry whose item file is gone is **one unreadable item, not a broken plan**:
        `readManifest` still answers and `readItem` answers `null`
      - `deletePlan` removes everything under it and reports `true`; a plan that was never there
        reports `false`
      - every method rejects a plan id that is not a ULID, a traversal-shaped one included
      - a manifest is copied **deeply on the way out and on the way in**: mutating a nested epic of
        one the store handed back, or of one a caller saved, cannot corrupt the store
      - the same two copy cases for an `ItemDocument`
      - via the optional hooks: an undecodable manifest reads back `null` and is **left out** of
        `listManifests`; an undecodable item reads back `null`; a container holding no manifest is
        left out of `listManifests`
- [ ] **Step 3: run the suite with no adapters.** It must fail to compile, not pass vacuously.
- [ ] **Step 4: write `MemoryPlanStore`** and `memory-plan-store.test.ts`, which is one call to
      `describePlanStore('MemoryPlanStore', …)` and nothing else.
- [ ] **Step 5: run it.** Green.
- [ ] **Step 6: write `FsPlanStore`** and `fs-plan-store.test.ts`: one call to
      `describePlanStore('FsPlanStore', …)` over a `MemoryFileSystem` from `@repo/kernel/testing`,
      **plus** two adapter-only cases the contract cannot bind —
      - `saveItem` writes the **item file before** the manifest: a `FileSystem` double that throws on
        the second `writeTextAtomic` leaves the item file on disk and the manifest as it was
      - `deleteItems` writes the **manifest before** it unlinks: a double that throws on `remove`
        leaves a manifest that no longer names the item and an orphan file, never the reverse
- [ ] **Step 7: run the whole domain suite.** Green against both adapters. **This is the phase
      gate's second half.**
- [ ] **Step 8: the gate**, then commit
      `"Store a plan two ways, and hold both to one contract"`.

### Task 13: `PlanService`

**Files:**
- Create: `packages/macroplan-domain/src/services/{context,refs,plan-service}.ts`
- Create: `packages/macroplan-domain/src/services/plan-service.test.ts`
- Create: `packages/macroplan-domain/src/testing/doubles.ts` — `fixedClock`, `sequentialIds`
- Modify: `packages/macroplan-domain/src/index.ts` and `src/testing/index.ts`

```ts
/** Everything a plan service needs, supplied by whoever constructs it (ADR 0030). */
export interface PlanContext {
  readonly store: PlanStore
  readonly lock: Lock
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly tokens: TokenIndex
}

/** Names one plan. */
export interface PlanRef { readonly product: Product; readonly planId: string }

/** Names one item inside a plan. */
export interface ItemRef extends PlanRef { readonly itemId: string }
```

Named `PlanContext` rather than `ServiceContext` on purpose: `apps/api` imports both domains, and two
exported interfaces called `ServiceContext` differing in one member is a `deps.ts` that compiles for
the wrong reason.

```ts
export class PlanService {
  constructor(ctx: PlanContext)

  /** Lists every plan for a product, newest update first. */
  list(product: Product): Promise<readonly PlanManifest[]>

  /** Reads one plan, or throws NotFound. Takes no lock, so a locked writer may call it. */
  read(at: PlanRef): Promise<PlanManifest>

  /** Creates an empty plan, refusing to exceed `plansPerProduct`. */
  create(product: Product, settings: NewPlan): Promise<PlanManifest>

  /** Changes a plan's name or its calendar settings, leaving its contents alone. */
  update(at: PlanRef, changes: PlanChanges): Promise<PlanManifest>

  /** Removes a plan, everything under it, and the share tokens that pointed at it. */
  remove(at: PlanRef): Promise<void>
}

/** What a new plan is created from. `sprintLengthDays` defaults to 10 and `timezone` to `'UTC'`. */
export interface NewPlan {
  readonly name: string
  readonly startDate: string
  readonly sprintLengthDays?: number
  readonly timezone?: string
}

/** What may change about a plan itself. An absent key leaves that setting alone. */
export interface PlanChanges {
  readonly name?: string
  readonly startDate?: string
  readonly sprintLengthDays?: number
  readonly timezone?: string
}
```

`sprintLengthDays` defaults to **10** — spec §3, two-week sprints in working days. `timezone`
defaults to `'UTC'`, and `update` validates a new one by calling `todayIn(timezone, new Date(0))` and
letting the `RangeError` become an `Invalid`: a zone this runtime cannot resolve must be refused at
the write, not discovered when a canvas fails to draw.

Changing `startDate` or `sprintLengthDays` **moves every derived date and every sprint boundary and
is allowed**. Nothing is rewritten, nothing is pinned in place, and no warning is shown: the schedule
is derived, so moving the origin is the one edit that genuinely means "the whole plan shifts". A
`pinSprint` is an index, so it moves with the grid — which is correct, because a pin means "not
before sprint 5", and sprint 5 is wherever sprint 5 now is.

- [ ] **Step 1: write the failing tests**, each over a `MemoryPlanStore`, a `QueueLock`, a
      `fixedClock` and `sequentialIds`:
      - `create` stamps `createdAt` and `updatedAt` from the injected clock and takes its id from
        the injected generator — never `Date.now()`, never `ulid()` called inline
      - `create` applies the two defaults, and applies a supplied `sprintLengthDays` and `timezone`
        instead
      - `create` refuses a `timezone` `Intl` cannot resolve, with `Invalid`
      - `create` at `LIMITS.plansPerProduct - 1` succeeds; at the cap it throws `Invalid` naming the
        limit
      - `read` of an absent plan throws `NotFound`
      - `update` with `{ name }` changes the name, bumps `updatedAt`, and leaves `startDate`,
        `epics`, `features` and `items` byte-identical
      - `update` with `{ startDate }` changes only that
      - `remove` of an absent plan throws `NotFound`
      - `remove` drops every one of the plan's tokens from the index, so a link to a deleted plan
        resolves to nothing rather than to a container that is gone. `ProjectService.remove` does the
        same; a plan that skipped it would leave live-looking credentials in a process-wide map
      - every mutating method runs inside `lock.run` — assert with a `Lock` double that counts calls,
        because ADR 0006 is a correctness requirement on win32 and not a convention
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: implement the three files** and the two doubles.
- [ ] **Step 4: run the suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Create, read, retime and remove a plan"`.

### Task 14: the three structure services

**Files:**
- Create: `packages/macroplan-domain/src/services/positions.ts`
- Create: `packages/macroplan-domain/src/services/{epic,feature,item}-service.ts`
- Create: `packages/macroplan-domain/src/services/{epic,feature,item}-service.test.ts`
- Create: `packages/macroplan-domain/src/services/cascade.test.ts`
- Create: `packages/macroplan-domain/src/views/plan-view.ts`, `src/views/plan-view.test.ts`
- Modify: `packages/macroplan-domain/src/index.ts`

Three classes rather than one, because ADR 0027 caps a file at 150 lines and one `StructureService`
would be four times that. All three take a `PlanContext`, all take the lock, none calls another.

```ts
export class EpicService {
  add(at: PlanRef, epic: NewEpic): Promise<PlanManifest>
  update(at: PlanRef, epicId: string, changes: EpicChanges): Promise<PlanManifest>
  place(at: PlanRef, epicId: string, railOrder: number): Promise<PlanManifest>
  remove(at: PlanRef, epicId: string): Promise<PlanManifest>
}

export class FeatureService {
  add(at: PlanRef, feature: NewFeature): Promise<PlanManifest>
  update(at: PlanRef, featureId: string, changes: FeatureChanges): Promise<PlanManifest>
  place(at: PlanRef, featureId: string, to: FeaturePlacement): Promise<PlanManifest>
  setDependencies(at: PlanRef, featureId: string, dependsOn: readonly string[]): Promise<PlanManifest>
  remove(at: PlanRef, featureId: string): Promise<PlanManifest>
}

export class ItemService {
  add(at: PlanRef, item: NewItem): Promise<PlanManifest>
  update(at: PlanRef, itemId: string, changes: ItemChanges): Promise<PlanManifest>
  place(at: PlanRef, itemId: string, to: ItemPlacement): Promise<PlanManifest>
  remove(at: PlanRef, itemId: string): Promise<PlanManifest>
  readOne(at: ItemRef): Promise<{ item: PlanItem; description: string }>
  writeDescription(at: ItemRef, description: string): Promise<PlanItem>
}

/** Where a feature is going: which rail, and where along it. */
export interface FeaturePlacement { readonly epicId: string; readonly position: number }

/** Where an item is going: which feature, and where inside it. */
export interface ItemPlacement { readonly featureId: string; readonly position: number }
```

Every `changes` interface distinguishes **absent** from **null**, matching the payloads:
`estimateDays?: number | null` where `undefined` leaves it and `null` clears it. This is the single
most bug-prone line in the group; it gets its own test in each of the three suites.

`positions.ts` holds the one renumbering rule both `place` methods and every `add` use:

```ts
/**
 * Reinserts one id at a position among its siblings and renumbers the group densely from zero.
 *
 * A single move rather than a permutation payload, which is the difference from Microtask's
 * reorder routes: there, a drag reorders a whole visible list; here, a drag moves one bar and
 * every other bar keeps the order it had. A 200-entry permutation on the wire for a one-bar move
 * would be a worse shape and a larger surface to get wrong.
 */
export function placeAmong<T extends { readonly id: string; readonly position: number }>(
  siblings: readonly T[],
  id: string,
  position: number,
): readonly T[]
```

The rules every one of these methods obeys, each of which is a test:

- **New things append after the last sibling** (spec §6): a new item goes after the last item in its
  feature, a new feature after the last feature on its epic's rail, a new epic at the bottom rail.
  The caller supplies no position on `add`.
- **Nothing ever auto-moves.** No method repositions anything the caller did not name, and none
  rewrites an estimate, a pin or an edge to resolve anything (spec §6, §8). Spec §9 makes "a test
  asserts nothing auto-moves" the phase-3 gate; it is written here, where the services are.
- **A cycle is refused at the write.** `setDependencies` runs `findCycles` over the manifest it is
  about to save and throws `Conflict` naming the feature ids in the cycle when one appears. A cycle
  arriving some other way is still reported by `schedule()` rather than breaking a page (spec §6).
- **An edge must name a feature in this plan.** `setDependencies` throws `Invalid` for an unknown id
  and for a self-edge. Edges never cross a plan boundary (spec §4.2, ADR 0050).
- **Deletes cascade and strip edges.** Removing a feature removes its items; removing an epic removes
  its features and their items. In both cases every removed feature id is stripped from every other
  feature's `dependsOn`, and every removed item's file goes in **one** `deleteItems` call.
- **Caps are checked before the write**, with `assertWithin`: `epicsPerPlan`, `featuresPerPlan`,
  `itemsPerPlan`, and `edgesPerPlan` summed across the whole manifest.
- **`binding` and `linkedTaskId` are untouchable.** Neither `EpicChanges` nor `ItemChanges` carries
  them; `add` writes `null`. A test asserts an epic's `binding` survives every other edit unchanged.

The views:

```ts
/** A plan with the schedule derived from it. Derived here, stored nowhere (spec §3.4). */
export function planView(manifest: PlanManifest, principal: Principal): PlanView

/** A plan as a list describes it: settings and counts, never contents. */
export function planListItem(manifest: PlanManifest, principal: Principal): PlanListItem

/** One item with the description its own file holds. */
export function itemView(item: PlanItem, description: string): ItemView
```

`planView` calls `schedule(manifest)` and flattens the result: `days` becomes `spans` sorted by
`(startDay, id)`, `unscheduled` sorted by id, `cycles` as `findCycles` gave them. None of these takes
a principal, because a plan's contents are the same for every role that may read them at all — `view`
and `manage` see identical structure, estimates and schedule.

`planView` takes one **because of `shareLinks`**, and for that alone. The block is present for a
caller the policy clears for `share:read` and **absent — not empty —** for one it does not
(ADR 0013), exactly as `ProjectView.shareLinks` is optional for the same reason. That is not
cosmetic: a `view` holder receiving `shareLinks: []` learns a plan has no links, and one receiving the
array learns every other holder's token, which is a credential dump to a reader who needs none of
them. `planListItem` carries `shareLinkCount` under the same `share:read` gate, so a caller refused
the links is refused the number too.

- [ ] **Step 1: write `positions.test.ts` first** — `placeAmong` renumbers densely from zero, moving
      an id forward, backward, to 0, to the end, past the end (clamped), and to where it already is
      (a no-op that changes no other id's position).
- [ ] **Step 2: write the three failing service suites.** Each covers, for its own level:
      - `add` appends after the last sibling and stamps from the injected clock and ids
      - `add` at the cap throws `Invalid` naming the limit; at one below the cap it succeeds
      - `update` with an absent key leaves the field; with `null` clears it; with a value sets it —
        asserted on `estimateDays` and, for features, on `pinSprint`
      - `place` moves the one named thing and leaves every sibling's relative order intact
      - `place` to another parent (feature to another epic, item to another feature) renumbers
        **both** groups densely
      - `place` naming a parent that is not in this plan throws `Invalid`
      - `remove` of an absent id throws `NotFound`
      - every method runs inside `lock.run`
      And for `FeatureService.setDependencies` specifically:
      - a two-feature cycle throws `Conflict` whose message names both ids, and **nothing is
        written** — the manifest read afterwards is unchanged
      - a self-edge throws `Invalid`
      - an id naming no feature in this plan throws `Invalid`
      - a duplicate id in the list is stored once
      - exceeding `edgesPerPlan` **across the whole manifest** throws `Invalid`, tested at the cap
      And for `ItemService`:
      - `writeDescription` runs `cleanDescription` and writes the **item file before** the manifest
      - `readOne` of an item whose file is missing answers a description of `''` rather than throwing
        — one unreadable file is not a broken plan
- [ ] **Step 3: write `cascade.test.ts`**, which is the group's real risk:
      - deleting a feature removes its items from the manifest **and** their files in one
        `deleteItems` call — asserted by spying on the store
      - deleting an epic removes its features and all their items, again in one call
      - deleting a feature strips its id from every other feature's `dependsOn`, on every rail
      - after any delete, `schedule(manifest)` reports **no cycle and no dangling reference**: assert
        by running it and comparing against a plan built the same way without the deleted branch
      - **nothing auto-moves**: after deleting a feature from the middle of a rail, every remaining
        feature's `position` is renumbered densely but their **relative order** is unchanged, and no
        estimate, pin or edge anywhere else in the plan differs by a single byte
- [ ] **Step 4: run them all and watch them fail.**
- [ ] **Step 5: implement `positions.ts`, the three services and the views.**
- [ ] **Step 6: write `plan-view.test.ts`** — `planView` of a plan with a known structure carries the
      spans Task 10's example test already pinned, `planListItem` carries the three counts and no
      collection, and a `PlanManifest` read back from the store after any of the above contains **no
      `schedule` key**. That last one is the stored-schedule regression this plan most wants to
      prevent.
- [ ] **Step 7: run the whole domain suite.** Green.
- [ ] **Step 8: the gate**, then commit `"Edit a plan's structure without ever moving what was not asked for"`.

### Task 14b: `PlanShareLinkService`

**Files:**
- Create: `packages/macroplan-domain/src/services/share-link-service.ts`
- Create: `packages/macroplan-domain/src/services/share-link-service.test.ts`
- Modify: `packages/macroplan-domain/src/index.ts`

`PlanContext` already carries `tokens` from Task 13, where `PlanService.remove` needed it. It is the
kernel's `TokenIndex` from Task 2c, and it is the **same instance** Microtask's services hold — which
is what makes a token collision across the two products detectable at all.

```ts
export class PlanShareLinkService {
  constructor(ctx: PlanContext)

  /** Mints a link over one plan, recording who granted it. */
  create(at: PlanRef, seat: NewSeat): Promise<{ manifest: PlanManifest; link: ShareLink }>

  /** Renames a link or changes its role, keeping its token. */
  update(at: PlanRef, token: string, changes: SeatChanges): Promise<PlanManifest>

  /** Revokes a link and every link minted through it. */
  revoke(at: PlanRef, token: string): Promise<{ manifest: PlanManifest; revoked: readonly string[] }>
}

/** A seat to mint. `createdBy` is the presenting credential, never the caller's claim. */
export interface NewSeat {
  readonly name: string
  readonly role: Role
  readonly createdBy: string | null
}

/** A new name, a new role, or both. Scope is immutable. */
export interface SeatChanges {
  readonly name?: string
  readonly role?: Role
}
```

Five rules, each carried over from Microtask rather than re-decided, because a second set of share
semantics in one monorepo is how one of them ends up wrong:

- **Scope is always `{ kind: 'plan', planId }`** and is not a parameter. There is one scope a plan link
  can hold (spec §7.1), so `NewSeat` cannot express a wrong one. `update` cannot change it —
  re-scoping is revoke-and-reissue (ADR 0011).
- **`createdBy` comes from the presenting credential**, never from the payload, so a link cannot claim
  a parent it was not minted through (ADR 0010). The route supplies it; the service does not read it
  from anywhere else.
- **Revocation cascades** (ADR 0010): revoking a link revokes every link whose `createdBy` chain
  reaches it, transitively, in one manifest write. The returned `revoked` list is every token dropped.
- **The token index is updated inside the same lock** as the manifest write, and `add` is what refuses
  a collision — so a mint that would clash with a Microtask token fails before the manifest lands.
- **The token is minted by `ctx.ids.token()`**, never by anything in this service.

- [ ] **Step 1: write the failing tests:**
      - `create` mints a `{kind:'plan', planId}` scope for a plan-scoped caller and stores
        `createdBy` as given
      - `create` at `LIMITS.shareLinksPerPlan` throws `Invalid` naming the limit, tested at the cap
      - `create` registers the token in the index, and a `find` on it resolves to
        `{ product, containerId: planId }`
      - `create` whose minted token collides with one a **Microtask project** already holds throws
        `Conflict`, and **the manifest is unchanged** — read it back and compare. This is the case one
        index exists to make possible; with two indexes it is undetectable
      - `update` changes name and role and **keeps the token**; a `scope` or `token` key on the
        changes object does not exist to be sent
      - `update` accepts `''` as a name where `create` refuses it — production data already holds an
        unnamed link and a rename that refused one could not save a link it had just loaded
      - `revoke` of a link that minted two children drops all three, returns all three tokens, and
        removes all three from the index
      - `revoke` of an unknown token throws `NotFound`
      - every method runs inside `lock.run`, asserted with a counting `Lock` double
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: implement the service** and widen `PlanContext`.
- [ ] **Step 4: run the domain suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Mint seats over a plan, with the cascade already decided"`.

---

# Group D — `/v1/macroplan/plans/**`

### Task 15: the mount, the guard, and the plan routes

**Files:**
- Modify: `apps/api/package.json` — `@repo/macroplan-domain` joins `dependencies`; `@repo/schedule`
  joins **`devDependencies`**, because the API never calls `schedule()` itself — the domain's
  `planView` does — and the only file here that imports it is `agreement.test.ts`
- Modify: `apps/api/src/deps.ts` — `readonly planStore: PlanStore`
- Modify: `apps/api/src/runtime.ts` — construct `FsPlanStore` beside `FsProjectStore`
- Modify: `apps/api/src/routes/v1.ts` — `app.route('/macroplan', createMacroplan(deps))`
- Create: `apps/api/src/routes/macroplan/{index,product,params,plan-scoped}.ts`
- Create: `apps/api/src/routes/macroplan/plans/{routes,handlers}.ts`
- Create: `apps/api/src/testing/macroplan-harness.ts`
- Create: `apps/api/src/routes/macroplan/guard.test.ts`, `plans/plans.test.ts`

`createMacroplan(deps)` is `createMicrotask`'s shape exactly, and the ordering rule is the same one
its TSDoc records: **`app.use('*', requirePrincipal(…))` is the first statement after construction
and nothing is mounted before it.** A `.use()` registered after a `.route()` never runs and the
request still answers 200 — no warning, no failing route, only an open endpoint.

`PrincipalResolver` needs a `ProjectStore` for token resolution; Macroplan has no tokens. It is
constructed with `deps.store` (the Microtask one) exactly as `createMicrotask` does, because its job
here is only to resolve a bearer to a principal. Since Task 2c it is constructed with a
`LinkDirectory` per product, so a Macroplan token resolves against `deps.planStore` and a Microtask
one against `deps.store` — and a Microtask principal reaching a plan target is then refused by the
scope rule, which is Task 2's id-collision test.

The four services are constructed once in `createMacroplan` from a `PlanContext` assembled at the
mount, which is the one place the two domains' differing `store` members are told apart:

```ts
const ctx: PlanContext = {
  store: deps.planStore,
  lock: deps.lock,
  clock: deps.clock,
  ids: deps.ids,
}
```

The `lock`, `clock` and `ids` are the **same instances** Microtask's services hold. One `QueueLock`
for the whole process is deliberate (ADR 0006): every write in this API is already serial, and a
second lock would be a second place for the ordering rules to be got wrong.

The routes:

| Method | Path under `/v1/macroplan` | Action | Target |
| --- | --- | --- | --- |
| `GET` | `/plans` | `workspace:list-plans` | `{kind:'workspace'}` |
| `POST` | `/plans` | `workspace:create-plan` | `{kind:'workspace'}` |
| `GET` | `/plans/{planId}` | `plan:read` | `{kind:'plan', planId}` |
| `PATCH` | `/plans/{planId}` | `plan:rename` and/or `plan:retime` | `{kind:'plan', planId}` |
| `DELETE` | `/plans/{planId}` | `plan:delete` | `{kind:'plan', planId}` |

`POST /plans` answers **201** with a `PlanView` body — the numeric `201`, never the string `'201'`,
which is silently ignored and goes out as 200. `DELETE` answers **204** with no body.

`params.ts`:

```ts
/** A route mounted under `/plans/{planId}`. */
export const planParams = z.object({ planId: EntityId })

/** A route under `/plans/{planId}/epics/{epicId}`. */
export const epicParams = planParams.extend({ epicId: EntityId })

/** A route under `/plans/{planId}/features/{featureId}`. */
export const featureParams = planParams.extend({ featureId: EntityId })

/** A route under `/plans/{planId}/items/{itemId}`. */
export const itemParams = planParams.extend({ itemId: EntityId })
```

Each extends `planParams` rather than declaring its own id, for the reason `routes/params.ts` already
records: a parameter that exists only on a parent's mount path is **not emitted** into the document,
so a child declaring only `itemId` tells a client that `planId` does not exist — and an unvalidated
`planId` is an authorization target built from an unchecked string.

`macroplan-harness.ts` builds a fixture plan and reuses `apps/api/src/testing/harness.ts`'s
`testConfig`, `admin()`, `asLink()`, `adminJson()` and `body()` by importing them, adding only:

```ts
/** Every id the macroplan route fixtures address. */
export const PLAN_IDS = { … }

/** Where every guarded macroplan path hangs. */
export const MACROPLAN_PREFIX = '/v1/macroplan'

/** A fresh app over a fixture plan: three epics, six features with two edges, nine items. */
export async function buildMacroplanApp(at?: Clock): Promise<OpenAPIHono<ApiEnv>>
```

The fixture plan is deliberately the one from Task 10's cross-rail example, so an API response can be
checked against spans a unit test already pinned.

- [ ] **Step 1: write `guard.test.ts` first**, before any route exists. It is the security gate:
      - no credentials → 401 on `/v1/macroplan/plans`
      - a valid `x-api-key` and no bearer → 401
      - an **unmatched path** under `/v1/macroplan/` answers 401 before 404, so a token cannot map
        the API by probing
      - **every Microtask share token in `TOKENS` is refused with 403** on `GET /plans`,
        `GET /plans/{planId}`, `POST /plans` and `DELETE /plans/{planId}` — including
        `TOKENS.p1Manage`, and including a request whose `planId` **equals** `IDS.p1`. Ids are
        per-product; a collision must not be a grant
      - **and the reverse**: a plan `manage` token is refused with 403 on
        `GET /v1/microtask/projects/{IDS.p1}`, on a `projectId` equal to its own `planId`
      - the two collection routes refuse **every** plan link role, `manage` included — there is no
        scope in which "every plan" is a question a seat may ask (ADR 0009)
      - a plan `view` token is cleared on `GET /plans/{planId}` and refused on `PATCH` and `DELETE`
      - a plan `write` token is cleared on `POST /features` and refused on `DELETE /features/{id}`
        and on every `share-links` route — spec §10's "`write` cannot become `manage`", asserted over
        the wire as well as in the kernel
      - the admin is cleared on all five
- [ ] **Step 2: run it and watch it fail** — `pnpm --filter api test` cannot even resolve the mount.
- [ ] **Step 3: rebuild the packages first.**
      `pnpm --filter @repo/kernel --filter @repo/contracts --filter @repo/schedule --filter @repo/macroplan-domain build`
      `apps/api` loads `@repo/*` from `dist/`; without this the API suite is testing yesterday's
      packages and will report failures that have already been fixed.
- [ ] **Step 4: wire `deps.ts`, `runtime.ts` and `v1.ts`**, then write the mount, `product.ts`,
      `params.ts`, `plan-scoped.ts` and the five plan routes and handlers.
- [ ] **Step 5: write `plans.test.ts`:**
      - `POST /plans` → 201, body is a `PlanView`, `Location`-free, and a subsequent `GET` returns it
      - `POST /plans` with no `startDate` → 422 naming `json` as the target
      - `POST /plans` with `startDate: '2026-1-5'` → 422
      - `GET /plans` returns `PlanListItem`s with **no** `epics`, `features` or `items` key
      - `GET /plans/{planId}` carries a `schedule` whose `spans` match the unit-tested fixture
        exactly
      - `GET /plans/{missing}` → 404; `GET /plans/not-a-ulid` → 422. The two are different failures a
        client acts on differently
      - `PATCH /plans/{planId}` with `{}` → 422
      - `DELETE /plans/{planId}` → 204 with an empty body, and the plan is then 404
      - the created plan's stored manifest has **no `schedule` key** — read it back through the
        harness's store, not through the route
- [ ] **Step 6: run the API suite.** Green, and every pre-existing Microtask route test still passes.
- [ ] **Step 7: the gate**, then commit `"Serve plans behind a guard no share token can pass"`.

### Task 16: epics, features and items

**Files:**
- Create: `apps/api/src/routes/macroplan/epics/{routes,handlers,app}.ts`
- Create: `apps/api/src/routes/macroplan/features/{routes,handlers,app}.ts`
- Create: `apps/api/src/routes/macroplan/items/{routes,handlers,app}.ts`
- Create: `apps/api/src/routes/macroplan/{epics,features,items}/*.test.ts`
- Modify: `apps/api/src/routes/macroplan/plan-scoped.ts` — mount the three

| Method | Path under `/plans/{planId}` | Body | Action |
| --- | --- | --- | --- |
| `POST` | `/epics` | `CreateEpicPayload` | `epic:create` |
| `PATCH` | `/epics/{epicId}` | `UpdateEpicPayload` | `epic:rename` |
| `PATCH` | `/epics/{epicId}/placement` | `EpicPlacementPayload` | `epic:reorder` |
| `DELETE` | `/epics/{epicId}` | — | `epic:delete` |
| `POST` | `/features` | `CreateFeaturePayload` | `feature:create` |
| `PATCH` | `/features/{featureId}` | `UpdateFeaturePayload` | `feature:rename` **and** `feature:estimate` |
| `PATCH` | `/features/{featureId}/placement` | `FeaturePlacementPayload` | `feature:place` |
| `PUT` | `/features/{featureId}/dependencies` | `DependenciesPayload` | `feature:depend` |
| `DELETE` | `/features/{featureId}` | — | `feature:delete` |
| `POST` | `/items` | `CreateItemPayload` | `item:create` |
| `GET` | `/items/{itemId}` | — | `plan:read` |
| `PATCH` | `/items/{itemId}` | `UpdateItemPayload` | `item:rename` **and** `item:estimate` |
| `PATCH` | `/items/{itemId}/placement` | `ItemPlacementPayload` | `item:place` |
| `PUT` | `/items/{itemId}/description` | `DescriptionPayload` | `item:describe` |
| `DELETE` | `/items/{itemId}` | — | `item:delete` |

Two routes gate on **two** actions because their payload carries two authorities: a `PATCH` that
changes only `name` needs `feature:rename`, and one that touches `estimateDays` needs
`feature:estimate` as well. Both are `write` today, so the distinction buys nothing yet — it is
declared because the pair is the obvious first place a later role split would land, and a handler that
authorizes on the union of what its body actually touches cannot be wrong later. The handler asks for
each action a present key implies, and never for one the body omitted.

Every mutating route returns the whole `PlanView`, **200**, including its freshly derived schedule.
That is deliberate: every structural edit can move every bar on the canvas, so a response carrying
only the changed entity would leave the client to re-derive or re-fetch, and phase 3's optimistic
drag needs the authoritative answer in the same round trip. `POST` routes return 200 rather than 201
for the same reason — the body is the plan, not the created thing. `GET /items/{itemId}` returns an
`ItemView`; `DELETE` returns the `PlanView`, not 204, because the plan that remains is the point.

Each subtree is its own `OpenAPIHono<ApiEnv>` mounted by `plan-scoped.ts`, mirroring
`microtask/tasks/app.ts`.

- [ ] **Step 1: write the failing tests**, one suite per subtree:
      - **epics:** create appends at the bottom rail; `placement` moves a rail and renumbers densely;
        delete cascades — the response's `features` and `items` no longer carry anything under it,
        and the harness store shows the item **files** gone; an unknown `epicId` → 404; a malformed
        one → 422
      - **features:** create at `LIMITS.featuresPerPlan` → 422 naming the limit, tested **at** the
        cap; `PATCH` with `{ estimateDays: null }` clears it and the response's `schedule` moves that
        feature into `unscheduled` with `reason: 'no-estimate'`; `PATCH` with `{ pinSprint: 3 }`
        moves its span to day `3 * sprintLengthDays` **and every feature after it on its rail**;
        `placement` onto another epic's rail re-schedules both rails
      - **dependencies:** a cycle → **409** with a `conflict` code whose detail names both feature
        ids, and a subsequent `GET` proves nothing was written; a self-edge → 422; an id from another
        plan → 422 (spec §4.2 — edges never cross a plan boundary, and this is where that is
        enforced); a valid edge moves the dependent feature's `startDay` and appears in no `cycles`
      - **items:** create appends after the last item in its feature and the feature's span **grows
        by that item's estimate**, which is contiguity asserted through the wire; `PUT
        /description` with 9 000 bytes stores 8 192 and `GET` returns the truncated value with no
        lone surrogate; `DELETE` shrinks the feature's span by exactly that item's estimate
      - **the reserved fields:** a `PATCH` body carrying `binding` or `linkedTaskId` is **ignored**,
        not honoured — `UpdateEpicPayload` and `UpdateItemPayload` do not declare them, so the
        assertion is that the stored value is still `null` after such a request. Spec §9 reserves
        these for phase 4, and this is the test that keeps phase 1 from quietly writing one
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: rebuild the packages**, then write the nine files and mount them.
- [ ] **Step 4: run the API suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Edit a plan over HTTP, and answer with the whole timeline"`.

### Task 16b: the share-link routes, and the bootstrap call

**Files:**
- Create: `apps/api/src/routes/macroplan/share-links/{routes,handlers,app}.ts`
- Create: `apps/api/src/routes/macroplan/shares/{routes,handlers}.ts`
- Create: `apps/api/src/routes/macroplan/share-links/share-links.test.ts`
- Create: `apps/api/src/routes/macroplan/shares/shares.test.ts`
- Modify: `apps/api/src/routes/macroplan/{index,plan-scoped,params}.ts`

| Method | Path under `/v1/macroplan` | Body | Action |
| --- | --- | --- | --- |
| `GET` | `/shares/current` | — | none — it describes the caller's own credential |
| `POST` | `/plans/{planId}/share-links` | `CreatePlanShareLinkPayload` | `share:create`, against **`own-scope`** |
| `PATCH` | `/plans/{planId}/share-links/{token}` | `UpdateShareLinkPayload` | `share:update` |
| `DELETE` | `/plans/{planId}/share-links/{token}` | — | `share:revoke` |

There is no `GET /share-links`: a plan's links arrive inside `PlanView.shareLinks`, present only for a
caller cleared for `share:read`, so there is one gate and one shape rather than two of each.

`CreatePlanShareLinkPayload`, **not** Microtask's `CreateShareLinkPayload`. They differ in the one field
that decides this route's behaviour: Microtask's carries an optional `ProjectScope`, so a body naming
`{kind:'plan', planId}` fails that discriminated union and the route answers **422** — where Step 1
below requires the key be **stripped**. A plan has exactly one shareable scope and its id is already in
the path, so the Macroplan payload takes `{name, role}` and nothing else, and an unrecognised `scope`
key is dropped rather than refused. `UpdateShareLinkPayload` **is** reused as it stands: it is already
closed to name and role, and it carries no refinement, so nothing in it is Microtask-specific.

`params.ts` gains `planShareLinkParams = planParams.extend({ token: ShareToken })`. The token is a path
segment because it names the **link being acted on**, never the caller — whose own credential stays in
the `Authorization` header, which is what keeps it out of server logs and `Referer` (ADR 0013).

`share:create` is authorized against `'own-scope'`, not against the plan. `capabilities.ts` already
records why: the narrowest scope a holder can mint over is the one it already holds. For a plan-scoped
holder that is the same plan, so the check is `{kind:'plan', planId}` — but it is written as the
caller's own scope so the rule stays true if an epic variant is ever added.

`/shares/current` is the route a client calls to learn what it may do before drawing anything. It
returns the caller's role, scope and the `capabilities()` projection. **Mirror
`microtask/shares/handlers.ts` exactly — including its `authorize` call**, which is
`authorize(c, 'plan:read', { kind: 'plan', planId })` against the caller's own scope root.

An earlier draft of this plan said this route calls no `authorize`, on the reasoning that refusing a
caller the right to ask about their own credential would make the bootstrap unreachable. **That is
wrong, and Task 2c is what makes it wrong.** Once `PrincipalResolver` resolves tokens for both
products, a *Microtask* token presented here resolves to a principal whose scope has no `planId` —
so an unguarded handler would read `undefined`, look up a plan by it, and answer 404 or worse.
Microtask's own `/shares/current` has always guarded exactly this way, and its TSDoc says why: the
gate is what holds the line on the day the other product's links resolve too, because `plan:read` on
a plan target is refused to a project scope by the policy rather than by anything written in the
handler. The bootstrap stays reachable — a holder asking about *its own* scope is cleared by
`plan:read`, which every plan role has.

- [ ] **Step 1: write the failing tests:**
      - `POST` as a plan `manage` holder mints a link whose `scope` is `{kind:'plan', planId}` and
        whose `createdBy` is **the presenting token** — assert it equals the caller's own, not `null`
      - `POST` as a plan `write` holder → **403**. This is the `write`-cannot-become-`manage` boundary
        at its most dangerous point: a `write` holder who could mint would mint themselves `manage`
      - `POST` as the admin mints with `createdBy: null`
      - `POST` with a `scope` in the body naming a **different** plan has it **stripped**, not
        honoured — the minted link's scope is the caller's plan. A payload that could re-scope a mint
        is a privilege escalation with a JSON body
      - `PATCH` changes name and role, keeps the token, and a `scope` key in the body is stripped
      - `DELETE` revokes, cascades to children, answers 204, and every revoked token then 401s on
        `GET /plans/{planId}` — asserted by actually presenting one
      - `DELETE` of a token belonging to **another plan** → 404, not 403: a 404 confirms nothing about
        whether that link exists
      - `GET /plans/{planId}` as a `manage` holder **carries** `shareLinks`; as `view` and as `write`
        the key is **absent**, not `[]` — `expect('shareLinks' in body).toBe(false)`
      - `GET /plans` as the admin carries `shareLinkCount`; there is no non-admin case, the route
        being admin-only
      - `GET /shares/current` answers for a plan token with its role, scope and capabilities, and
        **401s** for no credential
- [ ] **Step 2: run them and watch them fail.**
- [ ] **Step 3: rebuild the packages**, then write the five files and mount them.
- [ ] **Step 4: run the API suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Hand out a plan, and let a holder ask what they hold"`.

### Task 17: the document, and the cross-checks

**Files:**
- Modify: `apps/api/openapi.json` (regenerated, never hand-edited)
- Create: `apps/api/src/routes/macroplan/agreement.test.ts`

- [ ] **Step 1: regenerate the document.**
      `pnpm --filter api build && pnpm --filter api openapi:emit`
      It writes nothing and exits 1 on a schema-generation failure — an unnamed component or a
      duplicate `.meta({ id })` across two schemas is the usual cause.
- [ ] **Step 2: run the emit test.** `pnpm --filter api test -- emit-openapi` — the committed
      document must match a freshly generated one. A stale `openapi.json` is a lie a client is built
      from.
- [ ] **Step 3: write `agreement.test.ts`**, three assertions that no single-package suite can make:
      - **the API's schedule and the package's schedule agree.** Take the fixture plan's manifest
        from the harness store, call `schedule()` on it directly, and assert the flattened result is
        deeply equal to the `schedule` block of `GET /plans/{planId}`'s body. §4.1's whole argument
        for a shared package is that two implementations would disagree; this is the test that would
        catch one appearing
      - **every macroplan handler calls `authorize`.** `grep -c 'authorize(' src/routes/macroplan`
        equals the handler count, asserted by reading the files. `authorize` throws rather than
        returning a boolean precisely so that *not calling it* is the only remaining way to be
        unguarded, and that is greppable
      - **`ProblemCode` still covers every code these routes emit.** The existing contract test
        enumerates `MEANINGS` plus the three 401s; assert the macroplan routes introduce no code
        outside `PROBLEM_CODES`
      - **`PENDING_ROUTES` is empty, and the set is deleted.** `authorize-targets.test.ts` carries a
        set of actions that have no route yet, so its target-table cross-check passes while 24
        Macroplan rows are unconfirmed. Every one of those routes exists by the end of Task 16b. The
        scan reads the whole `routes/` tree, so a handler gating on a **literal** action clears its
        own entry — but a handler gating on a computed one does not, and nothing else retires the
        remainder. An allowance that outlives its debt is indistinguishable from a hole.
- [ ] **Step 4: run the API suite.** Green.
- [ ] **Step 5: the gate**, then commit `"Publish the document, and prove both schedules agree"`.

---

# Group E — the record

### Task 18: four ADRs and the final audit

**Files:**
- Create: `docs/adr/0048-macroplan-schedules-it-does-not-store-dates.md`
- Create: `docs/adr/0049-per-rail-forward-pass-in-one-pure-package.md`
- Create: `docs/adr/0050-the-plan-directory-is-the-unit.md`
- Create: `docs/adr/0051-estimate-authored-at-any-level-children-win.md`
- Create: `docs/adr/0053-a-plan-is-shared-at-plan-scope.md`
- Create: `docs/adr/0054-one-token-index-identity-stays-a-capability.md`
- Modify: `docs/adr/0038-capabilities-role-and-scope.md` — an amendment noting the plan scope and the
  widened cross product, since that ADR's agreement argument is what now covers twenty-four more actions
- Modify: `docs/superpowers/specs/2026-09-22-macroplan-design.md` — §11's table marks 0048–0051, 0053
  and 0054 written and leaves 0052 to phase 4

Each ADR follows the form of the forty-seven before it: context, decision, consequences, and the
alternative it rejects. The content each must carry:

- **0048 — Macroplan schedules, it does not store dates.** A plan holds exactly one date. The
  schedule is derived on every read and cached nowhere, which is a **deliberate departure** from
  ADR 0007: progress is cached because deriving it means reading every task *file*, while a schedule
  derives from the manifest alone. Record it so nobody later "fixes" the inconsistency by adding a
  cache. Consequence: `O(n)` per read over at most 2 000 items, and `PlanManifest` must never grow a
  `schedule` field — the test in Task 14 step 6 and Task 15 step 5 is the enforcement.
- **0049 — Per-rail forward pass, in one pure package both sides import.** Why each epic advances
  independently, why `@repo/schedule` is a package and not a module in `@repo/contracts` or
  `@repo/macroplan-domain` (an app may never import a `*-domain` package, whose barrel reaches
  `node:path` and `node:crypto`), and why `schedule` is total — a cycle is returned and rendered, not
  thrown. Include the DST decision: all calendar arithmetic runs on UTC-midnight instants, and the
  plan's `timezone` is read by `todayIn` alone.
- **0050 — The plan directory is the unit; edges never cross it.** Mirrors ADR 0004. A plan directory
  is wholly present or wholly absent; a cross-plan dependency would break that invariant for no
  stated need, and `setDependencies` refuses one at the write.
- **0051 — Estimate is authored at any level; children win, and the gap is shown.** The authored
  value is kept and never overwritten; children win when **at least one** carries an estimate; the
  discrepancy is the product's most useful number and is rendered rather than resolved.

- **0053 — A plan is shared at plan scope, by the share-link system that already exists.** Record
  first the invariant the whole scope rewrite exists to protect, because it matters outside
  `policy.ts` — to whoever writes Macroplan's id generator, and to whoever adds the next target kind:
  **the two products' ids are drawn from separate ULID sequences and may collide, so a scope or
  target that named both roots would turn a collision into a grant.** Today that fact lives only in
  a TSDoc block in `packages/kernel/src/access/scope.ts`, which is not where a package outside the
  kernel will look. Then: one `Scope`
  variant, the three roles spec §7.1 defines, and the line between `write` and `manage`: `write`
  changes what the work is and what it costs, `manage` changes where it sits and what the plan is.
  Record why epic scope is **deferred and not foreclosed** — `Scope` is a discriminated union, so the
  variant is additive, while the cross-rail dependency arcs an epic-scoped holder would see pointing at
  refused features are a phase-2 rendering problem nobody has a use case for yet. Record that
  `epic:bind` is admin-only and why: the binding role is the ceiling on everything §7.3 composes, and a
  holder who could re-role it could raise their own ceiling.
- **0054 — One token index for both products, and identity stays a capability until there are users.**
  Why the index is keyed by token and answers `{product, containerId}`: a bearer is an opaque string,
  so the index is what *tells* you which product owns it, and a per-product index would have to be
  asked twice. Then the SSO question, answered rather than left open — there is no identity here to
  federate (one `ADMIN_PASSWORD`, and tokens carrying a capability and no person); what looks like an
  identity problem is capability **attenuation** across a trust boundary, which `can()` already
  expresses and §7.3 resolves in one `min`; an IdP would invalidate ADRs 0012, 0013, 0040 and 0047 and
  buy nothing until there is more than one human. **State the trigger that reverses it:** the day this
  product has named users rather than one admin password. Also record why the kernel's `GRANTS` and
  `capabilities()`'s `ROWS` are **not** collapsed into one table — `@repo/contracts` holds
  `@repo/kernel` as a devDependency only so `node:crypto` never reaches a browser bundle, so neither
  can import the other at runtime, and the exhaustive agreement test is the consolidation.

ADR **0052** (an epic binds to a Microtask project by a sealed share token) is **not** written here.
Phase 1 reserves the fields and decides nothing about the bridge; spec §12 leaves who mints the token
undecided, and an ADR recording a decision that has not been taken is worse than an absent one.

- [ ] **Step 1: write the four ADRs.**
- [ ] **Step 2: update spec §11's table.**
- [ ] **Step 3: the full cold gate.** Delete `.next` first, then
      `npx turbo run build typecheck lint test --force`. Green, `Cached: 0` on every task.
- [ ] **Step 4: `node scripts/check-exports.mjs`** exits 0, and its output lists `@repo/schedule`.
- [ ] **Step 5: confirm the phase gate the spec names.** Both halves, by name:
      - `pnpm --filter @repo/schedule test` — the nine property tests over 1 000 seeds each, green
      - `pnpm --filter @repo/macroplan-domain test` — `describePlanStore` green against both
        `MemoryPlanStore` and `FsPlanStore`
- [ ] **Step 6: confirm the phase-1 boundary held.** `git diff --stat main -- apps/macroplan` is
      **empty**: phase 1 ships no UI, and a single file changed there means scope crept.
- [ ] **Step 6b: every forward ADR citation now resolves.** Code written in earlier tasks cites ADRs
      that this task creates — `contained.ts` names ADR 0050 before ADR 0050 exists. Grep the whole
      source tree for `ADR 00(4[89]|5[0-4])` and confirm each number has a file in `docs/adr/`. A
      TSDoc citing an ADR that was never written is a dead reference a reader cannot follow, and it
      is invisible until someone tries.
- [ ] **Step 6c: `packages/kernel/src/storage/` holds more than one module, or it is flattened.**
      Task 1 created that directory for `contained.ts` alone. The kernel's two existing
      subdirectories (`access/`, `ports/`) each launched with five files, while its single-purpose
      primitives (`ids.ts`, `errors.ts`, `product.ts`) sit flat — and the barrel already exports
      `contained` in the flat-primitives group, so the directory and the export site disagree. If
      nothing else landed in `storage/`, move it to `packages/kernel/src/contained.ts`.
- [ ] **Step 7: confirm nothing stores a schedule.**
      `grep -rn "schedule" packages/macroplan-domain/src/entities packages/contracts/src/plan.ts`
      returns nothing. ADR 0048 is only as strong as this.
- [ ] **Step 8: commit and push the feature branch.**
      `git commit -m "Record the four decisions phase 1 took"`, then
      `git push origin feat/macroplan-timeline`. **Never `main`** — Coolify deploys it (ADR 0022).

---

## Verification targets, and where each is met

Spec §10's table, resolved to tasks. A row with no task is a gap; there are none.

| Spec §10 row | Met by |
| --- | --- |
| `schedule()` — adding an edge never moves anything earlier | Task 10, property "monotonicity" |
| `schedule()` — a pin is never violated | Task 10, property "pins hold" |
| `schedule()` — every cycle is reported and everything outside it still schedules | Task 10, property "cycles are contained", plus the example case |
| `schedule()` — output independent of input ordering | Task 10, property "order independence" |
| calendar — a plan starting on each of the seven weekdays | Task 7 |
| calendar — a sprint spanning a year boundary | Task 7 (including two leap years) |
| calendar — a DST transition inside a sprint | Task 7 (Europe/Belgrade against UTC) |
| calendar — the stated timezone, not the server's | Task 7 (`todayIn`, two zones one instant) |
| feature contiguity, for every arrangement of pins and edges | Task 10, property "contiguity" |
| `PlanStore` — the port-contract pattern against fs and memory | Task 12 |
| caps — 2 000 items accepted, 2 001 refused with a named code | Task 4 (schema), Task 11 (`assertWithin`), Task 16 (over the wire) |
| the role model — `capabilities()` agrees with `can()` across every tuple, plan scope included | Task 2b, by the existing exhaustive agreement test |
| cross-product isolation — a Microtask token refused on a `planId` equal to its `projectId`, and the reverse | Task 2 (kernel), Task 15 step 1 (over the wire) |
| the token index — one token, one container, across both products | Task 2c step 2, the collision case |
| `write` cannot become `manage` | Task 2 (each action by name), Task 15 step 1 and Task 16b step 1 (the mint refusal) |
| layout — pure functions, no DOM | **Phase 2.** Not in scope here |
| the bridge — revoked token, deleted project, a `view` holder denied a task name, `effectiveBridgeRole` | **Phase 4.** Phase 1 proves the fields stay `null` (Task 16) and that `epic:bind` is admin-only (Task 2) |

Two rows are deferred by design and named in "What phase 1 does not ship". Everything else is met.
