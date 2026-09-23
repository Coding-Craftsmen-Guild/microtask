# ADR 0051 — Estimate is authored at any level; children win, and the gap is shown

**Status:** Accepted · 2026-09-23

## Context

Two people size the same work and neither of them is wrong. An executive sketching a year types
*"Checkout: 40d"* on a feature before a single item under it exists. A team later breaks that feature
into items totalling 62 days. Both numbers are now stored on the same plan, and they disagree by 22
days.

Anything that has to draw a bar on an axis eventually resolves that disagreement, and the two usual
resolutions are both lossy. Overwrite the feature with the roll-up and the authored 40 is gone —
nobody can afterwards say what was promised, or by how much the work outgrew it. Ignore the children
and the plan claims 40 days over a breakdown that says otherwise, which is the same lie pointing the
other way. A third resolution, refusing to let an estimate exist at both levels, is the same loss
taken earlier: it makes naming the first item a destructive act, and it forbids the order planning
actually happens in, which is top-down first.

Macroplan's claim is that the timeline is computed rather than entered (spec §2), so the forward pass
genuinely does need **one** number per feature. What it must not do is read "I need one number to
place a bar" as "one of these two numbers is wrong."

## Decision

**An estimate may be authored on a feature or on its items. Both authored values are kept, and
nothing in this system ever writes one from the other.** Placement takes the children when there are
any; the pair is reported beside the placement as a pair.

Two pure functions in `packages/schedule/src/estimate.ts` say it, and they are the only two things
that read an `estimateDays` off a feature and its items:

```ts
export function effectiveEstimate(feature, items): number | null {
  const estimates = estimatesOf(items)
  return estimates.length === 0 ? feature.estimateDays : total(estimates)
}
```

`effectiveEstimate` is what the forward pass places from. `breakdown` is the same two numbers left
unresolved — `{ planned, brokenDown, delta }`, where `delta` is `brokenDown - planned`, so it reads
as what the breakdown adds to the plan. A negative delta, a part-sized breakdown under a
whole-feature estimate, is a real and reportable state; `planned` is never edited to force it to
zero.

**Children win when at least one child carries an estimate — not when children exist.** The gate is
`estimatesOf(items).length === 0`, over exactly the items whose `estimateDays` is not `null`. The
difference is not pedantry. Gating on *has items* would sum over zero estimated children and answer
0, so a 40-day feature would collapse to a milestone the moment someone named its first item and had
not yet sized it, then come back when they did. So an unestimated breakdown is no breakdown and the
authored value still stands; and a single estimated item among three unestimated siblings **is** the
breakdown — it answers that one item's days, not the authored 40. Both are pinned in
`packages/schedule/src/estimate.test.ts`.

**Zero and `null` are different facts, and nothing in this path tests either for truth.** An
`estimateDays` of `0` is a **milestone**: a real estimate meaning no time. `null` is **not estimated
yet**. `@repo/contracts` spells the pair as `EstimateDays.nullable()` — a non-negative integer under
a cap, or `null` — on both `PlanFeature` and `PlanItem` (`packages/contracts/src/plan.ts`), and the
two services keep them apart at the write: `NewFeature`, `FeatureChanges`, `NewItem` and
`ItemChanges` each spell `number | null | undefined`, which is three spellings for two meanings —
absent and present-and-`undefined` both say nothing and leave the field, `null` clears it to *not
estimated*. Collapsing absent into `null` would leave "clear it" with no spelling of its own, and a
falsy test anywhere would make a milestone indistinguishable from an unsized item.

**The forward pass reads that distinction directly** (`packages/schedule/src/forward-pass.ts`):

- A feature whose `effectiveEstimate` is `null` is not placed at all. It comes back in
  `ScheduleResult.unscheduled` as `'no-estimate'` rather than onto the axis at a guessed width — the
  unscheduled rail below the canvas (spec §3.2).
- A feature estimated at `0` **is** placed, with `start === end`, because `endDay` is exclusive. It
  belongs in `days` rather than `unscheduled` and advances no rail cursor. `forward-pass.test.ts`
  pins all three of those on a zero-day gate standing between two sized features.
- An unestimated **item** is unscheduled and contributes nothing, without interrupting the flow of
  its siblings: a feature's span stays exactly its estimated items laid end to end.

So three items estimated at `0` answer `0` and override an authored `40`, exactly as three items
estimated at `1` would answer `3`. That is not a degenerate case to smooth over — it is a plan
saying this feature is now three milestones and no work, and the bars say so.

**The discrepancy is rendered rather than resolved.** Nothing recomputes, warns, refuses or
normalises. `breakdown` answers the pair, and answers `null` only where there is no pair to report:
no authored value, or no estimated child. An authored `0` against a breakdown of `5` is still a pair,
and so is an authored `40` against a breakdown that comes to `0`, because both halves are compared
against `null` and not for truth.

## Consequences

- **The most useful number the product produces survives to be read.** *planned 40d · broken down to
  62d · +22d* (spec §3.2) is where a macro plan is wrong, stated in days, before anything is late.
  Either overwrite would have deleted it, and an overwrite here is unrecoverable: a JSON manifest
  holds no history from which to reconstruct what the feature used to say.
- **`breakdown` has no caller yet, and that is the shape of phase 1.** It is exported from
  `packages/schedule/src/index.ts` and exercised only by its own tests. `PlanScheduleView`
  (`packages/macroplan-domain/src/views/plan-view.ts`) carries spans, cycles, unscheduled entries and
  dropped edges, and no pair — it does not need to, because a plan response carries every authored
  `estimateDays` on every feature and item, so the pair is derivable by whoever draws the canvas.
  Whether phase 2 calls `breakdown` client-side or the response grows a field is phase 2's decision
  and this ADR does not take it. What phase 1 fixes is that both numbers are still there to pair, and
  that the pairing has a name, a sign convention and a tested meaning.
- **Estimating is a `write` authority at both levels.** `feature:estimate` and `item:estimate` are
  granted to `write` in the kernel's `GRANTS` (`packages/kernel/src/access/policy.ts`), so the team
  lead who fills in item estimates needs no `manage` seat — and the roll-up their estimate causes
  needs no authority of its own, because nothing is written by it. The handlers ask for each action
  the body's **present** keys imply, so a PATCH carrying only `estimateDays` asks `feature:estimate`
  and never `feature:rename`.
- **Nothing is stored twice.** The roll-up and the delta are derived on every read from the one
  manifest the plan already is. That is a deliberate departure from ADR 0007's shape, which caches
  `{ done, total }` in the manifest because deriving progress means reading every task *file*; a
  plan's entire structure is one read, so a cache would buy nothing and would create staleness
  against the estimates sitting beside it in the same file (spec §3.4).
- Both functions are pure and mutate neither argument, which `estimate.test.ts` asserts with frozen
  items and a `JSON.stringify` comparison either side of the call. That is what lets a view call them
  per render with no defensive copy.

## Alternatives considered

**Overwrite the feature's estimate when a breakdown appears**, so every feature has exactly one
number and no reader has to be told which one is authoritative. The simplest model, and the one most
tools land on. Rejected because it destroys the output this product exists to produce, and because an
authored estimate is a commitment somebody made: software that silently edits it cannot be trusted
with the plan it is the record of.

**Refuse an estimate on a feature that has items**, making the single source of truth a rule rather
than a convention. Rejected: it is the same deletion moved earlier in time, and it fights the order
planning happens in. In practice it would either fail the creation of the first item or silently
clear a field the author cannot see from where they are typing.

**Gate on "has items" instead of "has at least one estimated item."** One condition fewer, and it
reads the same in English. Rejected on the behaviour it produces: summing over zero estimated
children answers `0`, so naming an item would turn a 40-day feature into a milestone until that item
was sized. An estimate that evaporates mid-typing and returns is worse than either resolution this
ADR refuses.

**Treat `0` as absent** — the ordinary falsy check — so the code carries one case fewer. Rejected: a
milestone is a real estimate, and a truthiness test would silently resurrect a feature's authored
value and draw a bar where the plan says there is none. `estimate.ts` refuses it by name, because it
is the change a later reader is most likely to make while tidying.

**Report the gap as a validation error**, refusing a breakdown that disagrees with its feature.
Rejected: the gap is the output, not a fault in the data. This product has no capacity model and no
over-commitment warning anywhere (spec §3.3) — two humans disagreeing about how long something takes
is information, and the place for information is the screen.
