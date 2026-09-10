# ADR 0004 — Rename Project to Task; add Project with one-level folders

**Status:** Accepted · 2026-09-10

## Context

Today's top-level entity is a Project holding tabs, where each tab is a rich-text/checklist
document. In practice that entity *is* a checklist, so there is nothing above it to organise with,
and the projects list is flat.

## Decision

Today's Project becomes a **Task**, structurally unchanged — it still owns tabs, and each tab still
owns a Tiptap document. A new **Project** sits above it, holding tasks and optional **folders** that
group them.

Folders are **one level deep**: a folder holds tasks, never other folders. A task is either in a
folder or at the project root (`folderId: string | null`).

A Project represents a **phase or workstream**, not a client. Recorded here because it is the reason
for ADR 0011.

## Consequences

- Every URL, API path, storage path and UI label changes. There is no in-place rename.
- Existing data must be mapped — an old project becomes a Project, and each of its tabs becomes a
  Task. See ADR 0019.
- One folder level keeps the tree renderable as a flat list with headers, and keeps "move" to a
  single `folderId` field. Deeper nesting would need a parent chain plus recursive permission
  resolution.
- Because a Project spans clients, project-scoped sharing becomes a disclosure risk (ADR 0011).

## Alternatives considered

**Folders above projects.** Organises the project list rather than the work inside a project.
Rejected — the ask was to reorganise what is inside.

**One generic nestable tree** holding folders, projects and tasks interchangeably. Elegant, but no
guaranteed depth means every consumer handles arbitrary recursion. Rejected as disproportionate.

**Arbitrarily nested folders inside a project.** Deferred rather than refused; it can be a later ADR
if one level proves too flat in use.
