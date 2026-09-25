# ADR 0060 — A cycle is named before the write, and the API stays the authority

**Status:** Accepted · 2026-09-25

## Context

Spec §6 makes the refusal part of the product rather than a failure mode: "A write that would create a
**cycle is refused**, with the cycle named." Spec §9 gates this phase on it — "cycle refusal pinned by
test" — and the server has done its half since phase 1: `FeatureService.setDependencies` builds the
feature list it is about to save, runs `findCycles` over it, and throws
`Conflict('These features would wait on each other: <ids>')` before its first store call, so a refused
edge list leaves the plan exactly as it was.

The problem is what a browser does with that answer, and it is a rule this app holds on purpose.
`lib/problem.ts` turns every failed call into one plain sentence chosen from the **status**, never from
the API's own `detail`, and it says why: `Not permitted: plan:retime` is a fact about the API's policy
rather than about what happened, and the wording is written for whoever reads the API. `lib/refusal.ts`
holds the sentences, and the one for 409 is:

> Someone else changed this at the same time. Reload the page and try again.

For a lost write that is exactly right. For a cycle it is not vague, it is **false** — nobody else
changed anything, and reloading will not help, because the same click will be refused again. A user
told that about their own dependency edit reads the editor as broken.

So something has to give, and the three candidates are not equally cheap to take back.

## Decision

**The cycle is detected in the browser and named before the write is sent, and the API remains the
authority that refuses it.** `components/plan/drawer/cycle-check.ts` runs `findCycles` over the graph
the write would leave, and a dependency control that is refused locally shows the sentence instead of
sending anything.

Three options were open.

**Let the API's `detail` through for one status.** Two lines: special-case 409 in `problem.ts` and
render `error.detail`. Rejected because it breaks the rule for every 409 in the product to fix one, and
because the detail it would show is wrong for the audience — `These features would wait on each other:
01HZ…, 01J0…` is a list of ULIDs, and the names are on screen two inches away. It also puts the API's
wording on a Macroplan surface, which ADR 0014 keeps separate for the reason every sentence in either
app names its own product.

**Change the generic sentence** to something true of both causes — "Macroplan could not save that
because the plan has changed", say. One line, no new code. Rejected: it makes every 409 in the product
vaguer in order to stop one of them being wrong, and the concurrent-edit case is the one a user can
actually act on. A sentence that tells nobody to reload is worse for the case where reloading is the
answer.

**Detect locally**, which is what shipped, and it wins on four counts that are each independently
sufficient. `findCycles` is **already exported** from `@repo/schedule` and already in the app's import
allowlist, and that package asserts its own freedom from `node:` specifiers and from dependencies
(`packages/schedule/src/purity.test.ts`) precisely so it can be bundled for a browser. The client
**already holds the graph**: a drawer page has read the whole plan, and `PlanFeature` satisfies
`ScheduleFeature` as it stands, so nothing is rebuilt and no second shape is invented. It leaves
`problem.ts`'s rule **intact**, so no other refusal in the product changes. And it **makes the generic
sentence true**, which is the part that needs care.

### The rule it inherits: a client-side check is a message, never a gate

This is the standing rule and it is not negotiable here. ADR 0038 states it for controls — a control
answers "should this be on screen", the API answers "may this request proceed" — and a local cycle
check is the same shape one level down. The server's `assertAcyclic` is what refuses the write; this
only decides what to say and when to save a round trip. `edgeEntry` is therefore total and answers a
two-state value — the deduped list to send, or the sentence to show — and a caller cannot forget to ask
for the second.

The three refusals are asked in the **service's own order** — a self-edge, then the plan-wide edge
budget, then the cycle — so the sentence a user reads is the one the API would have refused with first.
The budget comparison is `>` and not `>=`, because `assertWithin` answers "may one more be added": a
client comparing with `>=` would refuse the last edge the API accepts, at exactly the cap, which is
where a cap is met.

### "Makes the generic sentence true" has two cases, and naming only one would make this ADR false

The domain refuses **any** cycle in the graph it is about to save, not only one the caller introduced.
`setDependencies` assembles the whole feature list with the new edges substituted in and hands all of it
to `assertAcyclic`, so a plan that already holds a cycle between two other features refuses an edge that
has nothing to do with it. That is stricter than "the cycle you just made", and it means a 409 from this
route is reachable two ways:

1. **A concurrent edit.** Another writer — a second admin, or a `manage` seat from the share manager —
   closed a cycle between this page's read and this page's write.
2. **A cycle that arrived some other way.** Spec §6 contemplates it by name: "A cycle that arrives some
   other way — a hand-edited volume — is reported by `schedule()` and shown in the conflict list rather
   than breaking the page." A plan read into this page before such a volume was edited, or read from a
   process whose index and disk disagree, hits the same refusal.

Both mean the same thing, which is that **this page's copy of the plan is not the server's** — and that
is what "Someone else changed this at the same time. Reload the page and try again." says. Reloading is
the right instruction in both cases, because a reload is what makes the copies agree, after which the
local check catches the cycle and names it. So the generic sentence is true of every 409 this route can
answer, and the local check is what makes it so: whenever this page's copy **is** current, the cycle is
named before the write, and the only 409s left are the ones the sentence describes.

That reasoning only holds because the client asks the same question the server asks. Task 13 runs
`findCycles` over **the whole resulting graph** rather than over the one edge being added, and
`cycle-check.test.ts` pins the consequence by name: an unrelated edge is refused while the plan already
holds a cycle somewhere else, and so is a write that removes every edge the subject had.

### What the cycle cannot be reported as, which is what the plan asked for

The plan asked for the cycle's features "in the order they wait on each other". **That is not
available**, and the reason is graph theory rather than an implementation gap. `findCycles` is Tarjan's
strongly connected components, and it answers each component as **ids ascending**, the whole list
ascending by first id — deliberately sorted, because discovery order depends on the order features
arrive in. A component is not a cycle with an order: `a→b→a` beside `b→c→b` is **one** component
holding **two** cycles, so there is no single traversal of `{a, b, c}` to report, and any order printed
for it would be an invention. Extracting one concrete cycle would mean a second walk, in a package
whose one walk is property-tested, to produce a sentence that is no more true than the set is.

So the sentence names the members and says what they do: `These features would wait on each other:
Auth, Billing.` — the server's own wording with the ids replaced by the names on screen. Only the
**first** cycle is named, `findCycles` ordering them by first id: one is enough to say why the write is
refused, and a list of several would be a statement about the plan's storage rather than about the
click.

## Consequences

- **Two sentences about cycles exist and neither can use the other's string.**
  `cycle-check.ts`'s is subjunctive and about a write being refused — nothing has been placed, so there
  is no consequence to report. `conflicts/conflict-rows.ts`'s is indicative and about a cycle the
  **stored** plan holds, with a consequence: "Auth and Billing wait on each other, so neither was
  placed." Each file says the other exists, because a reader of either would otherwise take it for the
  only one.
- **The check runs twice per candidate row**, for the list a click would add and the list it would
  remove, so each row carries its own two refusals as strings and the graph never crosses into the
  browser. That is linear per call against a plan capped at 200 features and 400 edges, and the
  plan-wide edge total is read once for the whole list rather than once per candidate.
- **The payload is the real cost and it is measured, not estimated.** `storedIds` is the subject's whole
  list repeated once per row: about 1.1 MB for a feature waiting on all 199 others, about 56 KB for one
  with three edges, about 41 KB for one with none. `cycle-check.ts` records the figures and what would
  cut them — shipping the list once for the editor rather than once per row, which needs a shared client
  node the boundary rule does not admit (ADR 0058) — and records that a local filter would cut what is
  drawn and not what is sent.
- **A self-edge is refused in its own words and asked first.** It reaches `findCycles` as a cycle of one,
  and asking the cycle question first would produce the reciprocal sentence over a list of one name —
  "These features would wait on each other: Auth." The order is a property of the function rather than a
  convention a caller must know, because the cycle question is not reachable from outside the module.
- **A dangling edge produces no refusal naming something nobody can find.** `findCycles` drops an edge
  naming a feature the plan does not hold, for the reason its own contract gives: `schedule` must be
  total, and a dangling edge is a storage fault rather than a plan a user could fix.
- **The fourth thing the service refuses is deliberately not checked here.** An id naming a feature in
  another plan is a 422, and a candidate list drawn from this plan's own features cannot produce one
  (spec §8, ADR 0050) — so a check for it would be a branch no control can reach and no test can
  honestly exercise.
- **The server's refusal is still pinned by its own test**, and that is what the phase gate rests on:
  `feature-service.test.ts`'s "FeatureService.setDependencies refuses a cycle at the write" covers a
  two-feature cycle, a three-feature cycle and a diamond that is not one. The client check is the
  message; that test is the gate.

## Alternatives considered

**Let the API's `detail` through for 409 only.** Cheapest of the three, and it needs no graph in the
browser. Rejected: it shows ULIDs to a user looking at names, it breaks `problem.ts`'s rule for every
409 to fix one, and it makes the surface's wording depend on a string the API is free to change. The
detail is also only available *after* a round trip, so the user still waits to be told a write was
never going to work.

**Change the generic 409 sentence to something true of both.** No new code at all. Rejected: it degrades
the concurrent-edit case, which is the one where "reload and try again" is real advice, to buy
correctness for a case that can be caught before it happens. The local check gets both right instead.

**Ask the API first — a dry-run or validation endpoint.** It would put the one opinion about cycles on
the server, where it belongs, with no duplicate walk in the browser. Rejected on cost and on rule: it is
a new route in a phase whose whole premise is that the server is finished, it doubles the round trips of
every dependency click, and it would still be a message rather than a gate — the write after it can
still be refused, so the client would be asking a question whose answer it may not rely on. The local
check is the same message without the latency.

**Gate the control on the local answer — disable the checkbox.** It reads as the stronger design: a box
that cannot produce a refusal. Rejected as a violation of the standing rule, and for a concrete reason
rather than a doctrinal one. A disabled box says "this is not allowed", where the truth is "this page
believes this would be refused" — and the belief rests on a plan read that may be stale. A user whose
copy is out of date would find a legal edge disabled with no way to discover why. A box that sends
nothing and says the sentence is honest about both.

**Report one extracted cycle in traversal order.** What the plan asked for, and it reads better than a
set. Rejected on the mathematics above: a strongly connected component of three or more need not be a
single cycle, so there is no order to report, and extracting one would need a second walk beside the
property-tested one — the failure ADR 0055 and `packages/canvas/src/rails.ts` both describe as a second
derivation free to disagree with the first.

**Name every cycle in the plan rather than the first.** More informative, and the service's own message
does it (`cycles.map(…).join('; ')`). Rejected for the surface: the user clicked one box, and a list of
every contradiction the stored plan holds is the conflict list's job — which exists, on the same screen,
with a link to each subject (ADR 0057). One cycle says why *this* write is refused.

**Put the check in `@repo/canvas` or a new package beside it.** It is pure, it is testable in the node
lane, and ADR 0055 established that pattern for geometry. Rejected: the walk is `@repo/schedule`'s and
is already exported and already bundled, so a package here would hold only the wording and the
three-refusal order — both of which are this surface's, not arithmetic over the model. The `.ts`
extension puts it in the node lane regardless (ADR 0055's own note that an app `.ts` file is in that
lane, so purity alone forces no package boundary).
