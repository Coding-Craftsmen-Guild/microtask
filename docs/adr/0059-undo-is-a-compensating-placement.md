# ADR 0059 — Undo is a compensating placement, one step deep, and a delete has none

**Status:** Accepted · 2026-09-25

## Context

Spec §6 promises an undo and scopes it in the same breath: "Destructive drags get an undo. Dragging is
high-velocity editing and the existing Server Action round trip has no natural 'put it back'." The
sentence is about drags, and the reason it gives is about drags — a gesture fast enough to make by
accident, over a picture where the accident is a bar somewhere it was not meant to go.

The reason is worth taking literally, because the obvious reading of "undo" is not what it asks for.
Every other write in this product is a deliberate act with a control of its own: a rename is typed, an
estimate is typed, a delete opens a dialog. A drag is the one write a user can complete without having
decided to.

**There was nothing to copy.** This is the finding that shaped the whole record, and it was established
by searching for the machinery rather than by assuming its absence. Across `apps/` and `packages/`
there is no command journal, no `deletedAt` field, no tombstone, no soft delete and no restore route —
not in a domain package, not in a store, not in a contract, not on a route. Every write in
`packages/macroplan-domain/src/services/` is a manifest replacement, and ADR 0006 is why: write
ordering rather than transactions, one manifest write per change, with a partly-applied write ruled out
by there being nothing to apply partly. So an undo here is not a matter of reaching for an existing
mechanism; whatever it is, it is the first of its kind in this codebase, and the smallest thing that
keeps spec §6's promise is the right size for it.

**And the product already tells users where undo stops.** Four confirm dialogs shipped before this
phase end in the same sentence — "This cannot be undone." — on deleting a project, deleting a task,
deleting a tab and revoking a share link. That is not an absence to be filled in; it is a promise
already made to users about what a delete is.

## Decision

**An undo is a second `place` call carrying the placement the feature held before the drop. One step,
no history, and nothing else in the product gets one.**

`settledAt` answers **two** placements from one `dropTargetFor` call, with only the travel differing:
`to` is where the drop landed, and `back` is where the same feature already is — `aimedAt(held,
NOWHERE, …)`, a drag of zero pixels. So the pair is read out of the same layout the drop was resolved
against, at the same instant, and an undo cannot be computed from a second reading of the canvas that
has since redrawn. `DragNotice` offers it as a `<button>` — it sends a write, so it is not a link — and
the button is **absent** rather than disabled when there is nothing to take back, because a refused
drop wrote nothing.

**A placement's inverse is exactly expressible, and that is the whole reason this works.** A placement
is `(epicId, position)` — an order among siblings, never a date (ADR 0048) — so the state before a move
is two values, both of them already in hand. The API answers the whole recomputed plan on every
structural write (`apps/api/src/routes/macroplan/plan-response.ts`), so the compensating call restores
the timeline rather than merely the record: nothing has to be re-derived and nothing else on the plan
was touched, because no other request exists to have touched it.

**One step, and an undo carries no `back` of its own.** `send(featureId, back, null)` is what the notice
calls, so the line that follows an undo offers no second undo — the next drop replaces it. This is not
a limitation being tolerated; it is what keeps the feature from being a stack, and a stack is the thing
this ADR is mostly about refusing.

**A delete has no inverse and is not given a fake one.** Undoing a delete would mean re-creating the
thing, and re-creation is not the same act: the API mints a new id, a re-created feature has no items, a
re-created item has no description, and every edge that named the deleted feature was stripped in the
same write (`FeatureService.remove`). So a "delete undo" would hand back something that looks like what
was removed, under a different id, with its children and its dependencies gone. The four confirm
dialogs are the right answer to that, and this phase's two new ones join them in the same words —
`field.ts`'s `DELETE_FEATURE` and `DELETE_ITEM` both end "This cannot be undone", and the file records
that the claim is about the store and is true.

**The scope of the promise is therefore a move**, and the spec's own sentence is what bounds it: undo
exists because a drag has no natural "put it back", and every other write does.

## Consequences

- **`back` is computed on every drag whether it is used or not**, because it comes out of the same
  `dropTargetFor` call as `to`. That costs one more pass over one rail's bars and buys the guarantee
  that the two placements were read from one layout. It is also what `unchanged` compares, so the no-op
  half of the phase gate — a drop back on a bar's own x sends nothing — and the undo are the same two
  numbers rather than two opinions about where the feature was.
- **A refused write offers no undo**, and the notice says the refusal instead. `said.back` is `null` on
  failure, so the button is not rendered: there is nothing to take back, and an Undo beside a refusal
  would suggest the move happened.
- **An undo can itself be refused**, and it answers like any other placement — the sentence changes and
  no further undo is offered. It is the same `place` action through the same `orNoAnswer` wrapper, so
  there is no second failure path to get wrong.
- **Nothing is written optimistically, so there is nothing to roll back locally.** The canvas after a
  drop is what the server stored, which is why "put it back" is a request rather than a state
  restoration. A local edit would have needed a rollback on refusal, which is a second inverse to keep
  correct.
- **The notice is one line under the drawing and not a toast.** `sonner` is vendored in `@repo/ui` and
  mounted nowhere, and mounting a global overlay for one affordance is a decision this phase did not
  take — the idiom is `apps/microtask/components/tabs/use-notice.ts`'s, one notice at a time lasting
  until the next.
- **It is `role="status"` and not `role="alert"`**, for both sentences, because a reader who cannot make
  a pointer gesture cannot be interrupted by its result. The keyboard path to the same write is the
  drawer's `Move up` / `Move down`, which is a control rather than a gesture and needs no undo
  (ADR 0058).
- **Phase 4 inherits nothing to widen.** There is no journal to add writes to and no stack to deepen, so
  a later phase wanting undo for a second kind of write decides that on its own terms rather than
  discovering that half a mechanism already exists and constrains it.

## Alternatives considered

**A command journal — record every write, replay the inverse.** The general answer, and the one that
would make undo a feature of the product rather than of the canvas. Rejected on what it requires:
**every write must be invertible**, and two of the eighteen are not. A delete's inverse mints a new id
and cannot restore an item's description file or the edges stripped alongside it; a rename's inverse
needs the previous name, which nothing stores. A journal whose entries are invertible for sixteen writes
and not for two is a journal that has to say which, in the UI, on every entry — at which point the
honest version of it is what this ADR built, which is undo where the inverse exists and a dialog where
it does not. It would also be the first piece of state in this product that is neither the plan nor
derived from it, needing a place on disk, a retention rule and a per-principal scope, for a gesture that
is already reversible by making the opposite gesture.

**A soft delete — mark it deleted, offer Restore.** It makes a delete invertible, which is the one thing
this ADR cannot do, and "Restore" is a familiar affordance. Rejected because **it changes every read in
the domain.** `planView`, `schedule()`, `railsOf`, `itemsByFeature`, every service that counts against a
cap, and every test that asserts a count would each have to learn to skip a deleted row — and the
failure mode of forgetting in one place is a bar on the canvas for work that was deleted, or a cap
reached by rows nobody can see. ADR 0003's JSON-files-on-disk store makes the cost concrete: a deleted
feature stays in the manifest, so the manifest grows without bound unless something prunes it, which is
a second mechanism with a second retention decision. The product's own promise is the deciding factor
rather than the cost: four dialogs already tell users a delete is final, and softening that quietly
would make those sentences false.

**A tombstone in the plan directory, restorable by a route.** A narrower soft delete: the deleted
feature's rows move to a side file rather than staying in the manifest, so reads are untouched.
Rejected because it keeps the hard part and loses the easy one — the restore still mints a new id or
reuses one the index may have re-issued, still cannot rebuild the edges other features held, and now
needs a second file per plan whose lifecycle ADR 0050 ("the plan directory is the unit") would have to
be widened for. The reads staying clean is the smallest of the three problems.

**Undo as a client-side re-render, with the write sent only on a timer.** Offer Undo *before* sending,
so nothing is written unless the user lets the timer run out. It is the pattern behind "Message sent ·
Undo" and it makes undo free. Rejected: it would mean the canvas shows a placement the server has not
accepted, which is precisely the optimistic local edit this phase does not make, and a drop whose write
is later refused would have looked successful for several seconds. It also breaks the property the
drag's own tests assert — that what is on screen after a drop is what the server stored.

**A deeper stack: the last N placements, undoable in order.** Cheap, since each placement already
carries its own `back`, and it is what a user of a drawing tool expects. Rejected because the stack is
only correct while nothing else changed the plan, and this product has two surfaces and a share manager
that hands out `manage` seats — a second person's placement, or this user's own drawer control, makes
every entry below the top an assertion about a plan that no longer exists. One step is defensible because
the drop that produced it is the most recent write this page knows of; the second step down is a guess.
Replacing the notice on the next drop is what keeps the promise honest.

**Offer undo for the drawer's `Move up` / `Move down` too.** They go through the same `place` action and
would need the same two numbers. Rejected as scope rather than on the merits: they are controls with a
visible opposite — the way back from `Move up` is `Move down`, already on screen — so the "no natural
put it back" spec §6 gives as the reason does not hold of them. Recorded so that the asymmetry between
the canvas and the drawer is a decision rather than an oversight.
