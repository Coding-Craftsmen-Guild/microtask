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
