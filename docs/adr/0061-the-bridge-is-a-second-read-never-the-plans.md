# ADR 0061 — The bridge is a second read, never part of the plan's

**Status:** Accepted · 2026-09-25

## Context

Spec §7.2 makes progress a counted number from the other product: "an item's percentage is the linked
task's `{ done, total }`." Spec §5 asks for it as the seventh column of the table, and §7.3 wants the bar
to fill for a link holder. So the plan page needs facts that live in Microtask.

The obvious shape is to put them on the plan read. `GET /v1/macroplan/plans/{planId}` already answers
everything the canvas and the table draw, in one request, and the schedule is derived into it on every
read (ADR 0048). Adding a per-item count and a per-rail binding state looks like the same move.

Three things argue against it, and the third is decisive.

`planView` is **pure and synchronous**, and the whole of `@repo/macroplan-domain` is built on that. It
takes a manifest and a principal and returns a value; nothing in that package performs IO. Reading a bound
project's manifest is IO, in the other product, through a credential only `apps/api` can open.

`LIMITS.epicsPerPlan` is **40**. A fully bound plan folded into the plan read would cost up to forty
Microtask manifest reads on the request that draws the timeline.

And Microtask's availability would become the plan's. A plan that cannot be read is a page that cannot be
drawn — but §7.2 is explicit that a dead binding must render "as a stated state with its own appearance —
never an error page and never an empty canvas", and the same reasoning holds one level up.

## Decision

**`GET /v1/macroplan/plans/{planId}/bridge` is its own route**, gated on `plan:read`, answering
`PlanBridgeView`. `planView` is unchanged in kind: still pure, still synchronous, still one manifest.

A page reads both, **concurrently**, and treats a failed bridge read as "nothing counted".

## Consequences

**The timeline never waits on the other product.** The canvas and the table render from the plan read
alone; the progress column and the `'done'` treatment fill in from the second. A page that got one and not
the other draws a correct timeline with no counted numbers, which is the same rendering as a plan with
nothing linked — and §7.2 already fixes that as the right answer for anything that is not a counted number.

**`read-bridge.ts` collapses every failure to `null`, and that is the whole of its contract.** It was first
written through `adminRead`, which applies `missingIsNotFound`: a 404 became `notFound()` and a 401 a
redirect, so a bridge failure took down the plan page — exactly what this ADR exists to prevent. It now
builds its own client and catches everything. The plan read above it is what decides whether there is a
page at all, and it runs against the same cookie, so by the time this one answers there is no failure left
for it to have an opinion about.

**A `null` here does not mean a revoked token.** The API answers **200** for that, with the rail reported
unlinked, because a dead binding is a fact about the plan rather than a failure. The two are deliberately
indistinguishable downstream — both draw no number — but they are different facts, and only the API is in
a position to tell them apart.

**Two reads cost two requests, and the concurrency is deliberate.** `Promise.all` means a refused plan read
still sends the bridge request, which is wasted on that path; the alternative is a second round trip on
every successful load. The timeline is the hot path, so the waste goes on the refusal. It leaks nothing —
the bridge route gates on `plan:read` and refuses the same bearer for the same reason — and
`layout.test.tsx` asserts both requests and says why.

**One request per render, not per component.** `cache()` around the read, for the reason `readPlan` uses
it: the layout and its drawer child both want it inside one render.

**The bridge read deduplicates by token, so forty rails are not forty reads.** Two rails bound to the same
project through the same token cost one resolve and one manifest read. Keyed on the **opened** token rather
than the stored blob, because `seal` uses a fresh IV per call and the same token sealed twice is two
different strings — deduplicating on the stored value would never find a match.

**The alternative remains available for a later phase and is cheaper then than now.** If the bridge ever
becomes something every plan read needs anyway, folding it in is a change to one handler. What would not
survive that change is `planView`'s purity, which is why it is not being spent speculatively.
