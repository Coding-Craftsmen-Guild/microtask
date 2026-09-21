# ADR 0021 — Search matches names only

**Status:** Accepted · 2026-09-10

## Context

ADR 0004 adds a level to the hierarchy, so finding things needs search. The natural expectation is
that search covers document text too — a client looking for "SSL" would want the checklist item, not
just a task called SSL.

## Decision

Search matches **names only**: project, folder and task names. Document content is not searched,
and **neither are tab names**.

Tab names were in this decision originally and had to come out, because ADR 0005 makes them
unreachable at this cost. A tab name lives only inside its task file; the manifest holds a
task's id, name, position, folder and progress, and ADR 0005 forbids duplicating a field into
the manifest precisely so nothing can drift. So searching tab names means opening every task
file in every project on every query — up to `tasksPerProject` reads per project, against the
one manifest read this decision is built on. The manifest split is what makes search cheap, and
tab names are the one thing it puts out of reach.

The alternative, copying tab names into the manifest, buys a second place for a name to be
wrong and a write amplification on every tab rename. Not worth it for the least identifying of
the four name kinds: a tab is "General" or "Content" far more often than it is anything a
person would search for.

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

## Amended · 2026-09-21 — the stated reason is out of date, and the legacy import now pays for it

Two things above are no longer true of this repo, and both are recorded here rather than acted on,
because acting on either is a decision of its own.

**"A tab name lives only inside its task file" is false.** [ADR 0034](0034-task-entry-carries-list-row.md)
put `tabCount` and `tabNames` on the manifest entry afterwards, so up to `MAX_LISTED_TAB_NAMES` (8)
tab names per task are already in the one file a search reads. The cost argument this decision rests
on — *"opening every task file in every project on every query"* — therefore does not apply to those
eight. It still applies to the ninth and beyond, and to document text.

**The legacy import now depends on it.** Design §7.6 was corrected on this date: a legacy file
becomes one Task whose tab strip is the legacy tabs, rather than one Task per tab. Under the old
mapping a legacy tab name *was* a task name, so search found it; under the new one it is a tab name
and search does not. For the live backup that is 17 tab names — "Critical", "Security", "i18n",
"Test suite" and the rest — which were findable as task names and are not any more, against the 4
project names, now the 4 task names, which still are.
`legacy.test` "cannot find it by a legacy tab name, tab names being outside search's reach" pins the
behaviour so it is a recorded loss and not a surprise.

**Not fixed here**, deliberately. Searching `tabNames` off the manifest would be cheap but
**incomplete**: the field stops at eight names, so the eleven-tab project in the live backup would
match on its first eight tabs and silently not on its last three — a search that is right most of
the time is worse than one that is honestly narrow. Making it complete means either raising the cap,
which grows every manifest, or reading task files, which is the cost this ADR exists to avoid. That
trade wants its own decision.
