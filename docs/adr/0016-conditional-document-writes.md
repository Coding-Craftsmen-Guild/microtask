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
returns **409** and the client reloads rather than overwriting.

The client surfaces it: *"This tab changed elsewhere. Reloading the latest version."* If the local
document has unsaved edits at that moment, they are preserved in the editor and the user is told
before anything is discarded.

## Consequences

- Concurrent editing between an admin and a share-link holder degrades to a detectable conflict
  instead of silent loss.
- The keepalive flush can now legitimately fail. That is correct — a late write *should* lose — and
  the retry logic must not treat 409 as retryable, or it will loop.
- Every document write carries the version it is based on, so the editor must track the last
  `updatedAt` it received, including after a 409 reload.
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
