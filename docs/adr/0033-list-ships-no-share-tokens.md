# ADR 0033 — The project list ships a share-link count, never share links

**Status:** Accepted · 2026-09-11

## Context

`projectView()` attaches the `shareLinks` block — tokens and all — whenever the caller clears
`share:read` on the project, which ADR 0013 makes the right rule for a single project: an admin
reading one project needs the tokens, because the share manager renders copyable URLs from them.

`projects.list()` returns that same view for every project. So a single admin request can return, at
this product's own bounds, 500 projects carrying up to 50 live credentials each — 25,000 tokens in
one page's data, on the one screen that has no use for a single one of them.

The Next data flow makes that worse than a large payload. Anything a Server Component hands to a
client component is serialised into the Flight stream and lands in the HTML sent to the browser. A
list page that passes projects down to a client-side filter — which the spec's in-place search does
— would embed every share token of every project in the page source. ADR 0017 already calls an
export bundle a credential dump and gates it behind a dialog that says so; the list page would be a
credential dump with no dialog at all.

## Decision

**A project in a list carries `shareLinkCount: number` and no `shareLinks`.** Tokens appear only on
`projects.read()`, which is the request that renders the share manager.

The count is not a consolation prize for dropping the array: it is exactly what the list row needs.
The app being replaced rendered "· N share links" in each project's metadata line and computed it
from a `shareCount` field for the same reason — it shipped whole documents to that page, but never
tokens.

`projectView()` is unchanged. The distinction is in what the list mapper asks for, so the single
place that decides whether a caller may see share links keeps deciding it, and there is no second
predicate to drift (ADR 0009).

## Consequences

- The list response shrinks to something bounded by project count rather than by project count
  times links, and the Flight stream stops carrying credentials no matter what a page does with the
  list.
- A caller that is refused `share:read` sees `shareLinkCount` rather than an absent field, so a
  link principal learns how many links exist on a project it can already read in full. That is
  accepted: the count reveals nothing a project-scoped holder cannot infer, and no token.
- The share manager needs `projects.read()`, which it already calls to render the project page.
- Two shapes now exist for a project — one with links, one with a count — and the OpenAPI document
  says which endpoint returns which. That is a real cost in schema surface, paid once.

## Alternatives considered

**Strip the tokens and keep the rest of each link** (name, role, scope). Rejected: it is the same
per-project fan-out for data the row does not render, and a role-and-scope inventory of every link
in the workspace is itself worth not shipping.

**Keep the full view and rely on the list page never passing it to a client component.** Rejected —
that is a convention, enforced by nobody, against a mistake whose consequence is credentials in
page source. ADR 0027's position on unenforced conventions applies exactly.

**Add a separate `GET /share-links` for the share manager and drop links from every project
response.** Cleaner in isolation, and it splits one screen's data across two requests for no gain,
since the share manager is always rendered from a project the caller has just read.
