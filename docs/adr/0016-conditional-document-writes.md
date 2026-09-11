# ADR 0016 — Document writes are conditional

**Status:** Accepted · 2026-09-10

## Context

Autosave debounces 700 ms and also flushes on tab switch, on `Ctrl/Cmd+S`, on
`visibilitychange → hidden`, and on `beforeunload` — the last two with `keepalive`, so the request
outlives the page. `PUT …/document` currently replaces the tab's document unconditionally.

Today that is nearly safe, because one project is one file and one admin edits it. It stops being
safe here for two reasons: a `write` or `manage` share-link holder can now be editing the same task
concurrently with the admin, and the keepalive flush is by construction the request most likely to
arrive **late** — it is queued as the page goes away and can land after someone else has saved.

The failure is silent. Last write wins, and the newer content is simply gone.

## Decision

`PUT …/document` requires a precondition carrying the tab's last known `updatedAt`. A mismatch
returns **409** and the client stops writing rather than overwriting, and offers a reload it does
not perform unasked (corrected — see the amendment below).

The client surfaces it: *"Someone else saved this tab. Reloading discards your unsaved edits."*,
with a **Reload this tab** button. The local edits are preserved in the editor, and the user is
told before anything is discarded. (This first read *"This tab changed elsewhere. Reloading the
latest version."*, an automatic reload; the amendment below says why that could not stand.)

## Consequences

- Concurrent editing between an admin and a share-link holder degrades to a detectable conflict
  instead of silent loss.
- The keepalive flush can now legitimately fail. That is correct — a late write *should* lose — and
  the retry logic must not treat 409 as retryable, or it will loop.
- Every document write carries the version it is based on, so the editor must track the last
  `updatedAt` it received, including after a 409 reload.
- **The client never has two writes in flight on one tab** (recorded 2026-09-11 — see the
  amendment below). Each write presents the stamp the previous answer returned, so a second write
  sent before the first is answered carries the same `If-Match`, and whichever lands second is a
  409: autosave in conflict with itself, caused by nothing more than a save slower than the 700 ms
  debounce while the user keeps typing. A flush that arrives while a write is in flight waits for
  its answer and then decides afresh, on the stamp that answer carried.
- **The precondition is only as fine-grained as the clock.** `updatedAt` is an ISO millisecond
  stamp, so two writes landing inside one millisecond carry the same value and the later one is
  accepted as though it were based on the earlier — a lost update the check cannot see. Narrow in
  production, where a save is debounced 700 ms, but total under a clock that never advances: a
  fixed test clock makes every stale write look current. A domain test that means to measure the
  precondition rather than the seed stamp therefore drives it with a clock that moves. Closing the
  gap entirely would mean a revision counter instead of a timestamp, which the manifest would have
  to keep and every client carry.
- This is not real collaborative editing. Two people typing in one tab still fight; they just no
  longer lose work without being told.

## Alternatives considered

**Leave writes unconditional.** Matches today's behaviour. Rejected: today's behaviour is only safe
because there is one writer, and roles change that.

**Operational transform or CRDT for true concurrent editing.** Tiptap/ProseMirror supports it. Far
out of scope, and unnecessary for the actual use — a client ticking checkboxes while an admin edits
elsewhere.

**Last-write-wins with a visible "someone else saved" toast.** Cheaper, but it announces the data
loss rather than preventing it.

## Amended · 2026-09-11 — writes are serialised, and the reload is the user's

Building the editor's autosave found one thing this ADR implied without saying, and one it said
wrongly.

**Serialisation is a consequence of the precondition, not a detail of the editor.** Without
`If-Match`, two overlapping writes from one tab are merely redundant. With it, the second is refused,
because both were based on the same stamp and only one of them can be current. Nothing about a
second writer is needed to produce that 409 — one user typing through a slow save is enough — so
the client must hold at most one write in flight per tab, queue the next behind it, and build the
queued one from the stamp the first answer returned. `components/editor/autosave.ts` does this in
`flush()`, and it is recorded above as a consequence. It has a cost on the way out of the page: a
`beforeunload` flush queued behind a write in flight cannot start until that write is answered, so
the page asks for the browser's unsaved-changes prompt whenever a write is pending, not only while
the document is dirty, and that prompt is the guard on that path (ADR 0028).

**The client does not reload on its own.** The decision first said "the client reloads rather than
overwriting", with the message *"Reloading the latest version."*, and in the next sentence required
that unsaved edits be preserved and the user told before anything is discarded. At the moment of a
409 the local document **always** holds unsaved edits — the write that was refused carried them —
so the second sentence is the only branch that ever applies, and an automatic reload would break it
every time. What is built: the loop stops writing and does not retry, the edits stay in the editor
and are still recorded if the user keeps typing, and the indicator says *"Someone else saved this
tab. Reloading discards your unsaved edits."* beside a **Reload this tab** button, and a reload
happens only when that button is chosen.
