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

---

## Amended · 2026-09-12 — the client-side half of the normaliser cannot be the same function

The consequences above say both browser shapes "go through one normalising helper client-side, then
get re-validated server-side with a resolved-prefix check against the data root". Building the
grouper found that the first clause cannot be satisfied literally, and the reason is worth recording
because the obvious workaround is to duplicate the function.

`normaliseImportPath` lives in `@repo/microtask-domain`. The browser module that would call it is
`packages/ui/src/transfer/harvest.ts`, and **`packages/ui` cannot import it**:
`packages/eslint-config/index.js` bans `@repo/*-domain` and `@repo/*-domain/*` outright for that
package (ADR 0014), and the package does not depend on it.

Relocating the function to `@repo/contracts`, which `packages/ui` could be allowed to import, does
not work either, for two measured reasons. It throws `Invalid` from `@repo/kernel`, and contracts
holds `@repo/kernel` as a **devDependency** with a committed test asserting exactly that
(`capabilities.test.ts`, ADR 0038) — so contracts may not reach it at runtime. And `packages/ui` is
shared by two products, so giving it a dependency on one product's contracts is the coupling ADR 0014
exists to prevent.

**So the split is:** `harvest.ts` is the one helper both browser sources go through, and its whole
job is *decoding* — reconciling a directory pick's `File.webkitRelativePath` with a drop's
`FileSystemEntry.fullPath`, which is drag-root-relative and carries a single leading `/` by spec.
`normaliseImportPath` is the **server's** authority and the only place a path is refused. It is not
duplicated in the browser.

Nothing is lost that this ADR was protecting. The security property was always the server-side
check — "a path that reached the API was last touched by the client" — and that is unchanged and
tested by feeding hostile paths straight to the server-side entry point. What the client-side copy
would have added is earlier feedback on a drop that cannot import: an upload that is refused after
posting rather than before. That is a smaller cost than a second implementation of a rejection rule,
which is the one kind of duplication that fails silently — the two copies disagreeing is
indistinguishable from either one working.

## Amended · 2026-09-12 — recognised names are matched case-sensitively

The shapes in the table above are recognised by name, and the grouper first matched `project.json`
case-sensitively while accepting a task file's `.json` suffix case-insensitively. That is two answers
to one question, and the generous half is the dangerous one: it admits a file as a **task document**
on the strength of a suffix, where the strict half merely declines to recognise a directory and
reports it as a row the operator can see.

So every recognised name is matched case-sensitively, suffix included. The only shape this product
writes is lowercase throughout, so another spelling can reach the grouper only from a
case-insensitive filesystem handing back a name nothing here ever wrote — which is a file to report,
not one to guess at. `volume/<id>/Project.json` is therefore a loose file with its own preview row,
and `volume/<id>/tasks/<id>.JSON` is not folded in as a member.
