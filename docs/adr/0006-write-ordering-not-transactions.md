# ADR 0006 — Write ordering instead of multi-file transactions

**Status:** Accepted · 2026-09-10

## Context

ADR 0005 splits a project across a manifest and N task files, which loses the atomic commit that
one-file-per-project gave for free. The existing `withLock` serialises callers; it is not a
transaction. So a kill mid-operation can leave the manifest describing a task file that does not
exist. Containers are killed on every deploy, which makes this routine rather than exotic.

## Decision

No journal, no commit marker, no `fsync`. Two ordering rules instead:

1. **Create and update: write the task file first, then the manifest.**
2. **Delete: write the manifest first, then unlink the task file.**

A crash can then only ever leave a file that nothing references — harmless garbage — never a manifest
entry pointing at a missing file.

Defensively, `packages/store` treats a manifest entry whose task file is missing or unparseable as a
**single unreadable task**. It renders as broken in the UI; it never fails the whole project.

A bulk import writes many files at once, so it stages into a temporary directory and moves the
project directory into place as its final step.

## Consequences

- Crash recovery needs no repair step and no startup scan.
- Orphaned task files accumulate slowly. They are invisible and harmless; a sweeper can be a later
  ADR if it ever matters.
- Every mutation in `packages/store` must respect the ordering. This is exactly the kind of rule
  someone "tidies up" later, so it is tested directly — crash-ordering tests kill between the two
  writes of each mutation and assert the self-healing rule holds.

## Alternatives considered

**A write-ahead journal or `COMMIT` marker.** Real atomicity, and real complexity: recovery logic,
its own crash cases, and a format to version. Disproportionate here, where the worst outcome is
re-importing from a file the admin still holds.

**Reverting to one file per project.** Rejected in ADR 0005.
