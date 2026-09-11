# ADR 0011 — Task is the default share scope

**Status:** Accepted · 2026-09-10

## Context

Requirement 3 asked for share links at the new Project level. Separately, ADR 0004 records that a
Project represents a **phase or workstream** — Discovery, Build, Launch — not a client.

Those two facts combine badly. A phase spans clients, so folders inside it may hold ACME's work
next to Beta Co's. A project-scoped link handed to ACME would expose Beta Co's tasks. That is not a
bug in the roles model; it follows directly from what a Project means here.

## Decision

Both scopes exist. **Task is the default** for a new link.

- Project scope remains available, but the confirm dialog lists **every folder and task** the link
  would expose before it is created.
- A link's scope is **immutable** after creation. Changing scope is revoke-and-reissue.
- A task-scoped link sees only its task — never sibling task names, never the folder tree, never the
  project's other contents, including through search (ADR 0009).

One consequence, verified when the policy was implemented: because a `folder` target is refused
outright for a task scope, a task-scoped link cannot read folder **names** either — so it cannot
render a breadcrumb showing where its task sits. That is the correct default, since a folder name
can itself identify another client. If a breadcrumb is ever wanted, it needs an explicit narrow
read grant, **not** a relaxation of scope containment.

## Consequences

- The common case — share one checklist with one client — is the default and needs no thought.
- Requirement 3 is satisfied without making the risky option the easy one.
- Immutable scope removes a whole class of privilege-escalation bug: no PATCH can widen an existing
  link. It costs the admin a re-send when they get the scope wrong.
- The scope-containment check matters at import too, where a bundle could assert a link scoped into
  another project (ADR 0019).

## Alternatives considered

**Project scope as the default**, matching the literal reading of requirement 3. Rejected on the
disclosure risk above.

**Mutable scope**, so a link can be widened or narrowed in place. Rejected: it makes a share link's
authority a moving target and adds an escalation path for `manage` holders.

**Folder scope as a third option.** Plausible once folders group by client, but it multiplies
permission-resolution cases. Deferred; ADR-able if folders end up used that way.

## Amended · 2026-09-11 — scope is immutable; role is not

The consequence above reads "no PATCH can widen an existing link". ADR 0035 adds
`PATCH .../share-links/{token}` accepting `{name?, role?}`, so that sentence needs its precise form:
**no PATCH can change a link's scope**, which is the immutability this ADR is about and the one that
governs disclosure. `role` is changeable in place.

That is not an escalation path. ADR 0008 already lets a `manage` holder mint a link of **any** role
inside its scope, so the authority a role change can confer was already reachable — by revoking and
reminting, which issues a new token and breaks the client's existing URL. The PATCH removes the
broken URL, not a restriction.

The reason it matters here is that the two fields answer different questions. `scope` decides *what*
a link reaches, and a project scope can expose one client's work to another, which is why this ADR
freezes it. `role` decides what may be done with what the link already reaches, and no role change
can reveal a task the token could not already read.
