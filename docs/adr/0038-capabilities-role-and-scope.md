# ADR 0038 — Controls gate on role **and** scope, never role alone

**Status:** Accepted · 2026-09-11

## Context

The spec's role table has three columns — view, write, manage — and the client view renders from it.
The policy it is meant to describe has a second axis the table does not mention.

`withinTaskScope` refuses every `folder` target outright, and every `project:*` action except
`project:read`. Read against the route tree, that has a consequence the table cannot express:
`share:create` is authorized against the **new link's scope**, while `share:read` and `share:revoke`
are authorized against `{kind:'project'}`. So a **task-scoped** `manage` holder can mint a share
link over its own task, and can then neither list it nor revoke it. It holds `manage`, and the share
manager the role table says to render for `manage` would show it a list it cannot load and a revoke
button that 403s.

This is not a bug in the policy — it is scope containment doing exactly what ADR 0011 asks of it, and
ADR 0011 already records the same effect for breadcrumbs. It is a bug in rendering from role alone.
And with task scope as the default, the broken case is the **common** one.

The app cannot simply ask `can()`. It lives in `@repo/kernel`, which ADR 0027 forbids an app from
importing.

## Decision

**One pure function, `capabilities(role, scope)`, in `@repo/contracts`**, returning the boolean set
the UI renders from. No component branches on `role` on its own.

**`packages/contracts` takes `@repo/kernel` as a `devDependency`, and a contract test asserts
`capabilities()` agrees with `can()` for every role x scope x action triple.** Not a sample — the
whole cross product, the same exhaustiveness ADR 0008 requires of the policy matrix itself. The
devDependency is what keeps `kernel` out of the browser bundle while still letting the test compare
the two answers in one process.

**That test is the entire reason the function is allowed to exist at all.** ADR 0009 refuses a second
copy of a security predicate, and it is right to: `withinTaskScope` and `inScope` are private to
`policy.ts` precisely so nothing re-derives them. `capabilities()` is admitted as a narrow
exception with two conditions attached. It answers a different question — "what should be on screen"
rather than "may this request proceed" — and it is never the thing that stops a request. It is
mechanically proven equivalent to `can()` by the test above, so a divergence is a red build rather
than a 403 a user discovers.

This amends ADR 0009 by naming a third category alongside its gate and filter: a **rendering**
question, asked in a process that cannot reach the policy, permitted only while an exhaustive test
holds it to the policy's answers.

## Consequences

- A task-scoped `manage` holder is shown no share manager, because `capabilities('manage', {kind:
  'task', ...})` says so. Nothing in the UI needs to know why.
- The spec's role table gains a scope axis, and every row of it is now derivable from
  `capabilities()` rather than transcribed.
- Adding an action means adding it to the policy matrix and to `capabilities()`, and forgetting the
  second is a failing contract test rather than a button that 403s. Adding a **scope** — a folder
  scope was deferred in ADR 0011 — means the cross product grows and both sides are forced to answer
  for it.
- `@repo/contracts` now has a dev-time dependency on `@repo/kernel`, so a cycle between them would be
  a build failure; kernel must not depend on contracts. Worth stating, because the dependency graph
  in the spec shows no edge here at all.
- A 403 remains possible and the UI still handles it. `capabilities()` removes the ones we can
  predict, not the race where a link is downgraded between render and click — which ADR 0008 already
  says is re-checked inside the lock.

## Alternatives considered

**Have the API return the capability set with the bootstrap response**, computed by calling `can()`
directly, so there is exactly one implementation. Genuinely the cleanest, and it was rejected on
reach rather than on principle: the set is needed to render Server Components that have not made a
bootstrap call, and threading it through every one of them makes the capability set a prop on the
whole tree. Worth revisiting if `shares/current` becomes a hard dependency of every page anyway.

**Export `can()` from `@repo/contracts` by moving the policy there.** Rejected: the policy belongs
with the roles and targets it is defined over (ADR 0008), and moving a security predicate into a
package whose job is wire shapes puts it one careless export away from the browser.

**Render from role alone and let the 403 teach the user.** What the spec's table implies. Rejected:
it means the default share scope ships a share manager that cannot work.
