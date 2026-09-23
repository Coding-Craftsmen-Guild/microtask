# ADR 0038 — Controls gate on role **and** scope, never role alone

**Status:** Accepted · 2026-09-11

## Context

The spec's role table has three columns — view, write, manage — and the client view renders from it.
The policy it is meant to describe has a second axis the table does not mention.

`withinTaskScope` refuses every `folder` target outright, and every `project:*` action except
`project:read`. Read against the route tree, that has a consequence the table cannot express:
`share:create` is authorized against the **new link's scope**, while `share:read` and `share:revoke`
are authorized against `{kind:'project'}`. So a **task-scoped** `manage` holder can mint a share
link over its own task, and can then neither list it nor revoke it. It holds `manage`, and the share
manager the role table says to render for `manage` would show it a list it cannot load and a revoke
button that 403s.

This is not a bug in the policy — it is scope containment doing exactly what ADR 0011 asks of it, and
ADR 0011 already records the same effect for breadcrumbs. It is a bug in rendering from role alone.
And with task scope as the default, the broken case is the **common** one.

The app cannot simply ask `can()`. It lives in `@repo/kernel`, which ADR 0027 forbids an app from
importing.

## Decision

**One pure function, `capabilities(role, scope)`, in `@repo/contracts`**, returning the boolean set
the UI renders from. No component branches on `role` on its own.

**`packages/contracts` takes `@repo/kernel` as a `devDependency`, and a contract test asserts
`capabilities()` agrees with `can()` for every role x scope x action triple.** Not a sample — the
whole cross product, the same exhaustiveness ADR 0008 requires of the policy matrix itself. The
devDependency is what keeps `kernel` out of the browser bundle while still letting the test compare
the two answers in one process.

**That test is the entire reason the function is allowed to exist at all.** ADR 0009 refuses a second
copy of a security predicate, and it is right to: `withinTaskScope` and `inScope` are private to
`policy.ts` precisely so nothing re-derives them. `capabilities()` is admitted as a narrow
exception with two conditions attached. It answers a different question — "what should be on screen"
rather than "may this request proceed" — and it is never the thing that stops a request. It is
mechanically proven equivalent to `can()` by the test above, so a divergence is a red build rather
than a 403 a user discovers.

This amends ADR 0009 by naming a third category alongside its gate and filter: a **rendering**
question, asked in a process that cannot reach the policy, permitted only while an exhaustive test
holds it to the policy's answers.

## Consequences

- ~~A task-scoped `manage` holder is shown no share manager, because `capabilities('manage', {kind:
  'task', ...})` says so.~~ Corrected by the second amendment below: the record grants that holder
  `share:create` and refuses it `share:read`, `share:update` and `share:revoke`, so it is shown no
  **list** and a manager that can only mint. Nothing in the UI needs to know why.
- The spec's role table gains a scope axis, and every row of it is now derivable from
  `capabilities()` rather than transcribed.
- Adding an action means adding it to the policy matrix and to `capabilities()`, and forgetting the
  second is a failing contract test rather than a button that 403s. Adding a **scope** — a folder
  scope was deferred in ADR 0011 — means the cross product grows and both sides are forced to answer
  for it.
- `@repo/contracts` now has a dev-time dependency on `@repo/kernel`, so a cycle between them would be
  a build failure; kernel must not depend on contracts. Worth stating, because the dependency graph
  in the spec shows no edge here at all.
- A 403 remains possible and the UI still handles it. `capabilities()` removes the ones we can
  predict, not the race where a link is downgraded between render and click — which ADR 0008 already
  says is re-checked inside the lock.

## Alternatives considered

**Have the API return the capability set with the bootstrap response**, computed by calling `can()`
directly, so there is exactly one implementation. Genuinely the cleanest, and it was rejected on
reach rather than on principle: the set is needed to render Server Components that have not made a
bootstrap call, and threading it through every one of them makes the capability set a prop on the
whole tree. Worth revisiting if `shares/current` becomes a hard dependency of every page anyway.

**Export `can()` from `@repo/contracts` by moving the policy there.** Rejected: the policy belongs
with the roles and targets it is defined over (ADR 0008), and moving a security predicate into a
package whose job is wire shapes puts it one careless export away from the browser.

**Render from role alone and let the 403 teach the user.** What the spec's table implies. Rejected:
it means the default share scope ships a share manager that cannot work.

## Amended by measurement · 2026-09-11 — one action is gated on **two** targets

This ADR describes `capabilities(role, scope)` as returning "the boolean set the UI renders from",
one answer per action. Building it, and checking the target column against every `authorize()` call
in `apps/api`, found that an answer per action is not quite enough.

**`project:read` is gated twice.** `readProject` asks it over `{kind:'project'}`; `listFolders` asks
the same action over `{kind:'folder'}`. For a project scope the two agree. For a **task** scope they
do not: the project read is cleared and the folder read is refused, which is exactly the breadcrumb
ADR 0011 withholds. So a single `capabilities()['project:read']` cannot answer both questions, and a
control that read it to decide whether to draw the folder tree would draw a tree the API refuses —
the same class of bug this ADR exists to remove, one level down.

The projection is therefore two exports rather than one, and `capabilities()` is the convenience:

- **`mayReach(role, scope, action, target)`** is the predicate. It takes the target, so a caller can
  ask the precise question, and it is what the agreement test drives.
- **`capabilities(role, scope)`** is the record over it, each action answered against its own
  primary target. `ACTION_DECISIONS[action].alsoGatedOn` records where a second target exists, so
  the one case that needs asking by name is written down rather than left to be discovered.

The agreement test grew with it, and is now stronger than this ADR asked for: it compares `mayReach`
with `can()` across **role × scope.kind × action × target** — 3 × 2 × 27 × 6, 972 comparisons — rather than one
target per action. `CAPABILITY_ACTIONS` is asserted equal to the kernel's `ACTIONS`, so a new kernel
action fails the test until the projection accounts for it.

Two further measurements worth recording, both from the same scan:

- **`tab:create` is gated on a `tab` target, not a `task` target**, and `folder:*` on `folder` rather
  than on the project. Neither changes an answer — a task scope refuses `folder` and clears `tab`
  either way — but the kernel's own policy test uses a different mapping (`targetFor` in
  `policy.test.ts` sends `tab:create` to a task and every folder action to the project), so the two
  mappings in this repo are not the same mapping. The one in `ACTION_DECISIONS` is the one taken
  from the handlers.
- **Three actions have no gate at all**: `export:run` and `workspace:import` have no route yet, and
  `workspace:search` is gated through a variable (ADR 0009 derives its target from the principal).
  Their rows are the policy's answer with nothing confirming them against a call site, and the test
  names all three so the list cannot quietly grow.

## Amended · 2026-09-11 — "no share manager" meant no link list

The first consequence above said a task-scoped `manage` holder "is shown no share manager, because
`capabilities('manage', {kind:'task', ...})` says so". The record does not say that. It answers
`share:create` **true** for that holder, because minting is decided against the new link's own
scope, and `share:read`, `share:update` and `share:revoke` false, because those are decided against
the project. Hiding the manager would render from `share:read` alone and strand a capability the
policy grants — the same one-answer-for-several-actions mistake the first amendment corrected for
`project:read`.

So the share manager (`apps/microtask/components/share-manager`) draws each of its four controls
from its own answer:

- **Share** is drawn when the holder may list **or** mint, and nothing at all when it may do
  neither.
- A holder that may mint but not list gets a create-only dialog. It makes **no** list request, draws
  no rename, role or revoke control, and says in the dialog that it can create links here but not
  list, rename or revoke them, rather than showing a refusal as an error.
- A link that holder mints is shown once, with its URL, and dropped with its token when the dialog
  closes (ADR 0033). Nothing it can call will show it again, and the dialog says so before it is
  minted.

The plan behind this unit asked for the manager to be "absent" for that holder and for the
create-but-not-list case to be "stated in the UI". The create-only dialog is how both are met at once.

## Amended by measurement · 2026-09-23 — the plan scope, and the first amendment's two stale numbers

This ADR's argument now covers **twenty-four more actions** — Macroplan's — and a third scope kind,
`plan`. `GRANTS` and `ROWS` are still two encodings of one fact and the agreement test still holds
them to each other, so nothing here changes the decision. What it changes is two statements in the
first amendment above that were true when they were written.

**The cross product is not 3 × 2 × 27 × 6.** Every factor but the first has moved. Counted from the
lists themselves rather than carried over:

- **3 roles** — `ROLES` (`packages/kernel/src/access/role.ts:2`), which is what `GRANTS` is keyed by
  (`packages/kernel/src/access/policy.ts:58`). The one factor that did not change.
- **3 scope kinds** — `project`, `task` and `plan` (`packages/kernel/src/access/scope.ts:8`). The
  scope axis this ADR said "means the cross product grows" grew, exactly there.
- **51 actions** — `ACTIONS` (`packages/kernel/src/access/action.ts:70`), being 29 in the
  Microtask-and-workspace list plus 22 in the plan-family list. Those two lists are grouped by action
  family and **not** by product, so neither length is a product's action count: Macroplan's 24 are the
  22 plan-family actions plus `workspace:list-plans` and `workspace:create-plan`, which sit with their
  `workspace:` siblings because a workspace target and admin-only authority is what the policy turns
  on. 51 − 27 = the 24 this amendment opens with.
- **10 target kinds, as the test enumerates them.** The kernel's own `TARGET_KINDS` has **9**
  (`packages/kernel/src/access/target.ts:2`); `@repo/contracts` adds one of its own, `own-scope`, so
  `CapabilityTarget` has **10** (`packages/contracts/src/capabilities.ts:22`). The number that
  matters is the test's, and the test enumerates 10: `TARGETS` is `[...TARGET_KINDS, 'own-scope']`
  (`packages/contracts/src/capabilities.test.ts:32`), derived from the kernel's list rather than
  hand-written so a tenth kernel kind enters the cross product by itself, with a type-level guard
  (`BEYOND_KERNEL_KINDS`, `:45`) failing the build if the contracts union grows a member the kernel
  does not name. Between the two the lists cannot part.

3 × 3 × 51 × 10 = **4 590 comparisons**, arrived at as 51 × 10 = 510 per role-and-scope pair and
3 × 3 = 9 such pairs.

**And the test really does enumerate that product, with nothing skipped.** It is nine `it` blocks,
one per role × scope, each walking all 51 actions × 10 targets and collecting the disagreements
rather than asserting pair by pair, so a failure names every divergent pair at once
(`packages/contracts/src/capabilities.test.ts:139`). Combinations that cannot arise are included on
purpose — a plan-scoped holder is asked about a `tab` target, and answering `false` in both encodings
is the agreement being checked. Two details make the enumeration well defined rather than arbitrary:
`own-scope` resolves to the caller's own scope (`targetIn`, `:88`), and each of the other nine targets
is built **inside the root the scope names** (`TARGET_BY_KIND`, `:76`), because a `CapabilityTarget`
is a bare kind with no id, so agreement is about kind and the id comparison stays the kernel's.
`CAPABILITY_ACTIONS` is still asserted equal to `ACTIONS` (`:96`), so a new kernel action fails the
test until the projection accounts for it.

**`export:run` and `workspace:import` both have routes.** The first amendment's "no route yet" is the
other stale statement, and it has been stale since the import work landed:

- `export:run` is gated on `{kind:'project'}` at `GET /v1/microtask/projects/{projectId}/export`
  (`apps/api/src/routes/microtask/export/handlers.ts:84`). There are **two** export addresses; the
  workspace-wide sibling `GET /v1/microtask/export` is gated on `workspace:list-projects` rather than
  on `export:run`, because a route naming no project has no per-resource target to decide against.
- `workspace:import` is gated on `{kind:'workspace'}` at **five** import-session addresses — open a
  session, upload a chunk, expand an archive, preview, confirm (`POST /v1/microtask/import/sessions`,
  `POST …/sessions/{sessionId}/files`, `POST …/sessions/{sessionId}/archives`,
  `GET …/sessions/{sessionId}/preview`, `POST …/sessions/{sessionId}/confirm`;
  `apps/api/src/routes/microtask/import/handlers.ts:33`, `:52`, `:73`, `:91`, `:114`). That five is
  asserted gate by gate rather than read off a comment (`apps/api/src/routes/authorize-targets.test.ts:125`).

So the list of rows no route scan can confirm is no longer those two plus `workspace:search`. It is
**`workspace:search`**, which has a route and will never be confirmable from one — its gate names a
computed action and a computed target, so there is no literal in the source to read
(`apps/api/src/routes/authorize-targets.test.ts:87`) — plus **`epic:bind`** and **`item:link`**, the
phase-4 bridge actions, which have no route at all. Those two are named in `PENDING_ROUTES` (`:36`)
and the suite fails the moment one is gated without being struck off (`:120`), which is how the
Macroplan rows that did acquire routes left that set.

One row the **route-target cross-check** structurally cannot see is `share:read` in Macroplan.
Macroplan decides it inside `visibleLinks` rather than at a route — a plan's seats arrive inside
`PlanView.shareLinks` instead of from a list endpoint
(`packages/macroplan-domain/src/views/plan-view.ts:132`) — so no `authorize(` scan reaches it, and
nothing forced its `alsoGatedOn: ['plan']` row. That is a limit of
`apps/api/src/routes/authorize-targets.test.ts` and **not** of the agreement test: the agreement test
compares the projection against `can()` for the whole product above, `share:read` × plan scope ×
`plan` target included, and pins that pair by name (`packages/contracts/src/capabilities.test.ts:327`).

`alsoGatedOn` remains a note to callers and changes no answer. Neither `mayReach` nor `capabilities`
consults it (`packages/contracts/src/capabilities.ts:213`, `:238`); its readers are the two tests
above. So `capabilities('manage', planScope)['share:revoke']` is `false` **deliberately** — the record
answers each action against its own single `target`, which for the seat actions is the Microtask
project — and a plan-scoped caller has to ask `mayReach(role, scope, action, 'plan')` by name. That
`false` is pinned, not tolerated (`packages/contracts/src/capabilities.test.ts:319`).
