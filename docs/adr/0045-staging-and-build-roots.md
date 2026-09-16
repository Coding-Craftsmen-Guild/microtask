# ADR 0045 — Staging and build roots live beside `projects/`, never inside it

**Status:** Accepted · 2026-09-12

## Context

Two parts of import need somewhere on disk that is not yet a project.

**The upload.** Design §7.3 says *"Nothing touches disk until confirmed"* and, in the next
paragraph, *"Sniffed-and-previewed files are staged server-side under an import-session id"*. Those
two sentences are in tension, and the resolution has a specific failure mode behind it.

**The write.** ADR 0006 states a rule for exactly this case, distinct from its per-mutation ordering:
*"A bulk import writes many files at once, so it stages into a temporary directory and moves the
project directory into place as its final step."*

The failure mode both share is precise, and it is worth stating exactly because the obvious guard
test does not catch it. `FsProjectStore.listManifests` lists the **immediate** subdirectory names of
`<root>/<product>/projects`, skips every name that is not a bare 26-character ULID, and reads
`<projectsDir>/<id>/project.json` from each survivor. So a directory that is an immediate,
ULID-named child of `projectsDir` holding a readable `project.json` **is indistinguishable from a
live project**: it appears in the projects list, and if it is present when the process boots,
`warmTokenIndex` loads its share tokens into the index as live credentials — unconfirmed,
unvalidated, and reachable by anyone holding the URL.

A staging root one level deeper, or under a non-ULID name, is invisible to `listManifests` instead.
That is *worse* for a guard test, not better: "stage a session, assert it is absent from the list"
passes for most wrong layouts, so it would stand in the record as a guarantee while guaranteeing
nothing.

## Decision

Three sibling roots under one product, and the projects root is only one of them:

```
<dataDir>/<product>/projects/<projectId>/     live, and the only thing listManifests reads
<dataDir>/<product>/import/<sessionId>/       an upload being staged
<dataDir>/<product>/build/<projectId>/        one project being assembled before it is moved
```

**Both new roots are outside `projectsDir(root, product)` and neither has it as a prefix.**

`build/` is a sibling rather than a temp directory elsewhere for one reason: it must be on the **same
filesystem** as `projects/`, or the final step of ADR 0006's bulk rule is a copy rather than a
rename, and a copy is not atomic. A move across roots under one `<dataDir>` is a rename.

Paths are resolved by builders in `packages/microtask-domain/src/storage/paths.ts`, beside
`projectDir` and `taskFile`, so they inherit the same two guarantees every other path in this repo
has: a `contained()` resolved-prefix check, and a ULID check on any id-shaped segment before it is
joined. `contained()` is package-private and stays that way — exporting the raw primitive would hand
`apps/api` a containment check with no id guard, and the session-id validation would then have to be
restated at the call site.

**The guard is two assertions, because one of them cannot fail on its own.**

- **A positive control**, proving the assertion can see the failure: write a directory named with a
  fresh ULID directly under `projectsDir`, holding a well-formed `project.json` with a share link,
  and assert `listManifests` **does** return it and `warmTokenIndex` **does** index its token.
- **A structural assertion**, which is the layout-independent one: the resolved staging root and
  build root are each neither equal to `projectsDir(root, product)` nor prefixed by it.

The second is what holds if someone relocates a root later. The first is what stops the second from
being vacuous.

**The sweep.** There is no scheduler in this deployment and this ADR does not add one. Sessions are
removed at two moments:

- **On confirm**, for the session just applied — success or failure.
- **On opening a new session**, for every session whose recorded `openedAt` is older than a stated
  TTL. Opportunistic sweeping needs no timer and runs exactly when someone is importing, which is
  the only time the directory grows.

The session records `openedAt` in a small marker file rather than relying on filesystem mtimes,
because the clock is injected everywhere else in this codebase and a test that has to touch mtimes
to exercise a sweep is a test that will be skipped on one platform.

`build/` needs no TTL sweep: a build directory exists only inside one confirm, under the lock, and
is removed on both paths out.

### Amendment, 2026-09-16 — a build directory is cleared on the way **in**, not on the way out

"Removed on both paths out" was wrong on the failure path, and Task 9 found it while implementing
the publish. The publish must clear `projects/<id>/` before it renames onto it: measured on
win32 / Node 22.16, a directory rename onto an **empty** destination is `EPERM` (where POSIX
succeeds), onto a **non-empty** one `EPERM`, and onto a **file** it succeeds and replaces the file
with the directory. So there is an unavoidable window, between clearing the destination and the
rename completing, in which **neither copy of the project exists**.

Removing the build directory on the failure path would therefore destroy the only remaining copy of
a project whose destination had just been cleared — the one outcome ADR 0006 calls the worst. So it
is cleared when a build **begins** instead. A failed publish leaves the assembled project in
`build/<projectId>/`, which is what makes that window survivable.

Residue is bounded at one directory per project id and is reclaimed by the next publish of the same
id, so the "no TTL sweep" conclusion stands — for a different reason than the one given above.

This is also where "cross-project atomicity is not claimed" acquires a sharper edge than it reads:
a project whose publish fails *after* its destination was cleared is **gone**, not merely
unimported. The confirm reports it as `failed`, the assembled copy is in `build/`, and the admin
still holds the drop — but for that one project "not atomic" means destructive rather than
incomplete, and an operator has to be told so rather than inferring it from the word.

## Consequences

- An unconfirmed upload is invisible to every read path in the product. Not merely unlisted —
  unreachable, because no route resolves a path under `import/`.
- **`listDirs` is not enough.** Reading a staged session back means enumerating its *files*, and the
  `FileSystem` port can only list directories. That addition belongs with the binary ones ADR 0044
  names, and the `move` ADR 0006 requires — four port methods across Tasks 7, 8 and 9, each also
  needing the in-memory fake updated.
- A second product added later (ADR 0014) gets its own three roots for free, because all three are
  keyed by product.
- The sweep is best-effort. A volume that is never imported to again keeps one abandoned session
  until the next import. That is the cost of having no scheduler, it is bounded by the session cap
  in ADR 0044, and it is preferable to a timer that fires in a container whose lifecycle nothing
  here controls.
- `<dataDir>/<product>/` now has meaning as a namespace rather than just a path to `projects/`. A
  future reader looking for "where does a product keep its data" finds three roots, and the one that
  is live is named.

## Alternatives considered

**Stage under `projects/<sessionId>/`.** Keeps everything for one product in one directory.
Rejected, and it is the reason this record exists: with a ULID session id it produces exactly the
directory `listManifests` cannot tell from a project, so an unconfirmed drop appears in the admin's
list and its tokens go live at the next restart.

**Stage in the OS temp directory.** No new root, and the OS sweeps it. Rejected twice over: it is not
guaranteed to be on the same filesystem as the volume, which makes ADR 0006's final move a
non-atomic copy; and on a container it is not on the persistent volume at all, so an upload would not
survive the restart that a multi-request chunked upload (ADR 0044) can straddle.

**One root for both staging and building.** Fewer directories. Rejected: they have different
lifetimes and different sweep rules — a staged session outlives a request and is swept by age, a
build directory lives inside one lock and is swept on both exits — and collapsing them would mean one
TTL rule applied to something that must never be swept while a confirm holds the lock.
