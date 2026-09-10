# ADR 0009 — Collection and top-level actions are deny-by-default

**Status:** Accepted · 2026-09-10

## Context

`can(principal, action, target)` (ADR 0008) is keyed on a target. Several routes have no single
target: `GET /projects` lists everything, `GET /search` spans projects, `GET /export` dumps a
workspace. With no target to check, a naive policy returns "no rule matched" — and if that is
implemented as anything other than a refusal, those routes default **open** to any link holder.

This is the difference between a role model that looks right in a table and one that holds at the
edges.

## Decision

`AccessPolicy` has **no wildcard or fallthrough branch**. Every route whose target is a collection
or the workspace itself names its required principal explicitly:

- `GET /projects`, `POST /projects`, `POST /imports` — admin only.
- `GET /search` — results are filtered to the caller's scope; a link principal never receives an
  unfiltered list, and a search result never reveals a name outside its scope.
- `GET /export` — `manage` within its own scope, admin for the workspace.

A link principal calling a collection route gets scope-filtered results or a 403. Never an
unfiltered list.

## Where the filtering predicate lives

Shaping a collection needs the same question `can()` answers, asked once per candidate. That is
in tension with the rule that authorization happens at exactly one place in `apps/api`, so the
distinction is drawn here rather than left to whoever writes the next service:

- **A gate** is one check on the way in, for a request with a single target. It belongs to the
  API, at the single `authorize()` call site, and a domain service must never perform one — a
  service that also gated would give two places to forget.
- **A filter** is a per-item predicate over a result set. It has to run where the items are, so it
  belongs to the service or the view that assembles them. Doing it in the API is not an option:
  the API would have to receive the unfiltered set first, which is the leak this ADR exists to
  prevent.

A filter calls `can()` directly. It does **not** reimplement scope containment: `withinTaskScope`
and `inScope` are deliberately private to `policy.ts`, and a second copy of a security predicate
is worse than either place calling the first one. So `can()` legitimately appears inside
`SearchService` and inside the views, and the "one call site" invariant that Plan 2 tests means
one **gate** — one `authorize()` — not one mention of `can()`.

## Consequences

- Search results must be shaped per principal, not just filtered after the fact. A task-scoped link
  must not learn its ancestor folder or sibling task names through a search response.
- Because a filter and a gate ask the same function, a role change cannot make them disagree.
  That is the property being bought, and it is the reason the duplication is refused.
- The exhaustive policy test must include collection and top-level actions, or this ADR is unenforced
  documentation.
- A new collection route is a decision, not a default. Adding one without naming its principal fails
  the test suite.

## Alternatives considered

**Treat a missing rule as "allow if the principal has any access to anything".** This is the
accidental behaviour being prevented, not a real option.

**Give collections a synthetic target** (a workspace object) and let the matrix handle them. Tidier
in theory, but it hides top-level authority inside the same table as per-resource authority, which
is exactly the distinction the `manage` role depends on.
