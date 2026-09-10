# ADR 0030 — Services take one context of ports, and a double never re-implements a correctness component

**Status:** Accepted · 2026-09-11

## Context

Six services in `packages/microtask-domain` need the same handful of collaborators: a store, a
lock, a clock, an id generator, and — for two of them — the token index that resolves a share token
to its owning project. Five of the six are specified as "following the first one's shape exactly",
so whatever the first service takes is what the rest copy.

Building the first two surfaced two questions the plan did not answer.

**What does a service depend on?** `ShareIndex` is a concrete class holding a `Map`. It is
process-local, it is mutated by `ShareLinkService`, and deleting a project has to drop that
project's tokens from it — so `ProjectService` needs it too. Passing the class directly is the
obvious move and the wrong one.

**What may a test substitute?** The plan's service context shipped `fixedClock`, `sequentialIds`
and `immediateLock`. The first two are fakes of things a service only ever *asks*. The third is a
fake of the thing ADR 0006 makes load-bearing for correctness.

## Decision

**A service takes exactly one `ServiceContext`, and every member of it is a port.**

```ts
export interface ServiceContext {
  readonly store: ProjectStore
  readonly lock: Lock
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly tokens: TokenIndex
}
```

`TokenIndex` is declared in `packages/microtask-domain/src/ports/`, alongside `ProjectStore`, and
`ShareIndex` becomes its in-memory adapter. No service names `ShareIndex`.

**A test double may fake a port a service only queries. It must not re-implement a component the
system's correctness depends on.** So `fixedClock` and `sequentialIds` are doubles, and the lock in
a test is the production `QueueLock` from `@repo/store`. There is no `immediateLock`.

## Consequences

- **One construction shape, so the five later services are genuinely copyable.** Some services will
  not use every member. That is accepted: this is a context bundle, not the "one store interface
  everything depends on" that ADR 0027's interface-segregation rule forbids. Uniformity is the
  property being bought, and it is worth more here than trimming an unused field per service.
- **Tests run against the real lock, which is how its constraints get discovered rather than
  assumed.** `QueueLock` is **not reentrant**, so a method holding the lock may only call helpers
  that do not take it. That is why every service's `read` and `list` stay lock-free while
  `create`, `rename` and `remove` do not — `rename` calls `read` while holding the lock, and a
  `read` that took the lock would wedge the queue forever. A test double that resolved immediately
  would have hidden this, and it is pinned by a named test.
- **The token index gains the seam the multi-replica problem needs.** Plan 2 carries an honest
  unknown: `QueueLock` is per-process, so a second API replica against the same data gives 19 lost
  updates out of 20 concurrent conditional writes. Whatever fixes that — a shared lock — also needs
  shared token state, because an in-memory `Map` per replica resolves a token minted by the other
  replica as unknown. Both are now ports, so that change is an adapter rather than a rewrite. This
  ADR does not choose the adapter; it makes sure the choice is available.
- `ProjectService.remove` drops the deleted project's tokens. Without it a revoked project's tokens
  linger in the index and resolve to a manifest that is gone — harmless, since the read then 404s,
  but it is a leak of state with no owner.
- A future service that needs a collaborator not in the context extends the context, and the cost
  of that is visible: every service's construction site changes. That friction is intended, because
  it is what keeps the bundle small.

## Alternatives considered

**Give each service its own constructor parameters.** Narrowest possible dependencies, and the most
faithful reading of interface segregation. Rejected: six services with six differing shapes is the
thing that makes "follow the first one's shape" stop being true, and the plan leans on that
copyability heavily.

**Pass `ShareIndex` concretely, since there is only one implementation.** Rejected: ADR 0003 puts
storage behind a port for exactly this reason, and a token index that only exists in one process is
the component most likely to need a second implementation first.

**Keep `immediateLock` as a fast double.** Rejected: it was a line-for-line copy of `QueueLock`, and
a copy of a correctness component stops matching production silently — the same failure mode ADR
0009 refuses for security predicates. The real lock is also not slow.
