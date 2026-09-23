# ADR 0050 — The plan directory is the unit; edges never cross it

**Status:** Accepted · 2026-09-23

## Context

Macroplan stores one directory per plan, mirroring the shape ADR 0005 gives a Microtask project:

```
data/macroplan/plans/<planId>/
  plan.json             name, startDate, sprintLengthDays, timezone,
                        epics[], features[], items[], shareLinks[], timestamps
  items/<itemId>.json   one item's plain-text description, and nothing else
```

`packages/macroplan-domain/src/storage/paths.ts` builds every one of those paths, with the two
guards ADR 0005 measured: `isUlid` and `isProduct` reject an untrusted segment outright, so no
multi-segment id can reach a sibling plan, and `contained()` from `@repo/kernel` bounds each result
against its *immediate* parent as the backstop. `plansDir` is a sibling of `projects/` under the
product root and never a child, because each store lists the ULID-named children of its own root and
one nested inside the other would make a plan look like a project to whichever store listed the
wrong directory.

The invariant that matters is not the layout but what the layout makes true: **a plan is wholly
present or wholly absent.** Everything about it — structure, estimates, order, dependencies, the
seats it has been shared to — is inside that one directory, so moving the directory moves the plan
and removing it removes the plan, with no reference left behind and none reaching in.

A note on where that invariant comes from, because the spec this phase was built to attributes it to
the wrong record. Spec §4.2 calls it "the same invariant ADR 0004 gives a project"; ADR 0004 is the
hierarchy decision — today's Project becomes a Task, a new Project sits above it, folders are one
level deep — and says nothing about directories at all. The two records that actually decide it are
**ADR 0005**, which puts one directory per project on disk, and **ADR 0018**, which makes a
directory containing `project.json` one of the four recognised import shapes with its `tasks/*.json`
as members, and makes an orphaned task file an error naming its missing manifest rather than a
silent skip. Those two are what this record mirrors.

## Decision

### The plan directory is the unit of storage and of removal

`FsPlanStore.deletePlan` is one call — `removeDir(planDir(root, product, planId))` — so a delete
takes the manifest, every item file and every share link that manifest held, in one operation, and
reports whether there was anything there. `PlanService.remove` wraps it in the lock, turns "there
was not" into `NotFound`, and drops the plan's tokens from the shared index afterwards, so no bearer
survives the directory it pointed into.

`FsPlanStore.listManifests` is the same invariant read backwards: it lists the immediate children of
`plans/`, skips any whose name is not a ULID, reads one manifest out of each, and leaves out
anything whose manifest is absent or will not parse. A half-copied directory is therefore absent
from every listing rather than reported as damaged, and a stray directory is not a plan.

### No dependency edge may leave the plan, and it is refused at the write

`FeatureService.setDependencies` in
`packages/macroplan-domain/src/services/feature-service.ts` validates the whole edge list before the
first store call, so a refusal writes nothing at all. `assertEdgesExist` walks the list and refuses
in two ways:

```ts
if (id === featureId) throw new Invalid('A feature cannot depend on itself')
assertFeature(manifest, id)   // throws Invalid(`No feature ${id} in this plan`)
```

`assertFeature` asks only whether `manifest.features` holds that id, and a feature belonging to
another plan is not in this manifest — so a cross-plan edge is refused by the same check, with the
same sentence, as an id that names nothing anywhere. The id is named in the message, because a
caller that sent four edges needs to know which one was wrong.

The same rule governs every other reference in the model, through the same helpers in
`structure-mapper.ts`: a feature's `epicId` is checked with `assertEpic` on create and on move, and
an item's `featureId` with `assertFeature` on create and on move. **No reference of any kind crosses
a plan boundary**, and the edge is only the case where somebody might have argued for one.

**Refusing at the write rather than at render time is the decision.** A cross-plan edge tolerated in
storage and skipped by the pass would leave the directory no longer self-contained: a plan copied,
backed up or exported on its own would carry a reference to a feature that is not in the bundle, and
the reader on the other side has a dangling id and no way to resolve it. Refusing costs one
comparison at the only moment an edge is created.

## Consequences

- **A refusal here is a 422, not a 404.** `setDependencies` and `POST /features` both take these ids
  as *fields of a body* rather than as the thing being addressed, so a bad one is a malformed
  request. The distinction is drawn in `structure-mapper.ts`: the thing a caller asked for being
  absent is `NotFound`, a *parent* a caller named being absent is `Invalid` — "the feature you asked
  me to edit is gone" answers a stale page, and "the rail you asked me to put it on is not in this
  plan" answers a bad field. Only the second can be a cross-plan reference.
  `apps/api/src/routes/macroplan/features/dependencies.test.ts` pins it by seeding a *second* plan
  with a real feature and asserting a 422 with `detail: "No feature <id> in this plan"`.
  A cycle, by contrast, is a 409 — the ids are all in this plan and the plan is the thing in
  conflict.
- **Cascading deletes are plan-wide.** `withoutFeatures` in `cascade.ts` strips every edge naming a
  removed feature from every rail rather than only the one being cut, which is correct precisely
  because a plan is the unit: any feature anywhere in this manifest could have named the one going
  away, and no feature outside it could have.
- **Macroplan has no import or export, and this record does not create one.** Spec §12 leaves it
  undecided — Microtask's drop-in import (ADR 0017) exists for a migration Macroplan has no
  equivalent of — and `PlanStore` correspondingly has no `publishPlan`, because no operation on a
  plan writes more than one item file and the manifest, so ADR 0006's two ordering rules are the
  whole of the story. What this record fixes is the precondition: if a plan is ever exported,
  backed up or cloned, the directory is the thing that moves, and it will be complete. An edge
  admitted now would be the one thing that made that impossible later.
- **`contained()` in `@repo/kernel` points at this record** for the plan directory the way it points
  at ADR 0005 for the project directory, and it is the shared backstop for both products. It is not
  the primary defence in either: `isUlid` and `isProduct` reject an untrusted segment before
  `path.join` ever sees it, which is why no public builder in `paths.ts` can reach the throw and why
  that module is tested directly.
- **The blast radius of a corrupt plan is one plan.** An unparseable manifest takes its plan out of
  the listing and leaves every other plan readable, which is the same containment the directory
  gives on disk, applied to a read.
- The edge budget is a plan's budget. `edgesPerPlan` — 400, in `packages/contracts/src/limits.ts` —
  counts the whole manifest rather than one feature's list, and `setDependencies` computes the total
  the write would *leave* so that a plan sitting exactly at the cap can still have its edges edited
  instead of freezing every list on the plan at once. A repeated id is stored once and costs once.

## Alternatives considered

**Allow a cross-plan edge and ignore it at render time.** Nothing in the forward pass would have to
change: `findCycles` already drops an edge naming an unknown feature before its walk, and the pass
would place the bar as though the dependency had never been stated. Rejected: the stored plan is
then not self-contained, so a copy of the directory is a lossy copy, and the user is shown a
dependency in the drawer that silently does nothing on the canvas. Refusing at the write is the only
point at which the person who drew the edge is still there to be told.

**Allow it in storage and refuse only at export.** Keeps the drawer permissive and puts the check
where the invariant is actually needed. Rejected twice over: the export does not exist (spec §12),
so the check would be written against a caller nobody can run, and it would fail at the worst
possible moment — an admin taking a backup, told their plan cannot be exported, with no obvious way
to find the edges responsible.

**Give a cross-plan edge a real meaning: one plan's feature waiting on another plan's.** The
coherent version of the feature, and a genuine ask in other planning tools. Rejected in spec §8 as
breaking the plan-directory invariant for no stated need: the two plans have different `startDate`s
and different sprint lengths, so the edge would have to resolve across two calendars, and nothing in
this product has asked for one. If it is ever wanted, it needs a record of its own and a shape that
keeps each directory whole — a reflected copy rather than a bare id.

**One directory per product holding every plan's files together.** Fewer directories, and a listing
becomes one read. Rejected: it gives back exactly the property this record is about, since deleting
or exporting one plan would then be a selective sweep over a shared directory rather than moving one
thing, and it would put every plan's blast radius on every other plan.
