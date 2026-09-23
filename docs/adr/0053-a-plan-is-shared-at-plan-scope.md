# ADR 0053 — A plan is shared at plan scope, by the share-link system that already exists

**Status:** Accepted · 2026-09-23

## Context

Start with the fact the rest of this record is built on, because it constrains people who will never
open `policy.ts`:

> **The two products' ids are drawn from separate ULID sequences and may collide.** `ulid()` mints a
> timestamp and sixteen random characters; nothing reserves a range per product, no registry refuses
> an id the other product already used, and ADR 0017 admits imported bundles carrying ids this
> process never minted. So one 26-character string can name a project **and** a plan — and a scope or
> a target that named both roots would turn that collision into a grant.

It is not hypothetical, and it is not a matter of probability. The kernel's own suite seeds the pair
deliberately (`packages/kernel/src/access/share-index.test.ts`), and so does the API's
(`apps/api/src/routes/macroplan/guard.test.ts`, which drives a plan whose id equals a project's in
both directions). Today that fact is written down in one place: a TSDoc block on `Scope` in
`packages/kernel/src/access/scope.ts`. Whoever writes Macroplan's id generation, or adds the next
product's target kind, will not be reading the kernel's access directory when they need it. Moving it
into the record is half of why this ADR exists.

The other half is that Macroplan needs sharing and none of it should be new. The machinery is built
and argued: three roles behind one pure `can()` (ADR 0008), a token in a URL and never in a cookie
(ADR 0040), one route tree serving an admin and a link holder alike (ADR 0013), revocation cascading
through `createdBy` lineage (ADR 0010), and controls rendered from role **and** scope rather than
alone (ADR 0038). A second implementation of any of it would be a second place for a security
predicate to be wrong — exactly what ADR 0009 refuses.

What was genuinely Microtask-shaped was `Scope`. Every variant carried a `projectId`, `can()`
compared ids without knowing which product they came from, and `apps/api` had a cast where a
narrowing belonged.

## Decision

**A plan is shared at plan scope, and nothing narrower exists.** `Scope` gains exactly one variant:

```ts
export type Scope =
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }
  | { readonly kind: 'plan'; readonly planId: string }
```

A plan scope carries a plan id and **nothing else**, so it can never be compared against a project
id. The four Macroplan target kinds are the same discipline one level down: `plan`, `epic`, `feature`
and `item` each carry `planId` alone and no epic, feature or item id
(`packages/kernel/src/access/target.ts`), because no rule turns on one — and a field no rule reads is
a field that will one day be compared wrongly.

**The invariant is enforced in more than one layer, and each is load-bearing.**

*In the policy* (`packages/kernel/src/access/policy.ts`), two checks run before any grant is
consulted. `SCOPE_TARGETS` maps each scope kind to the target kinds it may reach at all — project and
task scopes to `PROJECT_TARGETS`, a plan scope to `PLAN_TARGETS` — so the kind test refuses a
cross-product question before an id is looked at. Then `sameRoot` compares the one field that scope
has: `scope.kind === 'plan'` reads `planId` off the target and a project or task scope reads
`projectId`, each behind an `in` check, so a shape mismatch is a refusal rather than an assertion.

*At the mount* (`apps/api/src/auth/require-product.ts`), because the policy alone was measured to be
insufficient in one case. One token index resolves a bearer from **either** product, so a plan
principal is presented to every route tree, and `search`'s gate derives its target from the caller's
own scope (ADR 0009). A plan principal therefore asked `project:read` about a `plan` target — and
`can()` cleared it: `SCOPE_TARGETS.plan` admits `plan`, `sameRoot` compared the scope against itself,
and `view` grants `project:read` alongside `plan:read`. A nonsense question, answered yes. No row
ever came back, because every candidate is filtered against a project-, folder- or task-shaped
target, so what leaked was the 200 itself. `requireProduct` now refuses a link rooted in the other
product before any handler runs, with a 403 worded as the product's own root read.

*In the types.* `isProjectScope` enumerates the kinds it admits rather than excluding `'plan'`, so a
third product's variant is refused until somebody decides it belongs, rather than silently admitted
by a `!== 'plan'` test. `SCOPE_PRODUCTS` in the guard and `linkDirectories` in
`apps/api/src/auth/link-directory.ts` are `Record`s keyed by their unions for the same reason: a
fourth variant fails to compile where it has to be decided.

**Three roles, and the line between `write` and `manage` is the product decision worth recording.**
`view` reads the plan and its derived schedule. `write` adds that plus creating and renaming features
and items and setting their estimates. `manage` adds deleting, reordering, placing, rewiring
dependencies, plan settings, and seat administration over this plan. The sentence behind the split:
**`write` changes what the work is and what it costs; `manage` changes where it sits and what the
plan is.** A team lead fills in their own estimates; the executive who owns the timeline decides
what moves.

Checked row by row against `GRANTS`, the sentence holds for most of the table and there are three
places it does not, recorded here rather than smoothed over.

A fourth was found while this record was being written, and it turned out to be a **defect rather than
a departure**, so it was fixed instead of documented. `updateFeature` gated `pinSprint` on
`feature:estimate`, which `write` holds — so a plan `write` seat could re-pin a feature, and a pin
changes *when* a bar is drawn, which is where it sits. §7.1's role table and §10's verification target
both said a `write` holder is refused a re-pin, and §10 said that refusal was "asserted by name"; no
such assertion existed, and the only test that pinned anything ran as the admin, so no seat had ever
exercised the route. `feature:pin` is now its own `manage`-only action rather than a reuse of
`feature:place`: every authority in this policy is a named entry in `ACTIONS`, and constraining when
work may start is not the same authority as moving it along or across a rail, which is what
`feature:place` decides. The refusal is asserted for a `write` seat,
paired with a `manage` clearance on the same body, and a body carrying an estimate **and** a pin is
asserted to write neither field: every gate runs before the service is called, so the refusal is
all-or-nothing rather than partial.

That is worth recording as more than a bugfix. It is the one place where two keys of different
authority shared one action while one of them was `write`-held, and the audit found it by checking the
sentence above against `GRANTS` row by row — which is the only way it could have been found, since
both encodings of the policy agreed with each other and were agreeing on the wrong thing.

- **`item:link` is a `write` action.** Linking an item to a Microtask task changes neither what the
  work is nor what it costs; it changes where the item's progress is counted from. It has no route at
  all today — it and `epic:bind` are the phase-4 bridge actions, named in `PENDING_ROUTES` in
  `apps/api/src/routes/authorize-targets.test.ts`, which fails the moment one is gated without being
  struck off. The grant is decided now because a role is stored in every token a client holds.
- **`share:*` is a third category.** Minting, renaming, re-roling and revoking a seat is neither
  where the work sits nor what the plan is. It sits under `manage` because ADR 0008 already defines
  `manage` as admin **within its scope** and blind outside it, which is the older and wider sentence.
- **Deletion is `manage` while creation is `write`**, though both change what the work is. That split
  is destructive-versus-additive, not this axis.

**Epic scope is deferred, not foreclosed.** `Scope` is a discriminated union, so a fourth variant is
purely additive: no migration and no token invalidated, and every `Record` keyed by `Scope['kind']`
named above becomes a compile error listing the places that must answer for it. The reason to wait is
not caution about the policy — it is that nobody has a use case and there is a real rendering problem
underneath. Dependency arcs cross rails by design, so an epic-scoped holder would see arcs pointing
at features it is refused, and every crossing edge would need a stub renderer and a decision about
whether the far feature's name leaks. That is phase 2's problem, and deciding it now would be
deciding it without the canvas that raises it. This is the same disposition ADR 0011 gave folder
scope: plausible, deferred, ADR-able when something needs it.

**`epic:bind` is admin-only, and not for ADR 0009's reason.** It has a per-resource target, so it is
not one of the targetless collection actions that ADR 0009 makes deny-by-default; it sits in
`ADMIN_ONLY_ACTIONS` alongside them for its own reason. An epic's binding role is the **ceiling** on
everything a holder reaches in Microtask through the phase-4 bridge, and the bridge composes it with
the holder's plan role by taking the weaker of the two. A holder who could re-role a binding could
raise its own ceiling, and every bound rail would be decoration. The kernel records that beside the
list itself — naming the list after ADR 0009's argument is what previously led a caller to cite 0009
for the wrong reason. It is also why `EpicChanges` in `packages/macroplan-domain` declares no
`binding` member and `UpdateEpicPayload` no `binding` key: the authority is admin-only and the edit
is unreachable from the ordinary rename path.

**A plan share link carries no scope at all.** `PlanShareLink` in
`packages/contracts/src/share-link.ts` is Microtask's `ShareLink` minus its `scope` field — the same
token shape, the same three roles, the same `createdBy` chain. A plan has exactly one shareable
scope, so a seat's scope is implied by the container it is stored in; a stored copy would be a second
home for a fact already settled by where the record lives, and free to disagree with it. The API
derives it in `linkDirectories`, from the container the token index just resolved the token to, so it
can only ever name the plan whose manifest the token was found in. Microtask's `ShareLink` genuinely
needs the field, because a link there may be project- or task-scoped and ADR 0011 requires the wider
of the two be asked for by name; a plan offers no such pair to choose between.

## Consequences

- **Macroplan's sharing is not a second implementation of anything.** The seat routes are a mint, a
  rename/re-role and a revoke under `/v1/macroplan/plans/{planId}/share-links`, and the roles,
  lineage and token shape come from the existing schemas.
- **There is no plan share-link list endpoint.** A plan's seats ride on the plan view, gated by
  `visibleLinks` (`packages/macroplan-domain/src/views/plan-view.ts`) asking `can()` for `share:read`
  on the plan. A refused caller gets the block **absent** rather than empty, so "you may not ask"
  cannot be read as "this plan has no seats" — and a `view` holder is never handed every other
  holder's token.
- **`capabilities()` grew a scope kind, and the agreement test grew with it.** Because plan scope is
  a third `Scope` kind and Macroplan added actions, the cross product in
  `packages/contracts/src/capabilities.test.ts` now runs role × scope × action × target with plan
  scope included, enumerated from the kernel's own `ACTIONS` and `TARGET_KINDS` rather than sampled
  (ADR 0038). Three rows also gained a **second** target: `share:read`, `share:revoke` and
  `share:update` are the share system's rather than either product's, so one row serves both and
  each is gated on the `project` in Microtask and on the `plan` here — the same action
  administering two kinds of container.
- **`PrincipalResolver` can now return a plan-scoped principal to any route**, so nothing downstream
  may assume a project scope. `routes/microtask/shares/handlers.ts` narrows with `isProjectScope`
  where it previously cast, and `routes/macroplan/shares/handlers.ts` checks the discriminant rather
  than asserting `PlanScope`.
- **Scope stays immutable.** ADR 0011 freezes a link's scope and ADR 0035 makes its role changeable;
  a plan seat inherits both, and with one scope there is nothing a re-scope could even mean.
- **Adding a third product is a bounded exercise, and the compiler lists it**: a `Scope` variant, a
  `SCOPE_TARGETS` row, a `PROJECT_TARGETS`-style target list, a `SCOPE_PRODUCTS` entry, a
  `LinkDirectory`, and a token-index owner. What it must not do is reuse another product's root
  field.

## Alternatives considered

**Epic scope now, alongside plan scope.** The closest analogue to Microtask's project-and-task pair,
and the one a reader of ADR 0011 expects. Rejected on the rendering problem rather than on the
policy: a task is a self-contained document, an epic is not — cross-rail dependency arcs are the
product's central mechanic (spec §3.1), so an epic-scoped holder is shown arrows into features it
cannot see, and nothing has decided what those arrows say. Adding the variant later costs no
migration, so the cheap direction is to wait for the use case.

**Reuse Microtask's `project` scope with the plan id in `projectId`.** No new variant, no widened
union, and every existing consumer keeps compiling — which is precisely the objection. The two id
spaces are independent, so `sameRoot` would compare a plan id against a project id and a collision
would become a grant. This is the alternative the opening invariant exists to refuse.

**One `Scope` with an optional `productId` beside the root id**, discriminated at the call site.
Rejected: it makes every consumer responsible for remembering the second comparison, and `sameRoot`
would pass for a caller that forgot. A discriminated union puts the product in the shape, where the
compiler checks it for free.

**Let a plan seat be `manage` everywhere and drop the `write` role for plans.** Simpler table, and
the plan owner is usually one person. Rejected: `write` is exactly what makes a team lead able to
size their own work without also being able to move the timeline, which is what "nothing ever
auto-moves" (spec §6) depends on once a second person touches the plan.

**Make `epic:bind` a `manage` action, so a plan owner can wire their own epics.** Convenient, and it
keeps admin out of routine work. Rejected: the binding's role is the ceiling the bridge attenuates
against, so a holder able to re-role a binding raises its own ceiling — the one escalation the whole
composition rule exists to prevent.
