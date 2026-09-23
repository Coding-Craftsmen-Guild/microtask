# ADR 0014 — Namespace products from day one

**Status:** Accepted · 2026-09-10

## Context

Macroplan will have its own entities rather than being a second skin over Microtask's projects and
tasks. Its feature set is not specified yet, so it ships as a working shell.

The temptation is to leave namespacing until Macroplan has real screens. The problem is what exists
by then: a published OpenAPI document, share links in circulation, and a data directory laid out
without a product dimension. Adding the seam afterwards means breaking client URLs, versioning the
API, and moving files on a live volume.

## Decision

The product dimension goes in everywhere now, while nothing depends on it.

```
/v1/microtask/projects/…          data/microtask/projects/…
/v1/macroplan/…                   data/macroplan/…
/v1/auth                          shared, product-agnostic
/openapi.json, /docs, /healthz    root: process-level, not version-level

packages/kernel             roles, AccessPolicy, ids, errors, generic ports, transfer framework
packages/store              generic adapters only — NodeFileSystem, QueueLock
packages/microtask-domain   Project, Folder, Task, Tab, the ProjectStore port, its adapter, services
packages/macroplan-domain   stub — the seam, reserved
```

Macroplan holds **no credentials for Microtask's data** until it has a screen that needs them.

## Consequences

- `packages/macroplan-domain` is nearly empty for a while. That is the cost of the seam, and it is
  cheap.
- The split forces an early answer to "what is genuinely shared?" — and the answer turned out to be
  narrower than this ADR first claimed: roles, ids, errors, import/export and the *generic* ports.
  That is the reusability requirement made concrete rather than aspirational.
- **A port lives with the types it is expressed in.** This ADR originally assigned "repository ports"
  to `packages/kernel`. Executing the split disproved it: `ProjectStore` is typed in
  `ProjectManifest` and `TaskDocument`, so a shared port would have kept this product's entities
  shared too — the exact coupling the seam exists to prevent. Kernel keeps only the ports typed in
  primitives: `Clock`, `IdGenerator`, `Lock`, `FileSystem`. The Liskov contract suite moved with
  the port, so that guarantee is now per product rather than workspace-wide (ADR 0027).
- **The seam is enforced, not documented.** `packages/kernel` and `packages/store` each ban imports
  of either domain package by name via `no-restricted-imports`. The rule is duplicated per package
  on purpose: a `files:` glob in the *shared* config resolves relative to that config file's own
  directory, which silently disabled an equivalent rule earlier in this project.
- Route paths are one segment longer. Worth it.
- Share tokens stay globally unique across products, so the token index needs no product dimension.
- Two `data/` subtrees means the API resolves a product root per request; the path helpers in ADR
  0005 take the product as an argument.

## Alternatives considered

**Share the domain — Macroplan as a second UI over the same entities.** Maximum reuse, nothing to
namespace, but the products could never diverge without a migration. Rejected: it was explicitly not
what was wanted.

**Defer namespacing until Macroplan is specced.** Rejected: doing it after an OpenAPI document and
live client links exist is far more expensive than doing it now.

## Amended · 2026-09-11 — the meta routes are not versioned

`openapi.json` and `/docs` are served at the **root**, not under `/v1`, alongside `/healthz`. All
three describe the process rather than an API version, and they are registered before the `/v1`
mount because mounting copies an already-complete child (ADR 0024). The path list above said
`/v1/openapi.json`; it is `/openapi.json`.

## Amended · 2026-09-22 — the shell exists, and the seam is documented rather than enforced

`apps/macroplan` is built: a Next 16 app an admin signs into against the product-agnostic
`/v1/auth/login`, sealing its own `mp_admin` cookie under its own `COOKIE_SECRET`, holding its own
service key, deployed as a third compose service on its own hostname. It has no entities and no
screens beyond an empty dashboard, which is what this ADR meant by a working shell.

Building it turned up one thing this record had implied and nothing enforced. **A service key is
not scoped to its product's route subtree.** `requirePrincipal` resolves `x-api-key` to a service
name, records it on the context, and never compares it with the `/v1/<product>/` segment — so the
`macroplan=…` key plus any valid admin bearer reaches `/v1/microtask/*`. The sentence above,
"Macroplan holds **no** credentials for Microtask's data until it has a screen that needs them", is
therefore a statement about what is configured, not about what is possible.

**That is deliberate, and it is not merely tolerated — it is the direction.** The intended shape is
that Macroplan will reach Microtask's entities through the **share-link system**: a Macroplan plan
or milestone reflecting into Microtask through a token, held the way any client holds one, in a URL
and never in a cookie (ADR 0040), carrying exactly the role and scope that token names (ADR 0038).
A guard refusing every cross-product call would have to be taken back out to build that.

So no guard is added, and the exposure is recorded instead of hidden:

- The key is server-side only. `@repo/api-client` reads no environment variable and takes the key
  as an argument precisely so it can never reach a browser bundle (ADR 0012), and no page in either
  app ships it.
- It confers no authority on its own: a service key with no bearer is a 401 (ADR 0012).
- There is one admin. A key that could reach the other product's routes reaches data that admin
  already has a password for.

What the seam does still hold, mechanically: two data subtrees, two route prefixes, two domain
packages with a lint rule keeping `kernel` and `store` out of both, one service key per product so
the API records which product made a call, and — from ADR 0047 — **two cookie names**, so signing
into one product does not sign the other out and neither app's server can open the other's bearer.

If Macroplan ever reaches Microtask's data by any route other than a share token, that is the point
at which the guard becomes worth building, and it needs its own record.

## Amended · 2026-09-23 — one consequence retracted: the token index does need the product dimension

The consequence above reads "Share tokens stay globally unique across products, so the token index
needs no product dimension." **The premise survives and the inference fails.** Tokens genuinely are
still globally unique, and the index is what enforces it: `ShareIndex` keys its map by the token
alone, so `find` takes a bare bearer and answers without being told where to look
(`packages/kernel/src/access/share-index.ts:14`). What the sentence went on to conclude is wrong
twice over. `TokenOwner` carries a `product` (`packages/kernel/src/access/token-index.ts:23`), and
that field is load-bearing in two distinct ways.

**It selects the store the live link is read from.** `PrincipalResolver` asks the index once and then
indexes a `Record<Product, LinkDirectory>` by the product the index answered:
`this.#directories[owner.product].readLink(owner.containerId, bearer)`
(`apps/api/src/auth/principal-resolver.ts:60`). The two directories are different reads — a project
manifest through `ProjectStore`, a plan manifest through `PlanStore`, with the plan's scope derived
rather than stored (`apps/api/src/auth/link-directory.ts:68`). An index answering only "some
container owns this" would not say which product's store to open, and the resolver would be back to
asking both and choosing between their answers, in the authorization path.

**It is half the ownership key.** The key is `product` and `containerId` joined
(`packages/kernel/src/access/share-index.ts:4`), and it is the thing `add`, `remove` and `collisions`
each compare (`:41`, `:52`, `:22`). Without the product, a plan and a project **of the same ULID**
would be one owner and each would evict the other's tokens. The two products draw their ids from
separate ULID sequences, so that pair is possible rather than hypothetical, and it is seeded
deliberately at both levels: in the kernel's own suite
(`packages/kernel/src/access/share-index.test.ts:31`, `:72`, `:87`), and over HTTP, where the API's
macroplan fixture gives a whole plan the id `IDS.p1` already held by a project
(`apps/api/src/testing/macroplan-harness.ts:148`) so that the guard suite can prove a seat on one is
refused on the other in both directions.

**The standing constraint the second role leaves behind: one product tag must name exactly one kind
of token-owning container.** The reason is mechanical rather than stylistic. `add` **replaces** an
owner's whole set rather than merging into it — it calls `this.remove(mine)` and only then records
the tokens it was handed (`packages/kernel/src/access/share-index.ts:47`). So two kinds of container
sharing one product tag would evict each other's tokens, and **no `Conflict` would be raised**:
`collisions` reports only tokens held under a *different* key (`:22`), and to it the two containers
are one container writing twice. Every evicted link then answers 401 while its manifest still
holds it.

Where that eviction would not be caught, which is the whole trap: not in `ShareIndex`, whose
collision check passes; not at the service that writes, whose own store write lands intact; and not
at boot — `warm` calls `add` per container and lets `Conflict` propagate out of `warmTokenIndex`
before `serve()`, so a genuine clash does stop the process, while a silent eviction leaves it
listening and returns a token count that looks correct (`apps/api/src/runtime.ts:26`, `:92`). It has
been measured, from plans briefly listed under `microtask/`, and the regression that pins the
per-product read is `apps/api/src/runtime.test.ts:118`. The constraint is written at `TokenOwner`
itself (`packages/kernel/src/access/token-index.ts:6`), because whoever adds the third token-owning
container will be reaching for that type long before reading `runtime.ts`.

Only that one inference is retracted. The decision this ADR takes — namespace the products now —
stands, and so does every other consequence it draws: the index turned out to be one of the places
the product dimension was needed first rather than one where it was never needed at all.
