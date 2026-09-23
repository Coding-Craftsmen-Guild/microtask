# ADR 0054 — One token index for both products, and identity stays a capability until there are users

**Status:** Accepted · 2026-09-23

## Context

A plan is shareable (ADR 0053), so a bearer arriving at this API may now belong to either product.
That raises a small mechanical question and a large architectural one, and they are easy to confuse
with each other.

The mechanical one: a share token is an opaque string. Nothing in it says which product minted it, or
which container holds it, so something has to answer that before a principal exists at all. Until
now that something was Microtask's — `TokenIndex` was declared in
`packages/microtask-domain/src/ports/` (ADR 0030), because there was one product with shareable
containers.

The large one arrives with the phase-4 bridge. A plan holder's authority will compose with an epic's
binding role across a product boundary, and a role that travels between systems is the shape people
recognise as "we need real identity now — an IdP, claims, SSO". That reading is worth answering in a
record rather than leaving open, because it is the kind of question that gets re-litigated every time
somebody new reads the auth code, and because answering it wrongly would invalidate four accepted
ADRs at once.

## Decision

### One index, keyed by the token, answering which container owns it

`TokenIndex` moves to `packages/kernel/src/access/token-index.ts` and serves both products:

```ts
export interface TokenOwner {
  readonly product: Product
  readonly containerId: string
}

find(token: string): TokenOwner | null
```

**Keyed by the token, because the token is all the caller has.** A bearer arrives as an opaque
string, so the index is the thing that *tells* you which product owns it. `find` therefore takes a
bare bearer and answers without being told where to look. Two per-product indexes would invert that:
`PrincipalResolver` would have to ask both and choose between their answers — two lookups and two
ways to be wrong, in the authorization path, with a guess sitting where a lookup belongs.

**Both halves of the answer are used, once each.** `product` selects the directory the live link is
read from — `this.#directories[owner.product].readLink(owner.containerId, bearer)` over a
`Record<Product, LinkDirectory>` built in one place so neither adapter can be wired under the other's
key (`apps/api/src/auth/link-directory.ts`). The two adapters are genuinely different reads: a
project manifest through `ProjectStore`, whose `ShareLink` carries its own scope, and a plan manifest
through `PlanStore`, whose `PlanShareLink` carries none and whose scope is derived from the container
the index just named. `containerId` says which manifest. So exactly one manifest is read for exactly
one bearer, on every request, which is also what makes a revocation or a downgrade take effect on the
next call rather than whenever a cache expired.

**The ownership key is the pair, not the id.** `ShareIndex`, the in-memory adapter beside the port,
joins them: `` `${owner.product}/${owner.containerId}` ``, and that string is what `add`, `remove`
and `collisions` each compare. Without the product a plan and a project **of the same ULID** would be
one owner — ADR 0053's opening invariant, in the one place where the consequence is not a wrong
answer but a silent eviction. `add` replaces an owner's whole token set, and checks every token
before writing any, so a `Conflict` leaves the index exactly as it was and the caller has nothing to
undo.

**The standing constraint that leaves behind: one product tag must name exactly one kind of
token-owning container.** Because `add` replaces rather than merges, and `collisions` reports only
tokens held under a *different* key, two container kinds sharing one product tag would evict each
other's tokens with **no `Conflict` raised** — to the check they are one container writing twice.
Every evicted link then answers 401 while its manifest still holds it. That is the point at which
`TokenOwner` needs a third field naming the kind, and it is written at the type itself because
whoever adds that container will reach for the type long before reading `apps/api/src/runtime.ts`.
ADR 0014's own amendment retracts the consequence that said the index needs no product dimension.

The port is in the kernel rather than in a product package because it is expressed in strings and a
`Product` alone, so it carries no product's entities with it (ADR 0014). ADR 0030's rule is kept
exactly as it was — a service names the port and never `ShareIndex` — and both `ServiceContext` and
`PlanContext` now take `TokenIndex` from `@repo/kernel`; only its address changed.

### Identity stays a capability, and SSO is answered rather than deferred

**There is no identity in this system to federate.** One `ADMIN_PASSWORD`, required at boot and
verified by `POST /v1/auth/login`, and share tokens that carry a **capability and no person**. A seat
has a `name` and a `createdBy`, and neither is an identity: the name is a label an admin typed, and
the lineage names the token a seat was minted through, not a human (ADR 0010). Whoever holds the URL
holds the capability — which is what a share link *is* (ADR 0040).

**What looks like an identity problem is capability attenuation across a trust boundary.** `can()`
over role-and-scope already expresses it, and the bridge resolves it in a single `min` of two roles:
the holder's plan role and the epic's binding role, weaker wins, and the binding's role is the
ceiling only an admin may raise (spec §7.3; the composition itself is phase 4). Claims would not make
that rule safer — they would restate it in a vocabulary with no `scope` in it.

**An IdP would invalidate four accepted ADRs and buy nothing while there is one human.** Named
individually, because "it would invalidate 0012, 0013, 0040 and 0047" is exactly the kind of sentence
that turns out to be false when someone checks:

- **ADR 0012** has the API itself mint the principal: `POST /v1/auth/login` verifies
  `ADMIN_PASSWORD` and returns a short-lived signed admin token, which is what lets it say "the API
  therefore always has a real principal, and `AccessPolicy` is genuinely the only gate". With an IdP
  the bearer becomes a third party's assertion, and the confused-deputy argument this ADR exists to
  close has to be re-made against a callback rather than a login route.
- **ADR 0013** decides one route tree serving **two** principal kinds, admin and link, with handlers
  taking a `Principal` rather than knowing which door a request came through. A person is a third
  kind — neither scoped like a link nor unlimited like the admin — so every "shaped per principal"
  rule written against that pair grows a case, `visibleLinks` and the bootstrap route included.
- **ADR 0040** removes the link cookie because the token **is** the credential rather than a claim
  about one: that is precisely why a `/s/*` page may take its token from its own URL and a Server
  Action may take it as its first argument. Give the visitor an identity and the surface needs a
  session again, and the login-CSRF hazard 0040 closed by deleting `mt_link` comes back with it.
- **ADR 0047** is a password sign-in packaged: `loginWith()`, the refusal table that keeps the form
  from becoming a password oracle, `safeNextPath()`, and a cookie sealing a **live admin bearer**
  under AES-256-GCM. A redirect-and-callback flow replaces most of `@repo/app-session`. Its
  per-product cookie-name decision survives, but its stated reason — both apps are signed into with
  the same `ADMIN_PASSWORD` — is not the reason it would then have.

**The trigger that reverses this is named, so the answer can be revisited without being rediscovered:
the day this product has named users rather than one admin password.** Sooner than that, an IdP buys
nothing, because there is one human and the thing being authorized is a URL somebody was sent. Later
than that, none of the arguments above survive, and the migration is a new ADR rather than an
amendment to one of them.

What genuinely does get late — and it is not SSO — is the action set and the scope union, because a
stored token encodes a role and changing what a role means invalidates links already issued. That is
why ADR 0053 decides the grants in phase 1, before any token is in a client's hands.

### The two capability tables are not collapsed

The kernel's `GRANTS` (`packages/kernel/src/access/policy.ts`) and `@repo/contracts`' `ROWS`
(`packages/contracts/src/capabilities.ts`) encode one fact twice, and they stay that way. **They
cannot import each other at runtime.** `@repo/contracts` holds `@repo/kernel` as a **devDependency
only**, which is what keeps `node:crypto` — reached through the kernel's id generation — out of a
browser bundle, and its own test asserts both halves of that: `dependencies` is exactly `['zod']`,
and `devDependencies['@repo/kernel']` is `workspace:*`. ADR 0038 decided this, over the alternative
of exporting `can()` from contracts by moving the policy there; it is not re-decided here.

**The consolidation is the agreement test, and it is enumerated rather than listed.**
`packages/contracts/src/capabilities.test.ts` builds its cross product from the kernel's own exports:
`TARGETS` is `[...TARGET_KINDS, 'own-scope']`, `SCOPES` is one scope per `Scope` kind, roles come
from `ROLES`, and actions from `ACTIONS`. What it then asserts:

- `CAPABILITY_ACTIONS` sorted equals `ACTIONS` sorted — the projection names every kernel action and
  invents none, so a new kernel action fails this test until it is projected.
- For each role and each scope, `mayReach(role, scope, action, target)` equals
  `can({kind:'link', role, scope, token}, action, targetIn(scope, target))` for **every** action and
  **every** target — the disagreements are collected into a list and compared against `[]`, so a
  failure names which action on which target. That is 3 roles × 3 scope kinds × 51 actions × 10
  targets, plan scope included.
- `capabilities(role, scope)` is the record over `mayReach`, each action answered against its own
  row's `target`, and the four actions carrying a second target — `project:read`, `share:read`,
  `share:revoke`, `share:update` — are asserted to be exactly those four.
- Every action in `ADMIN_ONLY_ACTIONS` is false for every role in every scope.
- The comparison is not vacuous: scope changes the answer for `write` and for `manage`, role changes
  the answer in every scope, and a `view` link clears exactly `project:read` and `task:read`.

Two type-level guards sit beside it, because vitest cannot see them: the spread from `TARGET_KINDS`
catches a kernel kind missing from `CapabilityTarget`, and `BEYOND_KERNEL_KINDS`, a
`Record<Exclude<CapabilityTarget, KernelKind | 'own-scope'>, never>`, fails to compile if the
hand-written union grows a member the kernel does not have.

## Consequences

- **A bearer costs one index lookup and one manifest read**, whichever product it belongs to, and no
  code path chooses between two indexes.
- **The index is per process, and `warmTokenIndex` is what makes a link survive a restart.** It
  walks both stores before `serve()`, each product through the one store it uses; without it every
  token minted before this process started would answer 401 while its manifest still held it. That
  bound is also why a second replica is unsafe.
- **A cross-product token collision stops the boot rather than being tolerated**, because `add`
  propagates `Conflict` out of `warmTokenIndex`. A silent eviction would not, which is the whole
  reason the ownership key carries the product.
- **Nobody has to ask the SSO question again to get an answer**, and the answer names its own expiry.
  An ADR that says "no" without saying what would change the answer is one that gets quietly ignored.
- **Two tables stay in step by test rather than by discipline**, and the test grows by itself: a new
  action, a new target kind or a fourth scope enlarges the cross product without anybody editing it.

## Alternatives considered

**One index per product, each owned by its own domain package.** The tidier seam, and it keeps
`TokenIndex` where ADR 0030 put it. Rejected: the caller has only an opaque string, so the resolver
would have to ask both and reconcile their answers — and the reconciliation would be a guess in the
authorization path, where ADR 0008 locates the real security boundary. It would also have to answer
what a token found in both means, which is a question the single index refuses by construction.

**Key the index by container id and let the caller say which product.** Removes the composite key.
Rejected: it assumes the caller knows the product, and the caller is a bearer — this is the one
question the index exists to answer.

**Namespace the tokens instead** — `mt_…` / `mp_…` prefixes — so the product is readable off the
credential. Rejected: it puts a routing decision inside a secret, where a client could see it and a
future format change would invalidate live links, and it would still not say which container.

**Adopt an IdP now, ahead of the bridge.** Real claims, real logout, and a story for the day a second
person needs access. Rejected above on all four ADRs it would invalidate, and on the fact that there
is one credential to federate. The trigger is recorded so this can be taken up as a decision rather
than as a surprise.

**Generate `ROWS` from `GRANTS` at build time**, so one fact is written once. Genuinely appealing and
rejected on what it would cost: a generated file still has to be checked in for the browser build, so
the fact is present twice either way, and the generator would be a second thing to trust between the
policy and the UI. The agreement test compares the two **answers** instead, which is the property
anybody actually wants, and it catches a hand edit to either side.
