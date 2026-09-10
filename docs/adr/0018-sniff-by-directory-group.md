# ADR 0018 — Sniff dropped files by directory group, not individually

**Status:** Accepted · 2026-09-10

## Context

The first version of ADR 0017 said import "sniffs each file independently" and recognised three
shapes: a v2 workspace bundle, a v2 single project, and a legacy Microtask project.

Reviewed against ADR 0005, that is incoherent — it breaks the app's **own** directory export. A
`tasks/<taskId>.json` file is `{ id, tabs[], createdAt, updatedAt }`; on its own it matches none of
the three shapes, so it lands in the "skipped, unrecognised" bucket. Meanwhile `project.json` *does*
match "v2 single project" and imports successfully with its task manifest intact and every task's
tabs missing — because the tabs were in the files that were just skipped.

The result is a successful-looking import of structurally valid projects whose documents are all
gone, behind a preview that truthfully said "3 projects, 9 tasks". And it is exactly the flow an
operator will hit: back up the volume, then restore it by dropping the folder in.

## Decision

Bucket every dropped or picked file **by directory path first**, then classify each bucket. Four
recognised shapes:

| Shape | Detected by |
| --- | --- |
| v2 workspace bundle | `format` + `version`, `projects[]` |
| v2 single project | `format` + `version`, one project |
| **v2 project directory** | a directory containing `project.json`; its `tasks/*.json` are members |
| legacy Microtask project | `{ id, name, tabs[], shareLinks[] }`, no `format` key |

A `tasks/*.json` orphan with no sibling `project.json` is an **error naming the missing manifest** —
never a generic skip.

The preview runs a **manifest/file cross-check** per project — "tasks in manifest: 9, task files
found: 9" — and a mismatch **blocks** the import rather than warning about it.

## Consequences

- Path information is required, so the implementation must use `File.webkitRelativePath` for a
  directory pick and `FileSystemEntry.fullPath` for a drop. Both shapes go through one normalising
  helper client-side, then get re-validated server-side with a resolved-prefix check against the
  data root. Loose files with no path are classified individually as before.
- **Reading a dropped directory has two constraints that fail silently if missed.** `readEntries()`
  batches at 100 entries in Chromium, so it must be pumped on **one** reader per directory until it
  returns an empty array — creating a second reader restarts it. And `DataTransfer` must be harvested
  **synchronously** in the drop handler: after the event's dispatch ends the drag data store returns
  to protected mode, `webkitGetAsEntry()` returns `null` and `.files` is empty. So no `await` may
  happen before the items are read. A regression test drops a folder of 150+ files.
- The directory **picker** is `<input type="file" webkitdirectory multiple>` (Baseline, ~93 %);
  `showDirectoryPicker()` is a Chromium-only enhancement behind a real click on HTTPS. The `.zip`
  path (ADR 0020) is the universal fallback.
- The cross-check also catches truncated directory reads and partial uploads, which would otherwise
  present as a clean import.
- "Skipped" and "error" become distinct outcomes in the preview. Silent skipping is what caused the
  problem.
- A single task file can never be imported alone. That is correct — it has no name, because ADR 0005
  keeps names in the manifest — but it means the answer to "drop in any file and it works" is bounded
  by "a task needs its project".

## Alternatives considered

**Give task files a self-describing header** (name, projectId) so they can stand alone. Rejected: it
duplicates the name that ADR 0005 deliberately keeps in exactly one place, reintroducing drift.

**Only accept single-file bundles, drop directory import.** Simpler classification, but the natural
thing to drop is a copy of the volume, and refusing it would be hostile.
