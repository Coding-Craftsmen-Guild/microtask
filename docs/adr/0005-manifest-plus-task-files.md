# ADR 0005 — Directory per project: manifest plus one file per task

**Status:** Accepted · 2026-09-10

## Context

Today one project is one JSON file containing every tab and every document. Under ADR 0004 a project
holds many tasks, each holding many tabs, each holding a document capped at 2 MB. Keeping one file
per project would mean a multi-megabyte file rewritten on every keystroke.

## Decision

One directory per project:

```
data/microtask/projects/<projectId>/
  project.json          name, folders[], task manifest, share links, progress cache, timestamps
  tasks/<taskId>.json   tabs[] only
```

A task's `name`, `position` and `folderId` live **only** in the manifest. The task file holds only
tabs. No field is duplicated, so there is nothing to drift.

## Consequences

- Autosave rewrites one small task file instead of the whole project.
- Listing a project, rendering its tree and searching each read exactly one file.
- The boot-time share-token index reads only manifests, never task files.
- **The atomicity guarantee is lost.** One file per project meant `tmp` + `rename` *was* the commit;
  a project is now N+1 files with cross-references. ADR 0006 replaces that guarantee.
- Any operation that creates, deletes or moves a task touches two files.
- A task file is not independently meaningful — it carries no name. This is why import must sniff by
  directory group rather than per file (ADR 0018).

## Alternatives considered

**One file per project.** Keeps atomicity for free. Rejected on write amplification and file size.

**One file per tab.** Even smaller writes, but then a task needs its own manifest too and the file
count multiplies for no further gain.
