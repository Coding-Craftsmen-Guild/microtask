# ADR 0034 — `TaskEntry` carries what a list row renders

**Status:** Accepted · 2026-09-11

## Context

`TaskEntry` is the manifest's record of a task: `id`, `name`, `position`, `folderId`, `progress`.
ADR 0005 put it there so a list or search view reads one file per project, and ADR 0007 added the
cached `progress` for the same reason.

The task rows the spec draws need three things that entry does not hold. The project page's tree
shows a progress bar, which `progress` supplies — but the parity inventory records two further
behaviours from the app being replaced that are load-bearing on the list: the tab-name chips
(`tabs.slice(0, 8)`, with tabs 9 and up silently dropped) and the "updated 3h ago" relative
timestamp in the metadata line. Neither has a data source in the manifest. `updatedAt` exists on the
task *file*, and tab names exist only inside it.

Without them the only way to render a list is a full task read per row, which is precisely the
whole-workspace read ADR 0005 exists to prevent.

## Decision

**`TaskEntry` gains `updatedAt`, `tabCount` and `tabNames`** — the first eight names, matching the
legacy `slice(0, 8)` so the chips look the same and the cap is a contract rather than a UI
accident.

All three are free. The task mapper already reads each whole task document to compute `progress` for
the cache, so the tab array is in hand at exactly the moment the manifest entry is written. Nothing
new is read, and the same write that keeps `progress` honest keeps these honest.

They are cache fields with the same standing as `progress` under ADR 0007: the task file is the
source of truth, a missing or stale entry is recomputed on read of that task, and list and search
views use the cache only.

## Consequences

- Three more fields on the hottest denormalised record in the system, and three more things a write
  path can forget to update. The mitigation is that they are written by the same operation that
  writes `progress`, so forgetting one means forgetting all four, which the progress tests already
  catch.
- `tabNames` truncates at eight, so a list row cannot render a ninth chip. That is the legacy
  behaviour, including the absence of a "+N more" indicator, and `tabCount` is the honest total for
  anything that wants to show one.
- Renaming a tab now dirties its project manifest, not only its task file. Write ordering is
  unaffected — the task file is still written first (ADR 0006) — but a manifest write joins an
  operation that previously touched one file.
- The project page renders its whole tree from one manifest read, which is what makes the
  client-side names-only filter in the spec viable at all.

## Alternatives considered

**Read each task file when rendering a list.** Rejected: N reads per render, growing with the
project, to produce data the manifest was designed to answer without them.

**Put `updatedAt` on the entry and leave the chips out.** The chips are the cheapest of the three to
drop and the most visible in the parity inventory, and dropping them would be a silent regression
against a screen clients' work is organised on. Rejected as a decision made by omission.

**A separate `GET .../tasks/summaries` endpoint.** A second denormalisation with a second staleness
story, for data the manifest already has in memory once it is read.
