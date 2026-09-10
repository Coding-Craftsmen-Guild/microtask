# ADR 0021 — Search matches names only

**Status:** Accepted · 2026-09-10

## Context

ADR 0004 adds a level to the hierarchy, so finding things needs search. The natural expectation is
that search covers document text too — a client looking for "SSL" would want the checklist item, not
just a task called SSL.

## Decision

Search matches **names only**: project, folder, task and tab names. Document content is not searched.

- Within a project, search is a client-side filter over the manifest the page already holds.
- Across projects, `GET /v1/microtask/search` reads one manifest per project.
- Results are scoped per principal (ADR 0009): a task-scoped link must not learn its ancestor folder
  or sibling task names through a search response.

## Consequences

- No index to build, invalidate or keep consistent with the documents.
- Cross-project search cost stays "one file per project", which is what ADR 0005's manifest split was
  designed to make cheap. Full-text search would defeat that by requiring every task file.
- The visible gap: a client searching for text inside a checklist gets nothing. Since names are what
  the tree shows, this reads as "filter the tree", and the UI should present it that way rather than
  as general search — an empty result for a phrase that is plainly in a document would look broken.
- Search does not need to be an API concern for the in-project case at all, which keeps it simple.

## Alternatives considered

**Names plus document text.** What users will eventually want. Rejected for now: either every task
file is read per query, or an index is introduced — and an index over documents that a client edits
live is a consistency problem, which is a decision of its own.

**Names plus filters** (has-open-tasks, updated-recently, by role). More useful and more UI.
Deferred; nothing here blocks adding it later.
