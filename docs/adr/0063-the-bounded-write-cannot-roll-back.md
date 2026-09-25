# ADR 0063 — The bounded write cannot roll back, so it may leak a task and never delete one

**Status:** Accepted · 2026-09-25

## Context

Spec §7.2's `manage` case is the one write this product makes into the other: "naming an item in Macroplan
**creates the real task** in the bound project." It bounds it in three clauses, and the middle one decides
this ADR:

> the write path permits **exactly one operation** — create a task in the bound project. No delete, no
> rename of anything Macroplan did not create, no share-link management.

Creating the task and linking the item are **two writes in two products**. Either can fail after the other
has landed, and the usual answer — undo the first — is the one thing the bound above forbids.

There is a second constraint, and it is a correctness one rather than a policy one. `Lock` is not
reentrant. `packages/macroplan-domain/src/services/context.ts` says so in as many words, and
`packages/store/src/queue-lock.ts` shows why: `run()` chains onto a promise that only settles when the
outer work finishes, so a nested `run` **deadlocks** rather than erroring. Both `TaskService.create` and
`ItemService.link` take the lock.

## Decision

**Its own route**, `POST /plans/{planId}/items/{itemId}/task`, and not a side effect of `POST /items`.

**The task is created first, then the link is written**, sequenced and never nested.

**There is no compensating delete.** A failure between the two leaves a named task in Microtask with
nothing pointing at it.

**An item that is already linked is refused with 409.**

**`BridgeService` exposes exactly two methods**, `read` and `createTask`, asserted by a test on its own
prototype.

## Consequences

**"Exactly one operation" is a property of the code rather than a promise in a document.** One reader, one
writer, and a failing test the day a third method arrives. That test's whole job is to make somebody record
the decision instead of taking it in passing.

**Folding this into item creation was refused for a reason worth keeping.** One request would then write
into the client-facing product with no separate authority to ask and no separate refusal for a client to
read — and `item:create` is a plain `write` grant, where this needs `item:link` **and** an effective
`manage` on the rail. A surface may still present it as one button; the authority is asked separately.

**The orphan is structural, not an oversight.** It is also the better of the two failure modes. The reverse
order — link first, create second — leaves an item pointing at a task that was never created, which is a
dangling id, and a retry would then create a *second* task for one item. An orphan is one extra task with a
real name in somebody's project: visible, harmless, and deletable by a human in the product that owns it.

**Already-linked is the idempotency key, because there is no other.** A retry of a request whose response
was lost must not create a second task, and the item's own link is the only record that the work happened.
So a 409 here means the first attempt landed after all — which is what a caller should read it as.

**The two writes are sequenced, and nothing may make nesting look safe.** A `createTask` inside
`ItemService.link`'s `lock.run` would hang the request rather than fail it, which is the worst shape of bug
available here: no error, no timeout in the domain, just a promise that never settles. The route holds the
order and neither service knows about the other.

**The project's own task cap is not swallowed.** `TaskService.create` calls
`assertWithin('tasksPerProject', …)` and throws, and that throw travels: a bound project at 500 tasks is a
real conflict the caller must answer for, not a rail reported unlinked. It is the one failure on this path
that is about the other product being full rather than about a credential.

**`BridgeService.createTask` answers `null` for a refusal rather than throwing.** The route decides the
status and owns the sentence, and the sentence names the **rail** and not the caller — a plan `manage`
holder over a rail bound at `view` is refused by the binding's ceiling, and telling them they lack
permission would send them looking in the wrong place.
