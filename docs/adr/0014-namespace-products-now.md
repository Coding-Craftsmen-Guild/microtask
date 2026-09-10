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
/v1/auth, /v1/openapi.json, /healthz     shared, product-agnostic

packages/kernel             roles, AccessPolicy, ids, errors, repository ports, transfer framework
packages/microtask-domain   Project, Folder, Task, Tab and their services
packages/macroplan-domain   stub — the seam, reserved
```

Macroplan holds **no credentials for Microtask's data** until it has a screen that needs them.

## Consequences

- `packages/macroplan-domain` is nearly empty for a while. That is the cost of the seam, and it is
  cheap.
- The split forces an early answer to "what is genuinely shared?" — and the answer becomes
  `packages/kernel`: roles, ids, errors, ports, import/export. That is the reusability requirement
  made concrete rather than aspirational.
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
