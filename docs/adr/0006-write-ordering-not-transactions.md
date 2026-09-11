# ADR 0006 — Write ordering instead of multi-file transactions

**Status:** Accepted · 2026-09-10

## Context

ADR 0005 splits a project across a manifest and N task files, which loses the atomic commit that
one-file-per-project gave for free. The existing `withLock` serialises callers; it is not a
transaction. So a kill mid-operation can leave the manifest describing a task file that does not
exist. Containers are killed on every deploy, which makes this routine rather than exotic. *(The
API now drains and exits 0 on SIGTERM, so a deploy only reaches SIGKILL when the drain outlasts the
grace period — see the 2026-09-12 amendment below. The ordering rules are still what makes that
kill survivable.)*

## Decision

No journal, no commit marker, no `fsync`. Two ordering rules instead:

1. **Create and update: write the task file first, then the manifest.**
2. **Delete: write the manifest first, then unlink the task file.**

A crash can then only ever leave a file that nothing references — harmless garbage — never a manifest
entry pointing at a missing file.

Defensively, `packages/microtask-domain/src/storage` treats a manifest entry whose task file is
missing or unparseable as a
**single unreadable task**. It renders as broken in the UI; it never fails the whole project.

A bulk import writes many files at once, so it stages into a temporary directory and moves the
project directory into place as its final step.

## Consequences

- Crash recovery needs no repair step and no startup scan.
- Orphaned task files accumulate slowly. They are invisible and harmless; a sweeper can be a later
  ADR if it ever matters. The same applies to `.tmp` files: a hard kill between the write and the
  rename leaves one behind, and nothing sweeps them. Under normal failure the writer removes its
  own temp and rethrows, so litter only survives a kill.
- **Atomic replace is not concurrent-safe on Windows, so `QueueLock` is a requirement rather than a
  convention.** Measured on win32 / Node 22: 20 concurrent renames onto one destination give 4
  successes and 16 `EPERM` — `MoveFileEx(REPLACE_EXISTING)` refuses a destination another rename is
  holding. Verified with raw `fs.rename` and no adapter involved, so it is the platform and not the
  store. Every write to the same path must therefore go through the lock. Retrying inside the
  filesystem adapter was considered and rejected: contention compensation belongs at the lock, and
  putting it in a port method would change write-latency semantics for every caller to paper over a
  case the lock already prevents.
- **Temp filenames must be unique per call, not per process.** `${file}.${pid}.tmp` looks safe and
  is not: concurrent same-process writers share one temp path, and the first rename pulls it out
  from under the rest — 19 of 20 writers failed with `ENOENT` before this was fixed. The pid still
  matters for cross-process safety, so the name carries both the pid and a monotonic counter.
- Every mutation in `packages/microtask-domain/src/storage` must respect the ordering. This is
  exactly the kind of rule
  someone "tidies up" later, so it is tested directly — crash-ordering tests kill between the two
  writes of each mutation and assert the self-healing rule holds.

## Alternatives considered

**A write-ahead journal or `COMMIT` marker.** Real atomicity, and real complexity: recovery logic,
its own crash cases, and a format to version. Disproportionate here, where the worst outcome is
re-importing from a file the admin still holds.

**Reverting to one file per project.** Rejected in ADR 0005.

## Amended · 2026-09-12 — the API stops gracefully, and what "drained" can mean

This ADR treats a kill inside a write window as routine because "containers are killed on every
deploy". They were, but not because they had to be: the API installed no `SIGTERM` or `SIGINT`
handler at all, so `docker stop` waited out its grace period and then SIGKILLed — every deploy,
whether or not anything was being written. The app being replaced closed its server and exited 0.

`apps/api/src/lifecycle.ts` restores that. On the first of `SIGTERM` or `SIGINT` it closes the
listening socket, lets every request being served finish, and exits 0; later signals are ignored
rather than closing a closed server. SIGKILL is now the exception rather than the rule, and the two
ordering rules above remain the thing that makes it survivable when it happens.

**What "in-flight work finished" means here, precisely.** `QueueLock` is one private promise chain
with no way to observe it draining, and nothing outside `packages/store` can add one. It does not
need one: every `lock.run` in this process is taken inside a route handler that awaits it before
answering, so a request still being served is the only place a held lock can be, and a drain that
waits for the request waits for the write. That is asserted rather than assumed — a test parks a
write inside the lock, sends `SIGTERM`, and shows the process has not exited, the socket is
refusing new connections, the parked write then completes, its response is delivered, its file is on
disk, and only then does the exit come. **No sleep stands in for a drain.** Work enqueued on the
lock with no request attached would not be waited for; there is none today, and anything that
introduced some — a sweeper, a background import — would have to bring its own drain.

One measured detail decides whether any of this works: `server.close()` waits on an **idle**
keep-alive connection, which has no request to finish. The Next app reaches this API through
`fetch`, which pools exactly those, so the drain has to close idle connections itself — and has to
keep doing it while the drain lasts, because the socket carrying the last in-flight request goes
idle after the drain begins. A connection mid-request is never touched.
