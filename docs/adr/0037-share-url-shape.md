# ADR 0037 — The share URL shape: `/s/<token>`, plus a task segment when the scope is a project

**Status:** Accepted · 2026-09-11

## Context

The spec gives a client exactly one URL: `/s/:token?tab=<tabId>`. That is enough for the default
share scope, where the token names one task (ADR 0011) and `?tab=` picks a tab inside it.

It is not enough for a project-scoped link, which ADR 0011 keeps available for the case where a
client's work spans several tasks. There, `/s/<token>` has to be a list of tasks, and a client who
opens a task from it needs a URL for that task. A single `?tab=<tabId>` cannot express it: a tab id
is only meaningful inside a task, so the URL would name a tab without naming which task it belongs
to. Nothing in the spec's one-route form can address "this task, this tab".

ADR 0022 separately promised `/share/<token>` would `301` to `/s/<token>` for links already in
clients' hands.

## Decision

**Task-scoped link.** `/s/<token>` **is** the task. `?tab=<tabId>` selects a tab within it,
validated against that task's own tabs and falling back to the first, so a token can never reach
another task's tab. There is no list, because a task-scoped link must not learn that siblings exist.

**Project-scoped link.** `/s/<token>` is the task list the link's scope contains, and
`/s/<token>/t/<taskId>?tab=<tabId>` is one task within it. The `/t/` segment exists so a task id and
a tab id are never ambiguous, and so a client can bookmark or be sent a deep link to one checklist
without being handed a second token.

**`/share/<token>` is a `308` to `/s/<token>`**, which amends ADR 0022's `301`. Next's permanent
redirect is a 308 — both `permanent: true` in `next.config.js` and `permanentRedirect()` — so a 301
was describing a response this app would have to hand-write a route handler to produce. A 308 also
preserves the method, which costs nothing for the GETs that actually arrive and removes a class of
question about what an intermediary is allowed to rewrite.

**Every `/s/*` route is `noindex`.** The app being replaced set `robots: noindex, nofollow` on
`share.html` only, which was the whole of its client surface; here the client surface is a route
subtree, so the directive belongs to the subtree rather than to one page.

## Consequences

- Two client route shapes rather than one, and which shape a token resolves to is decided by its
  scope at bootstrap — so the `/s/<token>` handler renders a task or a list depending on what
  `shares/current` says, and a project-scoped token opened at `/s/<token>/t/<taskId>` is scope-checked
  against its own project like any other target.
- A task-scoped token at `/s/<token>/t/<taskId>` is a 404, not a redirect to its own task. The route
  does not exist for that scope, and inventing a redirect would tell a holder that task ids are a
  thing it may name.
- `?tab=` keeps the legacy semantics exactly — validated, falling back to the first tab, written with
  `replaceState` so switching tabs adds no history entries.
- The circulated `/share/<token>` URLs keep working through one redirect, and because the redirect is
  to the token's canonical `/s/` form, a project-scoped client lands on their list rather than on a
  task the old app would have shown them as a single document.

## Alternatives considered

**One route, `/s/:token?task=<taskId>&tab=<tabId>`.** Expresses the same three facts and makes the
task an optional query parameter on a page whose entire identity depends on it. Rejected: a path
segment is the honest spelling for "which resource", and it keeps the task-scoped URL — the common
case — free of parameters.

**Keep `/s/:token?tab=` only, and have a project-scoped link render its whole task list with every
task's tabs inline.** No second route, and it collapses the deep-link case: a client cannot send a
colleague "the DNS checklist", and the page grows with the project.

**Serve `/share/<token>` directly instead of redirecting.** Two URLs for one resource, indefinitely,
and the parity inventory records that the legacy route matched *any* two-segment path without
validating the token — a shape worth ending rather than preserving.
