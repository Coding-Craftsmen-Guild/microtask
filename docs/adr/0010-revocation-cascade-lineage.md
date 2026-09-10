# ADR 0010 — Revocation cascades through link lineage

**Status:** Accepted · 2026-09-10

## Context

A `manage` link may mint further links of any role, including another `manage` — delegation is
deliberately unbounded (ADR 0008). Today revocation is a single `filter` that removes one token.

With delegation, that is not revocation. Revoke a manager and the links they created keep working,
with nothing recording that the manager created them — so there is no way to find them, and no way
to answer "who granted this client access?".

## Decision

Every share link records `createdBy: token | null` (`null` meaning the admin created it).
Revoking a link revokes **every link descended from it**, transitively.

The revoke confirmation states the count: *"Revoking this link also revokes 3 links created through
it."*

## Consequences

- Unbounded delegation becomes recoverable. Cutting one manager cuts everything downstream of it.
- Revocation is no longer a single-token operation — it walks the lineage tree within the project's
  manifest, which holds all its links, so it stays one file read.
- Lineage must survive import. `import as new` remints tokens (ADR 0019), so it must rewrite
  `createdBy` to the new token values or the tree breaks silently.
- Legacy links imported from the current app have no lineage; they map to `createdBy: null`.
- An audit trail comes almost free: the lineage answers who granted what.

## Alternatives considered

**Cap delegation depth**, or forbid `manage` links from minting `manage` links. Safer, but the
unbounded model was chosen deliberately; cascade makes it survivable without removing the capability.

**Flat revocation** (revoke only the named token). Rejected: it makes a leaked manage link an
unrecoverable, unauditable loss, since the links it created outlive it and cannot be identified.

**Expiring links.** Would also bound the damage, and is orthogonal — a candidate for a later ADR.
