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
