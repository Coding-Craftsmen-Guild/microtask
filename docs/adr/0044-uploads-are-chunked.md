# ADR 0044 — Every import upload is chunked, and the global body limit stands

**Status:** Accepted · 2026-09-12

## Context

Import moves bytes, so it meets the one bound every request in this API passes through.
`GLOBAL_BODY_LIMIT_BYTES` is 4,000,000 and it is registered as `app.use('*', globalBodyLimit)` on the
**root** app, before anything is mounted and **ahead of the credential guard**. That order is the
point, and `app.ts` says so: *"a 20 MB body on an unauthenticated socket is refused without being
read"*. `body-limits.ts` states the other half: *"every matching limiter runs and the first rejection
wins"* — so a per-route limiter can only **tighten** the global cap, never loosen it.

Design §7.3 says uploads go "one file per request with bounded client concurrency". The question this
record settles is what happens when one file does not fit in 4,000,000 bytes.

It is not only the zip. A **legacy project file is one file holding every tab's document inline**,
and the bounds this product already accepts are `LIMITS.tabsPerTask` = 40 and `MAX_DOCUMENT_BYTES` =
2,000,000. So a single legitimate task file has a ceiling near 80 MB, and a legacy project file the
same. The live data is nowhere near that — measured on 2026-09-12, the real `data/projects/` is
**8,608 bytes across two files, the largest 8,091 bytes** — but a migration path whose ceiling is
"whatever the operator's data happens to be" is not one you can promise will work.

## Decision

**The global limit stands at 4,000,000 bytes, and every import upload is chunked.**

The browser slices each harvested file — and a `.zip` — with `Blob.slice()` and posts it as a
sequence of chunks of at most **1,000,000 bytes**, which `apps/api` appends into the upload's staging
file (ADR 0045). A small file is one chunk, which is the overwhelmingly common case: at today's
sizes every file in the live volume is a single chunk.

Chunking is **uniform**, not a fallback for large files. One code path, no size branch, nothing that
is only exercised by data nobody has yet.

The browser still never parses an archive (ADR 0020) — `Blob.slice()` is byte slicing and knows
nothing about zip structure. Reassembly and expansion both stay server-side.

Two bounds replace the one this removes:

- **One chunk** is capped at 1,000,000 bytes, enforced by a route limiter and by the global one above
  it.
- **One session** is capped in total bytes, refusing with a message naming the cap. Import is
  admin-only, so this is not a defence against a hostile principal — an admin can already delete
  every project. It is a defence against an accidental drop of the wrong directory filling the
  volume, which would take the API down for a reason nothing in the UI would explain.

## Consequences

- **The unauthenticated bound is untouched.** Nothing this feature adds makes an unauthenticated
  socket able to post more than 4,000,000 bytes, which was the property worth keeping.
- **Server memory is bounded too**, and that is a benefit the alternative does not have. A raised cap
  would have hono buffering a whole 80 MB body to hand a handler one string; appending 1 MB chunks
  never holds more than a chunk.
- **The import is bounded by the volume, not by a number in this repo.** What an operator sees when
  a drop is too large is a message naming the session cap and the bytes already staged — not a 413
  they cannot act on.
- **The `FileSystem` port has to grow, and that is the real cost of this decision.** It is text-only
  today — `readText`, `writeTextAtomic`, `remove`, `removeDir`, `listDirs` — with no binary read or
  write, no append, and no way to list *files* in a directory. Appending binary chunks and then
  reading a zip's bytes both need additions, in the port, in `NodeFileSystem`, and in the in-memory
  fake the store's tests use. `apps/api` reaches the disk only through this port in production code
  (the sole `node:fs` import outside tests is the OpenAPI build script), and keeping it that way is
  what lets the import routes be tested against the fake like everything else.
- A chunked upload needs an ordering guarantee. Chunks for one file are posted **in sequence**, not
  concurrently; the bounded concurrency of §7.3 applies across *files*, not within one.
- An interrupted upload leaves a partial staging file. That is already covered: the session is
  unconfirmed, nothing outside staging has been touched, and the sweep in ADR 0045 removes it.

## Alternatives considered

**Raise the global cap.** Simplest change — one constant. Rejected: to cover the ceiling this
product's own limits allow it would have to go to ~85 MB, and that number would apply to every
unauthenticated socket the API exposes, deleting the property `app.ts` was deliberately ordered to
give. Raising it to some middle number instead only moves the cliff, and leaves the migration's
success depending on the operator's data being small enough.

**Narrow the global limiter's path pattern** so the import subtree is excluded and gets its own
larger, authenticated limiter. Rejected, and worth recording why it is worse than it looks: the guard
the import subtree would move out from under is **not only** the body limit. `requirePrincipal` is
registered on the `/v1/microtask` child, not on the root, so a subtree mounted outside the root's
`'*'` would need its own credential guard wired correctly or it would be both unbounded *and*
unauthenticated. That is a lot of load-bearing wiring to get right for a cap.

**Refuse large files and tell the operator to split the drop.** No code, and honest. Rejected: a
legacy project file cannot be split — it is one file by construction, which is the shape this whole
feature exists to read.
