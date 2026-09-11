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

**A project in a list carries `shareLinkCount?: number` and no `shareLinks`.** Tokens appear only
on `projects.read()` and `GET .../share-links` — and neither may be rendered into a **page**: the
project page reads `projects.read()` on the server, renders a count, and the share manager loads the
links when it is opened (see the second amendment below). The count is present
exactly when `shareLinks` would have been — see the amendment below, which supersedes the
unconditional reading this ADR first gave it.

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
- A caller that is refused `share:read` sees **no** `shareLinkCount` at all, the same way it sees
  no `shareLinks` — the amendment below replaces the unconditional count this ADR first accepted.
- ~~The share manager needs `projects.read()`, which it already calls to render the project page.~~
  Corrected by the second amendment below: it calls `GET .../share-links` when it is opened, because
  a page that rendered it from `projects.read()` would put every token in its own HTML.
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
since the share manager is always rendered from a project the caller has just read. *The gain turned
out to be the whole point, and the route already existed: see the second amendment below.* Links are
still not dropped from `projects.read()`, which the API shapes per caller and which the admin's own
server still reads.

## Amended · 2026-09-11 — the count is gated on the same decision the links were

This ADR first made `shareLinkCount` unconditional, and accepted the disclosure in its
consequences: "the count reveals nothing a project-scoped holder cannot infer". Reviewing it before
implementation, that is the wrong trade. An unconditional count tells a **link** principal how many
share links exist on a project it can read — a fact the app being replaced never put on the wire —
and `projectView()` already owns the decision that would withhold it.

**`shareLinkCount` is present exactly when `shareLinks` would have been**, and counts the same
links: `projectListItem()` calls the same `visibleLinks()` predicate `projectView()` calls, and
reports `undefined` where that returns `undefined` and its length otherwise. So there is one
`share:read` decision rather than two, which is this ADR's own reason for leaving `projectView()`
unchanged (ADR 0009).

Three consequences of the stricter rule, all of them wanted:

- A caller refused the block is told **nothing**, not a zero. The same asymmetry `visibleLinks()`
  already draws so "none exist" cannot be read out of "you may not ask" (ADR 0017).
- The count is of the links **that caller** would have been shown, not of the manifest's total. A
  project-scoped `manage` holder is not told about a seat scoped into another project, which an
  import bundle can plant (ADR 0019).
- `shareLinkCount` is optional in the schema, so `ProjectListItem` has the same
  present-or-absent discriminator `ProjectView` has, and a row can tell "no sharing here" from
  "not your business" without a second field.

The cost is that reusing the predicate means the list still walks each project's links to count
them. That walk is per project and bounded by 50; what this ADR removes is shipping them, not
reading them.

## Amended · 2026-09-11 — the page ships a count too; the links load when the dialog opens

This ADR moved tokens off the **list** and left them on `projects.read()`, "the request that renders
the share manager". Building that page showed the same leak one screen further in. The share
manager is a client component — it copies, renames, revokes — and anything a Server Component hands
a client component is serialised into the Flight payload and lands in the HTML. A project page that
rendered the manager from `projects.read()` would put up to 50 live tokens into its own page source
on every load, whether or not the admin ever opened the dialog. The plan that asked for the manager
also asked for no share token in the project page's HTML; as written, those two contradicted each
other.

**The project page renders a count, and the share manager loads its links when it is opened.** It keeps
the shape the app being replaced had — a dialog behind a button — with the links fetched when the
dialog opens rather than held by the page. Concretely:

- The page reads `projects.read()` on the server and reduces it to a model **copied field by field**
  (`components/projects/page-model.ts`), holding the link count and a per-task count of task-scoped
  links, and no link. Nothing the page hands a component is a token.
- Opening the dialog calls a Server Action that asks `GET .../share-links` — the route that already
  existed — and closing it drops the links from the browser's memory. An answer that arrives after
  the dialog closed is discarded. So a token reaches a browser only when an admin asks to see it,
  and only for as long as the dialog that shows it is open.
- The project page's test renders a project holding live links and asserts none of the token
  strings occurs in the rendered output **or in any prop the page hands a component**, the second
  being what the Flight payload would carry.

This is the ADR applied to the page rather than only to the list endpoint: a credential shipped in
bulk into page data lands in the HTML, whichever endpoint it came from. It costs one request per
dialog open, which is the request the alternative above rejected as having "no gain" — the gain is
that the project page stops being a credential dump for every admin who loads it.
