# Architecture decision records

One file per decision. Each records the context at the time, the decision, its consequences, and
what else was considered. Numbers are permanent; a decision that changes gets a **new** ADR that
supersedes the old one rather than an edit.

The implementation-facing detail — domain model, page map, feature-parity inventory, cutover
runbook — lives in [`../superpowers/specs/2026-09-10-monorepo-restructure-design.md`](../superpowers/specs/2026-09-10-monorepo-restructure-design.md),
which references these by number.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-pnpm-turborepo-monorepo.md) | Restructure as a pnpm + Turborepo monorepo | Accepted |
| [0002](0002-standalone-api-not-nextjs.md) | One standalone API, not Next.js route handlers | Accepted |
| [0003](0003-json-files-no-database.md) | Keep JSON files on disk, no database | Accepted |
| [0004](0004-project-task-folder-hierarchy.md) | Rename Project to Task; add Project with one-level folders | Accepted |
| [0005](0005-manifest-plus-task-files.md) | Directory per project: manifest plus one file per task | Accepted |
| [0006](0006-write-ordering-not-transactions.md) | Write ordering instead of multi-file transactions | Accepted |
| [0007](0007-progress-derived-then-cached.md) | Progress is derived, then cached in the manifest | Accepted |
| [0008](0008-three-roles-one-policy.md) | Three roles behind one pure AccessPolicy | Accepted |
| [0009](0009-deny-by-default-collections.md) | Collection and top-level actions are deny-by-default | Accepted |
| [0010](0010-revocation-cascade-lineage.md) | Revocation cascades through link lineage | Accepted |
| [0011](0011-task-is-default-share-scope.md) | Task is the default share scope | Accepted |
| [0012](0012-dual-credential-api.md) | The API requires a service key *and* a principal token | Accepted |
| [0013](0013-one-route-tree-two-principals.md) | One route tree, two principal kinds | Accepted |
| [0014](0014-namespace-products-now.md) | Namespace products from day one | Accepted |
| [0015](0015-actions-except-bytes.md) | Server Actions, except anything that moves bytes | Accepted |
| [0016](0016-conditional-document-writes.md) | Document writes are conditional | Accepted |
| [0017](0017-drop-in-import-export.md) | Drop-in import/export instead of a migration CLI | Accepted |
| [0018](0018-sniff-by-directory-group.md) | Sniff dropped files by directory group, not individually | Accepted |
| [0019](0019-token-identity-on-import.md) | Replace preserves tokens; import-as-new remints them | Accepted |
| [0020](0020-zip-server-side-only.md) | Zip archives are expanded server-side only | Accepted |
| [0021](0021-names-only-search.md) | Search matches names only | Accepted |
| [0022](0022-hostname-continuity-gated-cutover.md) | Microtask keeps the live hostname; the merge is not the cutover | Accepted |
| [0023](0023-typescript-strict-shared-config.md) | TypeScript everywhere, one strict shared config | Accepted |
| [0024](0024-framework-free-zod-contracts.md) | Zod contracts stay framework-free; the API assembles the OpenAPI document | Accepted |
| [0025](0025-shadcn-tailwind-shared-package.md) | shadcn/ui and Tailwind v4 in `packages/ui`, with explicit `@source` paths | Accepted |
| [0026](0026-docker-turbo-prune-standalone.md) | Three images via one `turbo prune` per image and Next standalone output | Accepted |
| [0027](0027-code-style-solid-enforced.md) | Code style: SOLID, small files, TSDoc only, enforced by ESLint | Accepted |
| [0028](0028-autosave-under-keepalive-cap.md) | Autosave does not rely on flush-on-unload for large documents | Accepted |

## Verification

ADRs 0024–0026 and 0028 state configuration and platform behaviour that was checked against official
documentation and vendor source on 2026-09-10, rather than recalled. That pass corrected four things
worth knowing about, because each would have been implemented as written:

- **`fetch` `keepalive` really is capped at 64 KiB.** An earlier review claimed otherwise and a
  verifier agreed with it; both were wrong. It breaks flush-on-unload for real documents — ADR 0028.
- **`readEntries()` really does batch at 100 entries** in Chromium. A one-shot directory read
  silently truncates a dropped folder — ADR 0018.
- **Node 20 is end-of-life** (2026-04-30) — ADR 0026 pins `node:24`.
- **The official shadcn monorepo template ships a broken `@source` path**, off by one directory
  level, which fails silently — ADR 0025.

Two things remain genuinely unverified and are called out in their ADRs rather than papered over:
the end-to-end Zod-`.meta()`-to-OpenAPI path (ADR 0024 — a ten-minute spike before implementation),
and everything Coolify-specific, above all whether Coolify renames named volumes (ADR 0026 — checked
on the server, on a throwaway resource, before cutover).
