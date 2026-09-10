# ADR 0008 — Three roles behind one pure AccessPolicy

**Status:** Accepted · 2026-09-10

## Context

Today a share link carries `permission: 'read' | 'write'`, and the checks are scattered inline
through `server.js` — including a `requireWrite` that is deliberately re-run inside each lock
because a link can be downgraded between the read and the write. That pattern does not survive
three roles, two share scopes and a second product.

## Decision

Three roles, and one pure function that decides everything:

```ts
type Role      = 'view' | 'write' | 'manage'
type Principal = { kind: 'admin' } | { kind: 'link', role: Role, scope: Scope, token: string }

can(principal: Principal, action: Action, target: Target): boolean
```

`can()` performs no I/O and is unit-tested as an exhaustive role × action matrix. `view` reads;
`write` adds content and creates/renames; `manage` also deletes, reorders and manages share links,
including minting links of **any** role; `admin` additionally lists all projects, creates projects
and imports.

`manage` is admin **within its scope** and blind outside it — that is the "everything except top
level" boundary.

## Consequences

- Authorization lives in one testable place instead of being spread across route handlers.
- Because `can()` is pure, the real security boundary is the **resolution step in front of it** —
  turning a credential into a principal and a path into a target. That step is where scope
  containment is enforced, and it needs its own tests, not just policy tests.
- Adding an action means adding a row to the matrix, so a forgotten permission check shows up as a
  missing test case rather than an open endpoint.
- Collection-level and top-level actions have no natural `target`, which is a hole; ADR 0009 closes
  it.

## Alternatives considered

**Keep `read` / `write` and add a third value inline.** Cheapest change, but leaves the checks
scattered and unauditable across two products.

**Full capability lists per link** instead of named roles. More flexible and much harder to reason
about or explain in a UI. Rejected.
