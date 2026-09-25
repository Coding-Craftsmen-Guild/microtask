# Macroplan: the timeline of record

**Status:** designed, not built
**Date:** 2026-09-22
**Branch:** `feat/macroplan-timeline`
**Follows:** [the shell design](2026-09-22-macroplan-shell-design.md), whose §6 left this undesigned
**Decisions this spec creates:** ADRs 0048–0056 (§11), all nine written, plus 0057–0063 the phases added
**Amended:** 2026-09-22 — §7 split into the outward link and the inward one. The first draft had no
notion of sharing a plan at all, and the phase 1 plan had written "every Macroplan action is
admin-only" on the strength of that silence.

---

## 1. What Macroplan is

Macroplan is **the timeline of record**. It owns structure, estimates, order and dependencies. It
owns no content, no checklists and no second editor. A bar is green because a linked Microtask task
said so.

That last clause is the product. Every planning tool can draw a bar; the ones that rot are the ones
where a human types the percentage. Microtask already computes real `{ done, total }` from checklist
documents ([ADR 0007](../../adr/0007-progress-derived-then-cached.md)), and the shell design's §6
already named the mechanism for reaching it — a share-link token, never an admin credential. This
spec is what that mechanism is *for*.

## 2. The one idea that makes it work

**No date is ever typed.**

A plan has exactly one date: its `startDate`. Everything else is an estimate in days. Calendar
position, quarter bands, sprint ticks, the today line and lateness are all *derived* from the start
date plus a running total of estimates.

This was not the first design. The first design had authored start/end dates on every level, a
baseline captured at a "commit the plan" ceremony, and a slip computed against it. It was rejected
in one sentence — *"managing dates would be hell"* — and the sentence is right. Authored dates on a
three-level hierarchy mean every estimate change is a manual reschedule of everything downstream,
and the tool becomes a drawing that is wrong by the second week.

Removing dates removes the baseline problem too. With derived positions, **"late" is not a date
comparison**: an item whose sprint has ended and whose progress is under 100% is a **carry-over**,
and the count of carry-overs is the slip signal — free, honest, and impossible to clear by dragging
something to the right.

## 3. The model

```
Plan        id · name · startDate · sprintLengthDays (default 10 working days) · timezone
 └ Epic     id · name · colour · railOrder · binding?
    └ Feature  id · name · estimateDays? · pinSprint? · dependsOn: FeatureId[]
       └ Item  id · name · estimateDays? · linkedTaskId? · description
```

Three levels, named **Epic / Feature / Item**. The third is not called Task: Microtask owns that
word, the types would compile fine under [ADR 0014](../../adr/0014-namespace-products-now.md)'s
namespacing, and every human conversation in this repository afterwards would need a disambiguating
adjective. "A Macroplan **item** links to a Microtask **task**" is a sentence that stays readable.

A **milestone** is an item or feature with an estimate of zero. It renders as a diamond on the rail
and occupies no time. There is no separate entity.

### 3.1 The scheduling rule

One forward pass over the graph, per rail:

```
start(x) = max( end of the previous sibling on x's rail,
                end of every feature x depends on,
                first day of x.pinSprint )

end(x)   = start(x) + effectiveEstimate(x)
```

`x.railOrder` makes "previous sibling" well defined. Each epic advances **independently** — three
epics are three teams working in parallel, and the plan's length is its critical path, not the sum
of all work. Dependency edges are the only thing that couples one rail to another, which is exactly
what makes the result look like a git graph: lanes advancing on their own, arcs where they actually
meet.

The rule above schedules **features on their epic's rail**. Inside a feature, items simply flow in
their own order, starting at the feature's start — so **a feature is a contiguous block**: it has no
internal gaps, and its span equals the sum of its items. Contiguity is what makes an edge between
two features mean something at the year rung, and it is why edges exist at the feature level and
nowhere else (§8).

`pinSprint` is the escape hatch for work that waits on something outside the plan — a conference, an
audit, a contract date. It is one nullable integer, it exists on features only, and it joins `max()`
as one more lower bound, so the forward pass is unchanged. It is the *only* way a fixed point in
time enters the model.

An estimate is a **non-negative integer number of working days**. Zero means a milestone. Days are
working days throughout — the forward pass counts in them, and only the final day-offset→calendar
mapping skips weekends, using the plan's `timezone` rather than the server's.

### 3.2 Estimates, and the number that matters

`effectiveEstimate(x)` is the sum of `x`'s children when it has any, and its own authored estimate
when it has none.

Both may exist at once. An executive sketching a year types *"Checkout: 40d"* before a single item
exists; a team later breaks it into items totalling 62 days. The authored 40 is **kept, not
overwritten**, and the pair is rendered as a discrepancy: *planned 40d · broken down to 62d · +22d*.

That gap is the most useful number in the application. It is where a macro plan is wrong, stated in
days, before anything is late.

An item with no estimate and no children cannot be scheduled. It sits on an **unscheduled rail**
below the canvas rather than being given a fabricated duration.

### 3.3 Sprints are gridlines, not containers

A sprint is `sprintLengthDays` of working days measured from `startDate`. Nothing is ever *assigned*
to a sprint; sprint 5 is simply where the arithmetic lands. An item therefore **may straddle a sprint
boundary**, and does so silently.

There is no capacity, no over-commitment warning, and nothing blocks a drop. This was decided
explicitly against the alternative — *"it's just a track of time, we try to follow it, but if
something takes more, we're doing wrong planning somehow"*. Capacity would have required a notion of
people or teams to be meaningful, and neither exists in this product.

### 3.4 The schedule is derived on read and never stored

[ADR 0007](../../adr/0007-progress-derived-then-cached.md) caches progress in the manifest because
deriving it requires reading every task *file*. The schedule derives from the manifest **alone** — a
plan's entire structure is one read — so caching it would buy nothing and would create a class of
staleness bugs that cannot otherwise exist. The forward pass is not `O(n)`, which an earlier draft
of this sentence claimed: the relaxation sweep is Bellman-Ford shaped, `O(n·(n+e))` over **features**
(`packages/schedule/src/relax.ts`), with the `O(i log i)` item sorts beneath it. At this product's
own caps — 200 features, 400 edges, 2 000 items — that is on the order of 10^5 operations and
sub-millisecond, which is what lets phase 3 re-run the whole pass per pointer move rather than patch
it incrementally. The `O(n)` was the items half of the work, mistaken for all of it.

This is a deliberate departure from 0007's shape, recorded so that nobody later "fixes" the
inconsistency by adding a cache.

## 4. Architecture

| Where | What | Why there |
| --- | --- | --- |
| `@repo/contracts` | plan/epic/feature/item/edge schemas, limits, problem codes | [ADR 0036](../../adr/0036-wire-facts-live-in-contracts.md) — wire facts live here |
| **`@repo/schedule`** *(new)* | the forward pass, cycle detection, day→sprint→calendar arithmetic, layout maths | pure, no node builtins |
| `@repo/macroplan-domain` | entities, `PlanStore` port, fs + memory implementations, its contract suite, services | mirrors `microtask-domain` |
| `apps/api` | `/v1/macroplan/plans/**` under the existing service-key and principal guards | [ADR 0013](../../adr/0013-one-route-tree-two-principals.md) |
| `apps/macroplan` | plan list, canvas, drawer | the shell already exists |

### 4.1 Why `@repo/schedule` is its own package

The API derives the schedule to answer a read; the browser derives it to show a drag before the
round trip completes. If those are two implementations they will disagree, and the disagreement will
present as a bar that jumps when you let go of it.

It cannot live in `@repo/macroplan-domain`: an app may never import a `*-domain` package, because the
domain barrel reaches `node:path` and `node:crypto` (ADR 0001, [0027](../../adr/0027-code-style-solid-enforced.md)).
It could live in `@repo/contracts`, and there is precedent — `capabilities()`, `countTasks()` and
`emptyDocument()` all sit there. It gets its own package anyway because it is the one piece of real
algorithm in this product, it has no dependency on Zod or on the wire at all, and a package boundary
is what keeps it testable as pure input→output with no HTTP and no React anywhere near it.

Its public surface is small and total:

```ts
schedule(plan: PlanStructure): ScheduleResult
// { days: Map<id, { startDay, endDay }>, cycles: readonly Cycle[], unscheduled: readonly Id[] }

sprintOf(day: number, plan: PlanCalendar): number
rangeOfSprint(n: number, plan: PlanCalendar): { from: IsoDate, to: IsoDate }
```

`schedule` never throws and never partially fails. A graph containing a cycle returns the cycle in
`cycles` and schedules everything not in it, so the canvas still renders and the conflict is shown
rather than the page being lost.

### 4.2 Storage

Mirrors [ADR 0005](../../adr/0005-manifest-plus-task-files.md): a `plan.json` manifest holds **all**
structure — names, colours, rail order, estimates, pins, edges, links — and one small file per item
holds its description. The canvas is therefore one read, and a description is loaded only when the
drawer opens it. Write ordering per [ADR 0006](../../adr/0006-write-ordering-not-transactions.md):
item file first, manifest second.

**Edges never cross a plan boundary.** A plan directory is wholly present or wholly absent, the same
invariant [ADR 0005](../../adr/0005-manifest-plus-task-files.md) gives a project; a cross-plan
dependency would break it, and there is no user need for one. (An earlier draft cited ADR 0004 here.
0004 decides the *hierarchy* — renaming Project to Task and adding a Project above it with one-level
folders — and says nothing about directories. Directory-as-unit is 0005, with
[ADR 0018](../../adr/0018-sniff-by-directory-group.md) deciding what makes a directory a recognised
one.)

There are **many plans**, one directory each, so next year can be drafted without disturbing this
one.

### 4.3 Caps

Stated, and tested *at* the cap rather than near it:

| Limit | Value |
| --- | --- |
| epics per plan | 40 |
| features per plan | 200 |
| items per plan | 2 000 |
| dependency edges per plan | 400 |
| description bytes per item | 8 192 |

The canvas renders 2 000 items as SVG. That is fine; 20 000 is not, which is why the cap is a
refusal at the API and not a guideline.

## 5. The canvas

Detail level is **derived from the time scale**, not controlled separately. Fusing the two into one
gesture was the original proposal and produces unpredictable re-layout; splitting them into two
controls asks the user to maintain a combination that is only ever wrong.

| Scale on screen | Rung | Marks |
| --- | --- | --- |
| ~1–2 years | Epic | epic rails, feature nodes, dependency arcs, milestones as diamonds |
| ~1 quarter | Feature | feature bars sized by estimate, progress fill, items inside where they fit |
| ~1–2 sprints | Item | item bars with labels and the linked Microtask task |

Quarter bands carry sprint ticks labelled `W1–2`, `W3–4`; real calendar dates appear on hover, never
as permanent chrome.

**Epic owns hue. Status owns treatment.** Both point 6 (per-epic colours) and point 10 (red/green
status) wanted hue, and hue cannot carry two meanings. An item is always its epic's colour; status
changes how it is drawn — solid fill for done, hollow for not started, dashed red outline for a
carry-over. The result survives greyscale and colour blindness, and an epic stays traceable across a
crowded year.

Layout is **pure functions** — `railLayout`, `dayToX`, `itemsToMarks` — unit-tested with no DOM, with
the React component a thin renderer over their output. An SVG canvas is otherwise untestable except
through screenshots.

A **table view** is a first-class second rendering of the same data, not an afterthought: epic,
feature, item, estimate, sprint, progress, blocked-by. An SVG-only plan is unreadable to a screen
reader, and the table is also the fastest way to audit a plan someone else drew.

## 6. Editing

The drawer carries **name, estimate, pin, dependencies, epic, linked task, progress readout, and one
plain-text description** — capped and sanitised at the boundary
([ADR 0029](../../adr/0029-document-sanitised-at-the-boundary.md)). It carries no tabs and no rich
text.

Rebuilding Microtask's tabbed editor here was the original point 5. Microtask *is* that editor, with
a sanitiser, byte caps, an autosave cap ([ADR 0028](../../adr/0028-autosave-under-keepalive-cap.md))
and XSS hardening behind it. A second one means two document schemas, two sanitisers, and every
future content fix applied twice or — worse — once. Anything longer than a note opens the linked
Microtask task.

New things **append after the last sibling**: a new item after the last item in its feature, a new
feature after the last feature on its epic's rail. Work is usually added in the order it will be
done, so the common case requires no placement at all. Dragging reorders an item within its feature
or a feature within its rail, moves a feature to another rail, or sets a pin; there is no packing
algorithm and nothing is ever auto-moved.

A write that would create a **cycle is refused**, with the cycle named. A cycle that arrives some
other way — a hand-edited volume — is reported by `schedule()` and shown in the conflict list rather
than breaking the page. Nothing in this product ever rewrites a date to resolve a conflict: a
solver that silently moves an executive's committed plan is a worse failure than a visible
contradiction.

Destructive drags get an undo. Dragging is high-velocity editing and the existing Server Action
round trip has no natural "put it back".

## 7. The two links

Two different things in this product are called a link, they point in opposite directions, and
confusing them is the fastest way to build a credential leak. §7.1 is a link handed **outward**, so
somebody can see this plan. §7.2 is a credential held **inward**, so this plan can read Microtask.
§7.3 is the one rule governing what happens where they meet.

### 7.1 Sharing a plan

A plan is shared the way a project is: a token in a URL, never in a cookie
([ADR 0040](../../adr/0040-link-surface-url-token-authority.md)), carrying exactly the role and
scope it names ([ADR 0038](../../adr/0038-capabilities-role-and-scope.md)). The machinery already
exists and is not rebuilt — the same `ShareLink`, the same three roles, the same `can()`, the same
revocation cascade ([ADR 0010](../../adr/0010-revocation-cascade-lineage.md)).

**Scope is the whole plan, and only the whole plan.** `Scope` gains one variant,
`{ kind: 'plan', planId }`. Microtask's second level exists because a task is a self-contained
document; a Macroplan epic is not self-contained — dependency arcs cross rails by design (§3.1), so
an epic-scoped holder would see arrows pointing at features they are refused, and every cross-rail
edge would need a stub renderer and a decision about whether the far feature's name leaks. `Scope`
is a discriminated union, so adding an epic variant later is **additive**: no migration, no token
invalidated. It is deferred, not foreclosed.

**What the three roles mean here**, which is the decision that cannot be taken back once tokens are
in clients' hands:

| Role | May |
| --- | --- |
| `view` | read the plan and its derived schedule. Nothing else. |
| `write` | that, plus create and rename features and items, set their estimates, **write an item's description**, and **link an item to a Microtask task** |
| `manage` | that, plus **create and rename a rail**, delete, reorder, re-pin, rewire dependencies, change plan settings, and mint, rename, re-role and revoke links over this plan |

**Amended 2026-09-25, phase 3.** This table was narrower than the grant record it describes, in three
entries, and the record is what changes nothing: `GRANTS` in `packages/kernel/src/access/policy.ts`
holds `item:describe` **and** `item:link` in `WRITE`, and `epic:create` and `epic:rename` in `MANAGE`,
none of which the prose said. Each is right where it is, and the table was checked row by row against
`GRANTS` rather than at the one entry that was noticed first. A description is what the work is, which
is the `write` half of the principle below, and it is also the one field §3 caps and sanitises rather
than refuses — a `write`-shaped decision. A rail is where work sits, which is the `manage` half, and
§7.1's own "`manage` is everything an admin can do inside one plan" already said so. `item:link` is
listed although nothing reaches it yet: it has no route, no payload and no service method until phase
4, but §9 records why the grant could not wait — "a role is stored in every token a client holds, so
§7.1's grants are decided in phase 1 or they are decided against links already issued". A grant no
sentence here admits to is the one that will be read off the table by whoever writes that route.

The line between `write` and `manage` is deliberate and is the spec's own principle applied to
people: **`write` changes what the work is and what it costs; `manage` changes where it sits and what
the plan is.** A team lead fills in their own estimates; the executive who owns the timeline decides
what moves. It is also the only split under which §6's "nothing ever auto-moves" survives contact
with a second person.

`manage` is **everything an admin can do inside one plan** and nothing outside it. Listing every plan
and creating a plan stay in `ADMIN_ONLY_ACTIONS`, exactly as `workspace:list-projects` does
([ADR 0009](../../adr/0009-deny-by-default-collections.md)): there is no scope in which "every
plan" is a question a seat may ask. Binding an epic to a Microtask project is admin-only too, for the
reason §7.3 gives.

### 7.2 The bridge to Microtask

An **epic binds to one Microtask project** by holding a share-link token. Not an admin credential:
the service key already fails to distinguish products (shell design §3), and the bridge must not
rest on that hole.

Why the epic and not the item: a project-scoped token is one token per epic rather than one per
item, revoking it unlinks exactly one epic, and the scope matches what the token system already
expresses ([ADR 0038](../../adr/0038-capabilities-role-and-scope.md)). An item then references a task
id *within* the bound project.

**Progress**: an item's percentage is the linked task's `{ done, total }`. An unlinked item has a
manual status only — not a manual percentage — so a number on screen is always a counted number.

**Role is chosen per epic**, `view` or `manage`:

- `view` — Macroplan reads names and progress and can never alter Microtask data.
- `manage` — naming an item in Macroplan **creates the real task** in the bound project.

The `manage` case is a genuine exposure: a token sitting in Macroplan's data can mutate the
client-facing product. It is bounded rather than avoided:

- the token is sealed at rest with the same AES-256-GCM the session cookie uses, and never leaves the
  server;
- the write path permits **exactly one operation** — create a task in the bound project. No delete,
  no rename of anything Macroplan did not create, no share-link management;
- the role is per epic, so a read-only epic stays read-only regardless of what any other epic holds.

A **revoked or dead token renders the epic unlinked** — a stated state with its own appearance — never
an error page and never an empty canvas.

### 7.3 Where the two meet

A link holder opens a shared plan. An item on it is linked to a Microtask task through its epic's
bound token. What they are shown is **the weaker of their plan role and the epic's binding role** —
one function, applied at one seam:

```
effectiveBridgeRole(planRole, bindingRole) = the weaker of the two
```

| Effective role | The holder sees |
| --- | --- |
| `view` | the derived `{ done, total }` and a filled bar — **never** the linked task's name, and never that a link exists |
| `write` | that, plus the linked task's name and a way through to it in Microtask |
| `manage` | that, plus `manage` on the bound project: the Macroplan role and the Microtask role are one to one |

A count leaks far less than a title does, which is why `view` stops at the number. The bar still
fills, so the product's central claim — *a bar is green because a linked Microtask task said so* —
stays visible to the audience the plan is **for**, which is the whole reason the plan is shared.

**This is a credential amplifier, and the bound on it is structural.** A plan `manage` link confers
`manage` across every project the plan's epics are bound to, which is a larger exposure than §7.2's
"exactly one operation" contemplated. What contains it is that `effectiveBridgeRole` can only ever
attenuate: **the binding's own role is the ceiling, and only an admin sets it.** An epic bound `view`
can never leak `manage` to anybody, no matter what links exist over the plan. So `epic:bind` is in
`ADMIN_ONLY_ACTIONS` — a link holder who could re-role a binding could raise their own ceiling, which
would make every sentence above decoration.

**Why not SSO, asked and answered here so it is not re-litigated.** The obvious reading of a role that
composes across two products is that identity has outgrown bearer tokens and wants real claims. It
has not. There is no identity in this system to federate: one `ADMIN_PASSWORD`, and tokens that carry
a capability and no person. What looks like an identity problem is capability **attenuation** across a
trust boundary, which `can()` over role-and-scope already expresses and which the table above resolves
in one `min`. An IdP would invalidate ADRs 0012, 0013, 0040 and 0047 and buy nothing until there is
more than one human. **The trigger that reverses this:** the day this product has named users rather
than one admin password. Until then, the thing that genuinely gets late is not SSO — it is the action
set and the scope union, because a stored token encodes a role and changing what a role means
invalidates links already issued. That is settled in §7.1 and it is settled now.

## 8. What was challenged and rejected

Recorded because a later reader will otherwise re-propose them.

| Proposed | Outcome |
| --- | --- |
| A true git-graph layout (x = topological order) | **Rejected.** Topology and calendar cannot share an axis. Points 2, 3 and 10 all need dates; nothing in a git graph has duration, so no estimate can be drawn and nothing can be late. The git *look* is achieved by mark style over a calendar layout. |
| A sequence diagram at feature zoom | **Rejected.** A sequence diagram maps actors × messages and has nowhere to put an Epic/Feature/Item with a duration. What was meant is a swimlane bar view, which is what the quarter rung is. |
| Baseline dates + a "commit the plan" ceremony | **Rejected by the user.** Carry-over count is the slip signal instead. Consequence accepted: nothing records that a feature was pushed. An optional append-only date-change log per item is offered as a late, optional task rather than pressed. |
| Binary red/green past today | **Rejected.** It cannot distinguish one day late from one quarter late, and it collides with per-epic hue. Replaced by carry-over plus treatment-not-hue. |
| Sprint capacity and over-commitment warnings | **Rejected by the user.** Work spans the boundary silently. Capacity needs people or teams to mean anything and neither exists here. |
| Auto-scheduling / a constraint solver | **Rejected.** Validation only. Dates are derived, never repaired. |
| A tabbed rich-text editor in the drawer | **Rejected.** One editor in the monorepo. |
| Cross-plan dependencies | **Rejected.** Breaks the plan-directory invariant for no stated need. |

## 9. Phases

Four, mirroring Microtask's four plan files. Each has its own plan document under
`docs/superpowers/plans/` and ends at a green gate.

| Phase | Ships | The gate that matters |
| --- | --- | --- |
| **1 — Domain and API** | contracts, `@repo/schedule`, `macroplan-domain`, `/v1/macroplan/*`, **the plan-scope role model and share-link routes**, one shared token index. No UI at all. | `schedule()` property-tested; `PlanStore` contract suite green against fs and memory; `capabilities()` agrees with `can()` across the widened cross product |
| **2 — Canvas, read-only** | plan list, the three rungs, quarter and sprint gridlines, today line, hover, table view, **`/s/[token]` landing** | layout functions tested with no DOM; the canvas renders at the 2 000-item cap |
| **3 — Editing** | drawer, create/rename/delete, estimates, pins, reorder, edges, conflict list, undo, **the share manager** | cycle refusal pinned by test; a test asserts nothing auto-moves |
| **4 — The bridge** | epic↔project token, item↔task link, derived progress, the bounded create-task write, **`effectiveBridgeRole`** | a revoked token renders unlinked; a `view` holder provably never receives a linked task's name |

Phase 1 reserves `binding` and `linkedTaskId` in the model from the start, so phase 4 adds behaviour
rather than a migration. **The role model is not reserved that way and cannot be** — a role is stored
in every token a client holds, so §7.1's grants are decided in phase 1 or they are decided against
links already issued. §7.3's behaviour is phase 4; the actions and scopes it decides over are phase 1.

### 9.1 Rules carried from the Microtask plans

- Plans fix **interfaces, decisions and acceptance criteria** — never function bodies. The previous
  generation of dictated-code plans shipped a live XSS hole past two clean review gates.
- Every task ends with `npx turbo run build typecheck lint test --force` green and `Cached: 0`.
  Without `--force`, turbo reports `FULL TURBO` and a clean run proves nothing.
- Delete `.next` before a repeat `--force` build, or the second run fails with a bogus `EPERM`
  symlink error.
- `apps/api` loads `@repo/*` from `dist/`. A change to a package's `src` is invisible to the API
  suite until the package is rebuilt.
- ADR 0027 limits throughout: `.tsx` at 80 lines, functions at 50, complexity at 10, params at 4,
  TSDoc only.
- An app imports `@repo/contracts`, `@repo/api-client`, `@repo/ui` and now `@repo/schedule` — never
  `@repo/store`, `@repo/kernel`, or either `*-domain`.

## 10. Verification targets

| Thing | How it is held honest |
| --- | --- |
| `schedule()` | property tests: adding an edge never moves anything earlier; a pin is never violated; every cycle is reported and everything outside it still schedules; output is independent of input ordering |
| calendar arithmetic | a plan starting on each of the seven weekdays; a sprint spanning a year boundary; a DST transition inside a sprint; the stated timezone, not the server's |
| feature contiguity | a feature's span always equals the sum of its items, for every arrangement of pins and edges the model admits |
| `PlanStore` | the existing port-contract pattern, run against both fs and memory implementations |
| caps | a plan built *at* 2 000 items is accepted; 2 001 is refused with a named problem code |
| layout | pure functions, no DOM, including the node↔bar crossover between rungs |
| the role model | `capabilities()` agrees with `can()` across **every** `role × scope × action × target` tuple, plan scope included, enumerated from the kernel's own action list rather than sampled |
| cross-product isolation | a Microtask token — `manage` included — is refused every Macroplan action, **including on a `planId` equal to its own `projectId`**; and the reverse |
| the token index | one token is owned by one container across both products; a collision is refused rather than silently reassigned |
| `write` cannot become `manage` | a plan `write` holder is refused delete, reorder, re-pin, dependency rewiring, plan settings and every `share:*` action, each asserted by name |
| the bridge | a revoked token, a deleted project, a `view` holder denied a linked task's name, and `effectiveBridgeRole` never returning a role stronger than either input |

## 11. ADRs this spec creates

| ADR | Title | Status |
| --- | --- | --- |
| 0048 | Macroplan schedules, it does not store dates | **Written.** |
| 0049 | Per-rail forward pass, in one pure package both sides import | **Written.** |
| 0050 | The plan directory is the unit; edges never cross it | **Written.** |
| 0051 | Estimate is authored at any level; children win, and the gap is shown | **Written.** |
| 0052 | An epic binds to a Microtask project by a sealed share token, pasted by hand | **Written** in phase 4, which is the phase that took the decision. §12's open question is settled: the token is minted in Microtask's own share manager and pasted, because minting it from here would need authority to *manufacture* credentials in the client-facing product — a far larger exposure than the one sealed token §7.2 bounds. Also records why the cipher is duplicated rather than shared: one module would put the authorization kernel into both Next apps' `node_modules`, which ADR 0027's allowlist exists to prevent. |
| 0053 | A plan is shared at plan scope, by the share-link system that already exists | **Written.** |
| 0054 | One token index for both products, and identity stays a capability until there are users | **Written.** |
| 0055 | Canvas geometry is its own pure package, because a measurement cannot be tested here | **Written** in phase 2. §4's table put "layout maths" in `@repo/schedule` and §4.1 published that package's surface without any; the layout is `@repo/canvas`, and §4.1's surface is the half that was right. |
| 0056 | The table is the second rendering of a plan, not the accessible fallback | **Written** in phase 2. §5's table view, with the data-parity test that keeps it a peer and the six of seven columns phase 2 can fill. |
| 0057 | The drawer is a route, so a selection is a URL and a save is per field | **Written** in phase 3. §6's drawer, as a segment under `[planId]` with the canvas in the layout — so selecting re-renders the panel and not 2,200 nodes, and a selection is a link. Per-field saving is the same decision: the feature PATCH gates per field, so a combined body is refused wholesale for exactly the seat §7.1's `write` role exists for. |
| 0058 | One delegation root over a server-rendered canvas, and `children` is the one exception it needed | **Written** in phase 3. §6's drag, as one client boundary over an SVG that stays a Server Component — against a client canvas, a client component per bar, and the transparent sheet phase 2 refused by name. Records that the screen-to-`viewBox` conversion is the one line no test here can cover. |
| 0059 | Undo is a compensating placement, one step deep, and a delete has none | **Written** in phase 3. §6's "destructive drags get an undo", scoped to a move: a placement's inverse is two values already in hand, and a delete's is a new id with no items, no description and no incoming edges. There was no journal, soft delete, tombstone or restore route anywhere to build on, and four confirm dialogs already promise a delete is final. |
| 0060 | A cycle is named before the write, and the API stays the authority | **Written** in phase 3. §6's "a write that would create a cycle is refused, with the cycle named", against a generic 409 sentence that was false for this cause. The check is a message and never a gate, and it cannot report the cycle "in the order they wait on each other" — `findCycles` answers a strongly connected component, and a component of three or more need not be one cycle. |
| 0061 | The bridge is a second read, never part of the plan's | **Written** in phase 4. `planView` stays pure and synchronous, a plan may hold forty bindings, and Microtask's availability must not become the timeline's — §7.2 requires a dead binding to render as a stated state "never an error page and never an empty canvas", and the same holds of the product being unreachable. Records that `read-bridge.ts` was first written through `adminRead`, which turns a 404 into `notFound()`, and so did exactly what this ADR forbids. |
| 0062 | Attenuation is one minimum, applied twice, and a refused link reads as unlinked | **Written** in phase 4. §7.3's function takes two roles and the product has three facts — declared, live, and the reader's own — so it is applied twice, which is sound because the minimum is associative and idempotent. Records why `linkedTaskId` is `null` rather than absent for a refused reader, a deliberate departure from ADR 0013 whose own argument inverts here; and why the stored binding role is two-valued while the attenuated one is three. |
| 0063 | The bounded write cannot roll back, so it may leak a task and never delete one | **Written** in phase 4. §7.2 permits the bridge no delete, so the create-then-link pair has no undo: the task is created first and an orphan is the accepted failure, being strictly better than a dangling link that a retry would duplicate. Records that the two writes must be sequenced because `Lock` is not reentrant — a nested `run` deadlocks rather than failing — and that `BridgeService`'s two-method surface is what makes "exactly one operation" assertable. |

## 12. What this spec does not decide

- ~~**Who mints the epic's token.**~~ **Settled 2026-09-25, phase 4: pasted by hand**, from Microtask's own
  share manager (ADR 0052). Minting it through a Microtask admin call from Macroplan was refused on the
  size of the authority it needs — creating a share link over there requires `share:create` at minimum and
  in practice an admin credential, which would let this product manufacture credentials in the
  client-facing one. That is strictly larger than the single sealed bearer §7.2 bounds, and it is the hole
  §7.2 opens by ruling out. The cost, accepted: an admin visits two products to bind one rail, and there is
  no picker of Microtask's links here — there cannot be, for the same reason.
- **Whether the plan list needs search.** Microtask's names-only search
  ([ADR 0021](../../adr/0021-names-only-search.md)) is the obvious precedent if it does.
- **Export/import of a plan.** Nothing here needs it; Microtask's drop-in import exists for a
  migration Macroplan has no equivalent of.
- **Anything about the cutover.** Macroplan keeps a new hostname and never the production FQDN
  ([ADR 0022](../../adr/0022-hostname-continuity-gated-cutover.md)). This spec changes no part of the
  runbook.
