# ADR 0003 — Keep JSON files on disk, no database

**Status:** Accepted · 2026-09-10

## Context

The new hierarchy (projects, folders, tasks) plus search is the point where a relational store would
normally arrive. SQLite would give real queries, foreign keys and migrations from a single file, with
no server to run.

## Decision

Storage stays JSON files on disk, behind repository interfaces owned by the package that defines
the entities those interfaces carry — so this product's `ProjectStore` lives in
`packages/microtask-domain`, not in `packages/kernel`. ADR 0014 records why a port cannot outlive
its types.

## Consequences

- Referential integrity is enforced in code, not by the store. Orphans are possible, so every orphan
  case needs a defined behaviour — see ADR 0006.
- Cross-project queries read many files. Mitigated by keeping list-level data in a per-project
  manifest (ADR 0005) and by capping search at names (ADR 0021).
- The data volume stays human-readable and hand-editable, which the migration path depends on: the
  operator pulls the volume down, adjusts files, and imports them.
- Because the repository interfaces are the seam, swapping in SQLite later is a new package rather
  than a rewrite.

## Alternatives considered

**SQLite with Prisma or Drizzle.** Better queries, real constraints, migrations. Rejected for now: it
adds a schema-migration story to a restructure that already replaces a live app, and the data
volumes involved are tiny.

**Postgres.** Rejected outright — a service to run for a single-admin app.
