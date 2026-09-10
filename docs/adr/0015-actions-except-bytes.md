# ADR 0015 — Server Actions, except anything that moves bytes

**Status:** Accepted · 2026-09-10

## Context

The design started as "mutations are Server Actions, with one exception for autosave because
flush-on-unload needs `fetch(..., { keepalive: true })`". Verification against the Next.js docs found
that rule breaks in more places than one, and that the import flow — the only migration path for
live production data — could not work as designed.

Four documented constraints matter here:

1. A Server Action request body is capped at **1 MB** by default, counting raw multipart bytes. A
   workspace bundle exceeds that immediately, and it surfaces as a generic action error.
2. Action return values are serialized into the Flight stream, so an action **cannot return a
   `Response`** with `Content-Disposition` — it cannot serve a file download at all.
3. Actions are invoked only through React's action mechanisms, so **nothing can dispatch one during
   page unload**.
4. Next dispatches actions **one at a time per client**, so an import modelled as one action per file
   serialises end to end and cannot be parallelised.

Raising `serverActions.bodySizeLimit` is a per-app global, and the docs frame the 1 MB default as
DDoS protection — so it would loosen every action in the app to accommodate one admin-only flow.

## Decision

The rule is **"Server Actions, except anything that moves bytes."** Three route handlers, named up
front:

| Route handler | Why it cannot be an action |
| --- | --- |
| `POST /api/import/upload` | 1 MB cap; one file per request, bounded client concurrency |
| `GET /api/export/…` | an action cannot return a `Content-Disposition` response |
| `POST /api/tabs/:tabId/document` | nothing can dispatch an action on unload |

`serverActions.bodySizeLimit` stays at its default. Server Actions keep the small structural
mutations — rename, create, delete, reorder, and "confirm this staged import".

## Consequences

- The export download must be proxied: the API is internal-only, so the route handler streams the
  API's response through to the browser.
- Import becomes stateful across two requests — upload/preview, then confirm. Files are staged
  server-side under an import-session id, and confirm references that id rather than re-posting the
  payload. That staging area needs a defined location and a cleanup rule.
- Per-file upload gives per-file progress and per-file errors, which the preview needs anyway.
- The autosave "exception" is no longer an exception, so nobody will later "simplify" it into an
  action and silently break flush-on-unload.
- What that autosave handler can be *relied on* to carry is separately constrained: `keepalive` is
  capped at 64 KiB, so flush-on-unload is best-effort for small documents only. See ADR 0028.

## Alternatives considered

**Raise `bodySizeLimit` to fit a workspace bundle.** One config line. Rejected: it weakens every
action in the app for one admin flow, and the per-file upload is better anyway because it gives
per-file error reporting.

**Everything through route handlers, no Server Actions.** Consistent and boring. Rejected — actions
are a genuinely good fit for the small mutations, which are the overwhelming majority.
