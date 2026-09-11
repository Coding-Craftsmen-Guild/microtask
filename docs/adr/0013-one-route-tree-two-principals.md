# ADR 0013 — One route tree, two principal kinds

**Status:** Accepted · 2026-09-10

## Context

`server.js` has two parallel API trees. An admin branch under `/api/projects/...`, and a client
branch under `/api/share/:token/...` that re-implements a subset of the same mutations. Creating a
tab, renaming a tab and replacing a tab's document each exist twice, with their own validation, own
lock usage and own permission check. The two have already drifted: the share branch cannot reorder
or delete, and only the admin branch can move tabs.

Adding three roles and two share scopes to that structure would double the drift.

## Decision

One route tree. Middleware resolves a principal from whichever credential arrived (ADR 0012), then
`AccessPolicy` gates the request. The same handler serves an admin and a link holder.

`GET /v1/microtask/shares/current` is the bootstrap call that tells a client what its link can see
and what role it has.

## Consequences

- Every mutation exists once. A permission rule changes in the matrix, not in two handlers.
- Handlers get a `Principal` rather than knowing which door the request came through, which is what
  makes the roles model auditable.
- The bootstrap route takes **no token in its path** — it reads the `Authorization` header like every
  other route. Putting a credential in a URL leaks it into server logs, proxy logs and `Referer`.
- The `/s/<token>` page URL still contains the token, because that is what a share link is. That is
  bounded by `noindex`, by `Referrer-Policy: no-referrer`, and by `Cache-Control: private, no-store`
  on every `/s/*` response (ADR 0040). It first read "and by resolving the token server-side into a
  session cookie on first load"; that cookie is gone — see the amendment below.
- Responses must be shaped per principal, since one handler now serves both. A link holder's project
  representation must not include fields only an admin should see.

## Alternatives considered

**Keep two trees**, one per audience. Familiar, and the duplication is visible rather than
structural. Rejected: it is already drifting at two roles, and would drift faster at three plus two
scopes.

**Keep the token in the path** for the client routes, as today. Rejected on credential leakage into
logs and `Referer`.

## Amended · 2026-09-11 — the token is bounded by headers, not by a cookie

The consequence above said the token in a `/s/<token>` URL is "bounded by `noindex` and by resolving
the token server-side into a session cookie on first load". The cookie never bounded the URL — the
token stayed in the address bar either way — and it was removed by
[ADR 0040](0040-link-surface-url-token-authority.md), because sealing it on arrival let a hostile
page replace the link a visitor held. The leaks this ADR names for a token in a URL are closed where
the URL goes instead: `Referrer-Policy: no-referrer` keeps it out of the `Referer` of anything the
page loads or links, `private, no-store` keeps it out of shared caches, and `noindex` out of search.
The bootstrap route is unchanged: the token reaches the API in the `Authorization` header, never in
an API path.
