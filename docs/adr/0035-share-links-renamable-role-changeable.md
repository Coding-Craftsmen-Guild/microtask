# ADR 0035 — A share link can be renamed and its role changed; its scope still cannot

**Status:** Accepted · 2026-09-11

## Context

The route tree mints links, lists them and revokes them. The app being replaced also has two
controls the new one does not: "Rename" in the link's menu, and "Set to read only" / "Set to read &
write" with the current one disabled. Both are in daily use — a link's name is who it was sent to,
and a client's access is narrowed when a phase ends.

Without a route for either, the UI's only way to honour those controls is revoke-and-recreate, which
mints a new token. The client's bookmarked URL stops working. That is the opposite of what "rename
this link" means, and for a role change it is worse: the admin's intent was "this client now reads
only", and the effect would be "this client is locked out until I email them a new URL".

This also has to be squared with ADR 0011, which makes a link's scope immutable and states the
consequence as "no PATCH can widen an existing link".

## Decision

**`PATCH /v1/microtask/projects/{projectId}/share-links/{token}`**, accepting `{name?, role?}` and
nothing else. A new action, **`share:update`**, gates it over a `{kind:'project'}` target, alongside
`share:read` and `share:revoke` — the three things that operate on a project's set of links rather
than on a link being minted.

**Scope stays immutable.** ADR 0011's rule survives intact because scope is the field that decides
*what* a link reaches; `role` decides what may be done with what it already reaches. A role change
grants an existing holder nothing a `manage` holder could not already grant by minting a fresh link
at that role — ADR 0008 gives `manage` links of **any** role — so the authority boundary is
unchanged and only the token's continuity differs. That continuity is the entire point: the
alternative is not "less authority", it is "a broken URL".

`createdBy` is not touched, so the revocation cascade in ADR 0010 still describes the lineage the
link was actually minted through, not the role it currently holds.

## Consequences

- A link's role is now a moving target for anyone reasoning about a past grant, so the audit
  question "what could this token do?" is answerable only for *now*. Accepted: it was already true
  through revoke-and-remint, minus the broken bookmark.
- Downgrading a holder mid-session does not change their already-loaded page. The API re-reads the
  link inside the write lock, so their next save 403s while their editor still looks editable — the
  legacy behaviour, recorded in the parity inventory, and the app now renders that 403 as a state
  rather than a retry loop.
- Because `share:update` targets the project, a **task-scoped** `manage` holder cannot use it, just
  as it cannot list or revoke (ADR 0038). Its own minted links are therefore rename-able by nobody
  but a project-scoped holder or the admin. That asymmetry is inherited from scope containment, not
  introduced here.
- One more action in the policy matrix, which means one more row in the exhaustive role x action x
  scope test.

## Alternatives considered

**Rename only, and leave the role immutable.** Half the legacy controls, and it leaves the worse of
the two problems in place: a role change is the one that strands a client.

**Let the PATCH change `scope` too, since it is already a PATCH.** Rejected, and it is the reason the
payload is closed rather than a partial of the link: ADR 0011's immutability is what makes a link's
authority stationary in the one dimension that can expose another client's work.

**Keep revoke-and-recreate and have the UI show the new URL.** Rejected: it turns every rename into a
message the admin has to send, and a client who does not read it loses access silently.
