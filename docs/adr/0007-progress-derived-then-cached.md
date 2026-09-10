# ADR 0007 — Progress is derived, then cached in the manifest

**Status:** Accepted · 2026-09-10

## Context

The current app has an explicit principle: progress is never stored. `done / total` is counted by
walking `taskItem` nodes on every render, which is cheap because one project is one file already in
memory.

ADR 0005 splits documents into per-task files. A project's overall progress now needs every task
file, and a projects list needs that for every project — so rendering a list of 20 projects would
read the entire workspace.

## Decision

The document stays the **source of truth**. The manifest carries a per-task `{ done, total }`
**cache**, written by the same operation that writes that task's document.

- List, tree and search views read the cache only.
- Opening a task recomputes from the document and corrects the cache if it disagrees.
- A missing cache entry is computed on read, never treated as zero.

## Consequences

- The original principle becomes "progress is never *authoritative*". Stated explicitly so nobody
  later reads the cache as truth, or deletes it as redundant duplication.
- A hand-edited data volume — which the migration path relies on — can produce a stale cache. Because
  the cache is corrected on task open and is never authoritative, the failure mode is a briefly
  wrong number, not wrong data.
- Import must write the cache, or every imported project shows 0/0 until each task is opened once.

## What the types make unreachable

`TaskEntry.progress` is a required field, so a manifest entry with **no** cache cannot be
constructed through the domain at all — the "compute it on read rather than showing zero" rule
is reachable only from hand-edited or imported data. That is not a reason to drop the rule,
because ADR 0017 admits exactly such data, but it does mean the case has to be planted with a
deliberate cast in a test. Without that cast the clause would be untestable, and an untestable
clause quietly becomes an unimplemented one.

The same distinction decides what a correction may touch: recomputing a stale cache writes the
manifest but **must not** stamp `updatedAt`, or merely opening a task would reorder the project
list by recency and the timestamp would stop meaning "someone changed this".

## Alternatives considered

**Keep it purely derived.** Faithful to the original principle, but turns every list view into a
full-workspace read. Rejected on cost.

**Store progress as the source of truth.** Rejected — it would then disagree with the document, and
the document is what the client actually ticks.
