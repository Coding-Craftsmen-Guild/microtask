# ADR 0048 — Macroplan schedules, it does not store dates

**Status:** Accepted · 2026-09-23

## Context

A plan carries exactly one calendar date. `PlanManifest` holds `startDate`, `sprintLengthDays` and
`timezone` and nothing else about time; `PlanEpic`, `PlanFeature` and `PlanItem` carry no date at
all — an ordering number, a nullable `estimateDays`, and `createdAt`/`updatedAt`, which say when
somebody last edited the record and never when the work happens
(`packages/macroplan-domain/src/entities/`). Spec §2 is why: the first design had authored start and
end dates on all three levels plus a baseline captured at a "commit the plan" ceremony, and it was
rejected because every estimate change would then be a manual reschedule of everything downstream.

So every span a reader sees is arithmetic, and the question this record answers is where the result
of that arithmetic lives. The obvious precedent in this repository says to compute it once and keep
it. ADR 0007 decides exactly that for Microtask: the checklist document stays the source of truth
and the manifest carries a per-task `{ done, total }` **cache**, because deriving a project's
progress means reading every task *file*, and rendering a list of twenty projects would otherwise
read the entire workspace.

## Decision

**A schedule is derived on every read and stored nowhere.** `planSchedule` in
`packages/macroplan-domain/src/views/plan-view.ts` runs `schedule()` from `@repo/schedule` over the
manifest it was handed, flattens `ScheduleResult.days` into an ordered array and returns it;
`planView` hangs that off the response under a `schedule` key and writes nothing back. Nothing on
the way in ever carries one: `PlanManifest` has no such field, and it must never grow one.

**This is a deliberate departure from ADR 0007, and the distinction that justifies it is what has to
be read.** Progress lives in the task files, so deriving it is a walk over the disk and the cache is
what keeps a list view from touching the whole volume. A schedule lives entirely in the plan
manifest — `epics`, `features` and `items` are three sibling arrays in that one file, mirroring the
shape ADR 0005 gives a project — so the derivation reads the file the caller has already opened and
touches nothing else. A cache would save no read at all. What it would add is a second copy of the
answer, and with it a class of staleness that cannot otherwise exist: a `startDate` retimed while a
stored span stayed put, a bar drawn where the plan does not say it is.

Recorded explicitly, because an inconsistency between two ADRs is the kind of thing a later reader
tidies up. **The two records disagree because the two derivations read different things, not because
one of them is out of date.**

## Consequences

- **`PlanManifest` must never grow a `schedule` field**, and no record nested in it may grow a
  `startDay`, an `endDay` or a date. That is the whole invariant; everything below is either what it
  costs or what holds it.
- **The cost is paid per read and is bounded by the caps rather than by the data.**
  `packages/contracts/src/limits.ts` bounds one plan at 40 epics, 200 features, 400 dependency edges
  and **2 000 items**, and the pass runs over exactly that. Spec §3.4 calls it `O(n)`, which is the
  items half only: the dominant term is the relaxation in `packages/schedule/src/relax.ts`, which is
  Bellman-Ford shaped at `O(f·(f+e))` — about 120 000 operations at the feature and edge caps — with
  the sorts over 2 000 items beneath it. On the order of 10^5 operations, sub-millisecond, per plan
  read. The figure is recorded here because it is the reason a cache buys nothing, not as trivia.
- **Retiming a plan is one field.** `PlanService.update` writes a new `startDate` or
  `sprintLengthDays` onto the manifest and stops; every bar, every sprint boundary and every pin
  moves because the next read derives them again. A `pinSprint` is an index, so it travels with the
  grid. Against a cache the same edit would be a sweep over every feature and item in the plan, and
  a sweep is a thing that can be interrupted half done.
- **A conflict that arrives some other way is reported rather than persisted.** A hand-edited volume
  can hold a dependency cycle; the pass returns it in `cycles` on every read (ADR 0049) and the next
  edge write refuses it. Nothing about it is written down, so nothing about it can outlive the edit
  that fixes it.
- A client that wants to draw a bar before its round trip returns runs the same pass over the same
  manifest rather than reading a stored field. That is what ADR 0049 exists for.
- The wire shape is published — `ScheduleView` in `packages/contracts/src/schedule-view.ts` — and it
  is a response schema only. No write payload anywhere accepts a span.

## What holds it, having been read

Three suites assert the same invariant from three different sides, because a cache introduced later
would satisfy any two of them.

- `packages/macroplan-domain/src/views/plan-view.test.ts` — the block named *"a stored manifest
  never carries a schedule, whatever was written last"* reads the manifest back out of the store
  after five different writes (an epic added, a feature placed, dependencies set, an item added and
  described, an epic removed) and asserts `'schedule' in stored` is false every time. It closes on a
  non-vacuity case: the view built from that same manifest *does* carry one.
- `apps/api/src/routes/macroplan/plans/plans.test.ts` — the same claim through the store rather than
  through the route. It drives a real `POST /v1/macroplan/plans`, then reads the written manifest
  with `deps.plans.readManifest` and asserts `schedule` is not among its keys; a second case does
  the same for the fixture plan behind `GET /v1/macroplan/plans/{planId}`, and the list row is
  asserted to carry no `schedule` either.
- `apps/api/src/routes/macroplan/agreement.test.ts` — the one that would catch a cached copy
  drifting from the derivation. It reads the stored manifest, runs `schedule()` from
  `@repo/schedule` **itself**, flattens the result with its own sort, and deep-equals that against
  the `schedule` block the route answered. The flattening is restated in the test rather than
  imported from `planSchedule` on purpose: importing the function the route already calls would
  compare a value to itself and the file could never fail. One case re-runs the comparison after a
  `PUT .../dependencies` has moved something, so the claim is about the pass and not the fixture.

`planSchedule` is exported from its module and deliberately not from the package barrel, which is
what keeps that last test one import away from being useless.

## Alternatives considered

**Cache the schedule in the manifest, the way ADR 0007 caches progress.** Consistent with the record
already on the books, and a plan read would become a decode with no arithmetic after it. Rejected:
it saves no file read, because the schedule derives from the manifest the caller has already opened,
so the entire net effect of the cache is the staleness it introduces. ADR 0007's cache pays for
itself by avoiding a walk over every task file; there is no equivalent walk here to avoid.

**Cache it, and correct it on read the way ADR 0007 corrects a stale progress pair.** Keeps the copy
honest by a mechanism already proven in this codebase. Rejected: correcting on read means deriving
on read, which is this decision plus a write nobody asked for — and ADR 0007's correction has to be
forbidden from stamping `updatedAt`, a subtlety that exists only because the cache does.

**Author start and end dates on features and items, and validate rather than derive.** The first
design, and what an executive arriving from another planning tool expects. Rejected in spec §2
before this phase began: authored dates on a three-level hierarchy make every estimate change a
manual reschedule downstream, and they reintroduce the baseline they were meant to justify. Spec §8
keeps the other half of the same refusal — nothing in this product rewrites a date to resolve a
conflict.
