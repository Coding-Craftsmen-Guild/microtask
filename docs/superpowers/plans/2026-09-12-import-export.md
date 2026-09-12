# Import and export implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute
> this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the drop-in import/export capability specified in §7 of the design, which is both a
product feature and the **only** path from the live one-file-per-project data on Coolify to the
directory-per-project layout this repo now writes (ADR 0005, ADR 0017).

**Architecture:** Classification, conversion, identity rewriting and the preview checks are **pure
functions in `@repo/microtask-domain`** — they take parsed JSON and paths and return a plan, touching
no disk. `apps/api` owns everything that moves bytes: the upload route, zip expansion, the staging
area, and the one write path that applies a confirmed plan. `apps/microtask` owns two Next route
handlers, because the API is internal-only and a Server Action can neither stream a download nor
carry a file (ADR 0015, ADR 0041). `packages/ui` owns the panel; the browser never parses an archive.

**Tech stack:** the stack already in the repo, plus exactly one new runtime dependency — a zip reader
in `apps/api`. No new browser dependency.

---

## Why this plan does not dictate code

Same reason as `2026-09-11-microtask-app.md`, which states it at length: a previous plan in this
series dictated function bodies and shipped a live XSS hole behind a clean test list.

So this plan fixes **interfaces, decisions, and acceptance criteria**, and names the specific
behaviour each test must pin. Where a value is load-bearing it is stated exactly; where a body is
mechanical the implementer writes it and the tests judge it.

Every task ends with `npx turbo run build typecheck lint test --force` green and `Cached: 0`.

**This plan was audited before execution**, by five independent lenses over the draft with every
finding adversarially verified against the repo. It raised 65 findings; 49 survived. Fourteen were
blocking, including four criteria that were impossible under the existing access policy, a write
ordering that contradicted ADR 0006, a security check whose absence left an un-revocable credential,
and several tests that could not fail. Those corrections are folded in below and are flagged
**[audited]** where the corrected form is non-obvious, so a worker does not "fix" them back.

---

## What is already built — do not rebuild it

Import inherits more than it looks like. Read this before writing anything.

| Already exists | Where | What it means for this plan |
| --- | --- | --- |
| `assertSafeDocument` | `packages/microtask-domain/src/document-guard.ts` | **§7.5 is done.** Depth, banned keys, href/src scheme allowlist, 2 MB, walked iteratively. Import calls it; it does not reimplement it. |
| `taskCache(document)` | `.../services/task-cache.ts` | Returns **all four** cached fields at once — `progress`, `updatedAt`, `tabCount`, `tabNames` (capped at `MAX_LISTED_TAB_NAMES`). Import builds every manifest entry's cache with this, never field by field. |
| `cleanName(value, fallback)` | `.../limits.ts` | Collapses whitespace, trims, caps at `LIMITS.nameLength`, and **returns the fallback when the result is empty**. This is how import converts a name that `EntityName` would refuse. |
| `assertWithin(key, current)` | `.../limits.ts` | The bound every service write applies. Import does **not** go through the services, so it must apply the bounds itself — see Task 4. |
| `contained(parent, candidate)` | `.../storage/contained.ts` | The resolved-prefix check. **It is package-private** — not in the domain's `index.ts` and not reachable from `apps/api` (ADR 0027 bans deep-path imports). See Task 7: staging gets path builders in `storage/paths.ts` beside `projectDir`/`taskFile`, which is where every other `contained()` call in this repo lives. |
| `TokenIndex.collisions(...)` | `.../ports/token-index.ts` | Exists precisely so a caller can "refuse a whole write before any of it lands". The on-disk half of the token-uniqueness check is this call. |
| `workspace:import`, `export:run` | `packages/kernel/src/access/action.ts` | Both actions exist and are already decided. `workspace:import` is in `ADMIN_ONLY_ACTIONS`; `export:run` is granted to `manage` and no lesser role. **This covers the scope axis as well as the role axis** — see the box below. |
| `LIMITS`, `MAX_DOCUMENT_BYTES`, `MAX_DOCUMENT_DEPTH` | `packages/contracts/src/limits.ts` | Import enforces the same bounds as every other write. It does not get its own numbers. |
| `jsonBodyLimit(maxBytes)` | `apps/api/src/http/body-limits.ts` | The limiter factory. See Decision 1 — the **global** cap is the problem, not the absence of a factory. |
| `isUlid`, `ShareToken`, `EntityName`, `Role` | `@repo/kernel`, `@repo/contracts` | The four shapes Task 4 validates. Ids are **rejected**, never sanitised. |

> **[audited] No policy change is in scope.** `export:run` is decided against a `{kind: 'project'}`
> target, and a **task** scope reaches exactly one project-target action — `project:read`
> (`packages/kernel/src/access/policy.ts:52`, mirrored in `packages/contracts/src/capabilities.ts`).
> So a task-scoped `manage` holder cannot export **at all**, and the answer is a 403, not a filtered
> bundle. Widening `TASK_SCOPE_PROJECT_ACTIONS` or `PROJECT_ACTIONS_A_TASK_SCOPE_REACHES` to admit
> `export:run` would grant a task-scoped link its first project-shaped read — a new authority needing
> its own ADR amending 0008 and 0038, both encodings changed together, and the full `capabilities()`
> ↔ `can()` agreement test re-run. Out of scope here. A task that proposes it is wrong.

---

## Decisions this plan must settle before Group C

Two questions are genuinely open. Each gets an ADR committed **before** the task that depends on it,
because both are the kind of decision that is invisible once code exists.

### Decision 1 — the upload cap (ADR 0044)

`GLOBAL_BODY_LIMIT_BYTES` is 4,000,000, registered as `app.use('*', globalBodyLimit)` on the **root**
app, before anything is mounted and **ahead of the credential guard** — which is the point:
"a 20 MB body on an unauthenticated socket is refused without being read"
(`apps/api/src/app.ts:53`, and its TSDoc). `body-limits.ts` states the rule that makes this
load-bearing: *"every matching limiter runs and the first rejection wins"*. A per-route limiter can
therefore only tighten the global cap, never loosen it.

A zip of the production volume is one file and is not bounded by 4 MB. So the design's "one file per
request" does not by itself fit under the existing cap.

- [ ] Settle it in an ADR before Task 7. **[audited] There are two options, not three.** The draft
      offered "mount the import subtree on a path the global limiter does not cover"; no such path
      exists, because the matcher is `'*'` on the root app and `app.test.ts` proves it fires two
      mounts deep. So the options are:
      **(a)** raise the global cap, accepting a looser bound on every unauthenticated socket; or
      **(b)** keep the global cap and have the browser post a large archive in bounded chunks that
      the API reassembles into staging.
      A third form of (a) — narrowing the global limiter's own path pattern so the import subtree is
      excluded — is a change to the one bound protecting every unauthenticated socket, and the guard
      it would move the import subtree out from under is **not only** the body limit: `requirePrincipal`
      is registered on the `/v1/microtask` child, not the root. If the ADR takes it, it must enumerate
      every other path group in a test and state what is now reachable pre-auth.
- [ ] The ADR states the resulting cap in bytes and what an operator sees when a real Coolify volume
      exceeds it. "It is unlikely to be that big" is not an answer — the whole point of this feature
      is the one day it is.
- [ ] **[audited] Two tests, both against the real composed app** (`createApp` through
      `apps/api/src/testing/harness.ts`), never an isolated `OpenAPIHono` — an isolated app contains
      no global limiter and so cannot see the failure this decision exists to prevent:
      **(a) the acceptance**, which is the falsifying half: a body larger than
      `GLOBAL_BODY_LIMIT_BYTES` posted to the import upload route succeeds, and the same body posted
      to any other route is refused. Without this half, "the import route is still under the 4 MB
      global" passes every test and the migration cannot run.
      **(b) the refusal**: one byte over the import route's own cap returns a 413 RFC 7807 document
      whose `maxBytes` extension equals that cap — not the global one, which is how the two are told
      apart.

### Decision 2 — where an *upload* is staged (ADR 0045)

§7.3: *"Nothing touches disk until confirmed"* and *"Sniffed-and-previewed files are staged
server-side under an import-session id"*.

**[audited] This decision covers the upload only.** How a confirmed project is *written* is already
decided by ADR 0006 and is not open — see Task 9.

The exposure is precise. `FsProjectStore.listManifests` lists the **immediate** subdirectory names of
`<root>/<product>/projects`, skips every name that is not a bare 26-character ULID, and reads
`<projectsDir>/<id>/project.json` from each survivor. So a staged project directory that is itself an
immediate ULID-named child of `projectsDir` holding a `project.json` is indistinguishable from a live
project: it appears in the projects list, and if it is present at boot, `warmTokenIndex` loads its
share tokens into the index **as live credentials**.

- [ ] Staging is rooted **outside** `projectsDir(root, product)`. State the path in the ADR.
- [ ] **[audited] The guard needs two halves, because the obvious single test cannot fail.** A
      staging root one level deeper, or under a non-ULID name, is invisible to `listManifests`
      anyway — so "stage a session, assert it is absent" passes for most wrong layouts.
      **(a) Positive control, proving the assertion can see a failure:** write a directory named with
      a fresh ULID directly under `projectsDir(root, 'microtask')` holding a well-formed
      `project.json` with a share link, and assert `listManifests` **does** return it and
      `warmTokenIndex` **does** index its token. If this half passes silently, half (b) means nothing.
      **(b) The structural assertion, which is layout-independent:** assert the resolved staging root
      is not `projectsDir(root, product)` and does not have it as a prefix. This is the half that
      actually holds if someone relocates staging.
- [ ] The ADR settles the sweep: when an abandoned session is removed, and by what. An import session
      that is uploaded and never confirmed must not accumulate on the volume forever.
- [ ] Staging paths resolve through builders in `packages/microtask-domain/src/storage/paths.ts`
      (see Task 7), so they inherit the same `contained()` check and ULID guard every other path in
      this repo gets.

---

## Binding constraints

| Rule | Source |
| --- | --- |
| **[audited]** `apps/microtask` / `apps/macroplan` import `@repo/contracts`, `@repo/api-client`, `@repo/ui` — nothing else. `apps/api` imports `@repo/kernel`, `@repo/microtask-domain` and `@repo/store`, and is the only app that does | ADR 0027 (Next apps); design §14 (the graph) |
| `.tsx` caps at 80 lines; functions at 50; complexity at 10; params at 4 | ADR 0027 |
| TSDoc only. No other comments, no file-level `eslint-disable` | ADR 0027 |
| Package internals are reachable only through each package's `exports` map. No deep-path imports | ADR 0027 |
| The browser never parses an archive | ADR 0020 |
| Classification is by **directory group**, never per file | ADR 0018 |
| Import writes the timestamps the bundle carries; it does not stamp `updatedAt` | design §7.4 |
| A **bulk import** stages into a temporary directory and moves the project directory into place as its final step. This is a different rule from the per-write ordering | ADR 0006 |
| `QueueLock` is **not reentrant**. A holder calls only helpers that do not take it | ADR 0030 |
| **[audited]** `process.env` has exactly one reader per app: `lib/env.ts` in `apps/microtask`, `src/server.ts` in `apps/api` | ADR 0012, `apps/api/eslint.config.js` |

---

## File structure

```
packages/contracts/src/
  bundle.ts              ExportBundle, ExportedProject, format + version constants
  import-plan.ts         the wire shape of a preview and of a confirm request
packages/microtask-domain/src/import/    [built — Group B, as it actually landed]
  grouping.ts            paths -> directory groups (ADR 0018)
  sniff.ts               one group -> one of four shapes, or a named error
  legacy.ts              convertLegacyProject (total) + convertBundledProject (needs schema-checked input)
  json.ts                the isRecord lift the three modules above share
  checks.ts              checkImport + the session-wide checks; the entry point
  drop-checks.ts         schema conformance and the drop vocabulary
  project-checks.ts      cross-check, ids, folders, bounds, document safety
  link-checks.ts         token/role shape, scope containment, token uniqueness
  refusal.ts             the vocabulary every reason is written in
  remint.ts              import-as-new identity rewriting (ADR 0019)
  replace.ts             replaceProject -> { project, removedTaskIds }
  plan.ts                [Task 9] groups + conflict choices -> the preview
packages/microtask-domain/src/export/
  bundle.ts              manifest + tasks -> ExportBundle, with and without tokens
packages/microtask-domain/src/storage/
  paths.ts               (modify) stagingDir / stagingFile / buildDir beside projectDir
apps/api/src/routes/microtask/import/
  routes.ts  handlers.ts  staging.ts  zip.ts  apply.ts
apps/api/src/routes/microtask/export/
  routes.ts  handlers.ts
packages/ui/src/transfer/
  drop-zone.tsx          drag target + directory picker, emits harvested files
  harvest.ts             DataTransfer/webkitRelativePath -> {path, file}[] (no React)
  preview-table.tsx      per-group outcome, counts, and every share link
  conflict-choice.tsx    skip / import as new / replace, per project
apps/microtask/
  app/(admin)/transfer/page.tsx
  app/api/export/route.ts          the download proxy (ADR 0015) — API is internal-only
  app/api/import/upload/route.ts   the per-file upload proxy (ADR 0015)
  components/transfer/             upload orchestration, bounded concurrency, error reporting
```

---

## Group A — the bundle vocabulary

### Task 1: `@repo/contracts` learns what a bundle is

**Files:** create `packages/contracts/src/bundle.ts`, `packages/contracts/src/import-plan.ts`;
modify `packages/contracts/src/index.ts`.

- [ ] `ExportBundle` is `{ format: 'ccg.microtask', version: 2, exportedAt, bundleId, projects[] }`.
      `format` and `version` are the **discriminator** ADR 0018 sniffs on, so they are literal-typed,
      not `string`/`number`.
- [ ] An `ExportedProject` carries the manifest's own fields plus the full task documents — a bundle
      is self-contained by construction. **[audited]** The test asserts a bundle carries, per task,
      the source `TaskDocument`'s tabs **deep-equal and in order** — ids, names, positions and each
      tab's `document` body — over a fixture holding **at least two tasks, one of them with more than
      `MAX_LISTED_TAB_NAMES` (8) tabs**, each with a distinct non-empty document. The repo's existing
      task fixture has exactly one tab per task, so "every tab" would be one tab and a bundler that
      kept only `tabs[0]`, or only the first task, would pass.
- [ ] **[audited] The preview's wire shape carries no share token.** Per group it names: the shape
      detected, the project id and name, task count in the manifest, task files found, **every share
      link with its name, role and scope plus a stable per-preview index**, a flag saying whether a
      project with this id already exists in the target store, and the outcome
      (`importable`, `blocked`, `error`) with a reason when it is not importable. §7.3 and ADR 0019
      both say *role and scope* — that is what makes an attacker-chosen `manage` link visible. The
      token adds nothing to the admin's decision and would turn the preview into a credential dump
      rendered into an admin page, hence serialised into the Flight payload and the HTML. That is
      exactly the disclosure ADR 0033 exists to close. The index is what a later confirm references
      when it needs to name one link.
- [ ] The collision flag is set by the same disk read the token-uniqueness check already performs, so
      it costs no extra I/O. It is what lets the UI say the sentence §7.4 requires (Task 10).
- [ ] The confirm request references an import-session id and carries a per-project conflict choice
      of `skip | new | replace`. A choice for a project id not in the session is a 422, not silently
      ignored.
- [ ] A test round-trips a bundle through `JSON.parse(JSON.stringify(...))` and the schema, and
      asserts equality. `exportedAt` and `createdAt` must survive as written — a schema that coerces
      dates would break round-tripping invisibly.
- [ ] `packages/contracts` gains no dependency. It stays framework-free (ADR 0024).

---

## Group B — classification, conversion, identity

Pure functions. No `node:fs`, no clock, no id generator passed implicitly — anything non-deterministic
arrives as an argument, so every test in this group is exact rather than approximate.

**Every module in this group is reached from `apps/api`, which can only import
`@repo/microtask-domain` through `"."`.** Each task's Files line therefore includes
`packages/microtask-domain/src/index.ts`, and a task that forgets it fails at Group C with an
unresolvable import.

### What Task 2 settled, which later tasks are written against

Recorded here after execution, because each is a reading the criteria left open and a later task
would otherwise have to guess:

- **"Grouped by directory" exempts a loose file.** A file that is neither a `project.json` nor a
  `<dir>/tasks/*.json` becomes a group of **one, keyed by its own path**, rather than joining its
  directory's bucket. Folding `mydir/notes.json` into `mydir`'s project-directory group would leave
  it no row it could be refused in, which is the silent skip ADR 0018 exists to close.
- **`ImportGroup.manifest !== null` is the v2-project-directory discriminator**, and nothing about
  the manifest's *content* has been validated at that point. That is deliberate, so Task 4's
  schema-conformance check runs first on data of no assumed shape.
- **`taskFiles` carries full harvested paths**, so the id Task 4 cross-checks against is the basename
  minus `.json`.
- **Sniffing classifies on `format` + `version` + `projects[]` only**, never a full
  `ExportBundle.safeParse` — Task 1's cross-collection refinements mean a bundle with an overcounting
  cache would otherwise land as `unrecognised` instead of classified-then-blocked with a reason.
- **A duplicate harvested path throws `Conflict`**, not the `Invalid` a refused path throws, and
  it is the one content problem in the module answered with a throw at all. The remedies differ —
  dedupe the archive or 422 the upload, against reject that one entry and keep the session — so the
  type carries the distinction rather than the message text, the way `ShareIndex.add` answers a
  token that already belongs elsewhere. `duplicatePaths(files)` is exported beside
  `groupImportFiles` for the same reason: a drop cannot produce a duplicate, **a zip can**, so Task
  8 asks the question before grouping and reports a duplicate entry name per row instead of losing
  the whole preview to a throw. It still decides whether expansion filters duplicates or answers
  409.
- **Classifier reasons arrive pre-elided** (value at 40 characters, path at 120), and the two
  elisions are different operations: a quoted **value** keeps its head, a **path** keeps both ends
  around an elided middle, because a path's tail is the part that identifies it — the ULID of the
  directory missing its manifest is the whole content of that message. Task 9 must not elide either
  a second time.
- **`SniffedGroup` is a discriminated union on `shape`**, so the narrowing sniffing performed is
  not thrown away at its own boundary: a `v2-project-directory` carries a non-null `manifest`, the
  three single-file shapes a non-null `file`, and `unrecognised` a non-null `error`. Task 4 and
  Task 9 therefore read those fields off the **sniffed** record with no null branch to test, and
  `group` stays on every member for the `path` a preview row renders. `ImportGroup` itself is
  unchanged.
- **A legacy project is detected by the *presence* of `id`, `name`, `tabs` and `shareLinks`**,
  never by their types. A truncated or hand-edited legacy file — `tabs` a string, `shareLinks`
  null — is what this migration will actually meet, and it is classified here and **blocked by Task
  4 with a reason naming the key**, rather than told it is "neither a Microtask export nor a legacy
  Microtask project". Same classify-then-block principle as the wrong-version case; Task 4 is the
  only layer that can say what is wrong with such a file.
- **`normaliseImportPath` refuses four more forms than the criteria list**, each because the thing
  that would otherwise answer it is a filesystem answering 500 where this answers 422: a control
  character (NUL included), a segment with leading or trailing whitespace, a segment with a trailing
  `.` (win32 strips both, so `a ` and `a` would pass the collision check and then collide on the
  volume), and a length over a bound — 255 **bytes** per segment (ext4's component limit, counted
  in bytes so a 255-character CJK name cannot pass it), 1024 characters for the whole path. A path
  that reduces to nothing, `.` included, is told it names the **harvest root** rather than blank. The
  whole-path bound sits far above `ImportPreviewGroup.path`'s 200 deliberately: a longer path is
  expected, and eliding its middle for the row stays Task 9's job. Task 11 decodes the two browser
  path shapes and must still not re-implement any of this.
- **Names are matched case-sensitively throughout**, including the `.json` suffix, so one spelling
  cannot be read two ways. Pinned by a test, mutation-verified.

### What Task 3 settled, which later tasks are written against

Same reason, one task later — each is a reading the criteria left open:

- **A non-ULID legacy id is carried through, neither repaired nor refused here.** An old tab id that
  is not a ULID becomes the task id verbatim, so **Task 4's id check is what refuses it**. That was
  chosen over minting a replacement, which imports a file nobody could be warned about, and over
  throwing, which ends an upload with nine other directories left to describe. It makes Task 4's id
  check load-bearing for the legacy path: without it `taskFile()` throws `Invalid` at write time,
  with half a bundle already on disk. Pinned by a test feeding `../etc/passwd` as a tab id.
- **`convertLegacyProject` is total over `unknown`; `convertBundledProject` requires pre-validated
  input.** The legacy half returns for `null`, a string, a number, an array and `{}`. The bundle
  half reads `manifest.folders`, `manifest.tasks` and `document.tabs` directly and throws a bare
  `TypeError` when any is absent, because a v2 manifest needs no conversion before a schema can be
  applied to it, whereas a legacy file only reaches a schema at all once converted. **So Task 4 runs
  its schema-conformance check on the raw manifest and raw task documents, and calls
  `convertBundledProject` only after that check has passed.** `ImportGroup.manifest !== null` is the
  whole v2-project-directory discriminator and validates nothing inside the file, so converting
  before checking turns one hand-edited `project.json` into a failed upload rather than a refused
  row — which is a failed Task 4 criterion. Pinned at both ends, by a test named "requires a
  manifest that has already been schema-checked, unlike the legacy path".
- **A v2 name is repaired, not blocked.** Both converters put every project, task, folder and tab
  name through `cleanName`, which collapses whitespace, trims, caps at `LIMITS.nameLength` and
  substitutes a stated literal fallback for a blank. **Consequence for Task 4's collection-bounds
  criterion:** on the converted shape the "every name against `nameLength`" half can never fire for
  those four name kinds, so written there it is a check that looks alive and is dead. **The name
  bound belongs on the drop set** — the raw manifest and raw documents, where a malformed v2 name
  still exists — **while the collection counts stay on the converted shape** as the criterion says.
  The legacy path needs no name bound at all, conversion guaranteeing it. The one name that can
  still violate the bound on a converted v2 shape is a **share link's**, which
  `convertBundledProject` deliberately leaves alone because it is the only name the contracts allow
  to be empty. Do not answer this by dropping `cleanName` from the converters: the audited Task 3
  criterion requires it, and `tabNames` is derived from tab names.
- **An entry no document was carried for keeps the cache it arrived with.** There is nothing to
  count from, so the **manifest/file cross-check is the only thing that can refuse such a project**.
  Inventing an empty cache would answer a project about to be blocked with a row claiming the task
  is empty.
- **Inner tab ids are minted fresh on every import**, from the injected `IdGenerator`: a legacy tab's
  id becomes the *task* id, so the inner tab has no id to inherit. Converting the same file twice
  therefore yields different tab ids, so no later task may treat conversion as reproducible across
  runs or a re-import as idempotent. Pinned by asserting the **exact sequence** a seeded
  `sequentialIds()` yields — asserting only that the ids are ULID-shaped passes just as well when the
  generator is reached implicitly, which is the one thing this group's purity rule forbids.
- **A stamp is the one field the legacy reader repairs, and broadly**: a project or tab
  `createdAt`/`updatedAt` that is missing, blank **or not a string** takes the import's clock. A
  stamp is the one field `z.string()` cannot tell a fabricated value from a real one, so the
  alternative is not a reported problem but `"12345"` on disk.
- **`convertBundledProject` copies the manifest by rest-spread**, so a field added to
  `ProjectManifest` cannot be left out — the property `bundle.ts` buys with `.extend()`. The cost is
  that unknown keys a hostile `project.json` carried survive conversion, and `ProjectManifest` is a
  stripping `z.object`, so `safeParse` reports nothing about them. **Task 9 therefore writes what
  `ProjectManifest.parse` / `TaskDocument.parse` returned — zod strips unknown keys — not the
  converted object.**
- **`isRecord` is redefined per file on purpose**, that being the repo-wide idiom (`api-error.ts`,
  `principal.ts`, `document-facts.test.ts` each hold their own). `src/import/` now has two
  byte-identical copies; when Task 4's `checks.ts` wants a third, lift one into a private
  `import/json.ts` beside `grouping.ts` — not exported from `src/index.ts` — and have all three
  import it.

### What Task 4 settled, which later tasks are written against

Same reason again. Every entry here is a reading the criteria left open, and the last four are
things Task 9 would otherwise reintroduce or get wrong.

- **The checks take one project per row, not one group.** `checkImport(projects, target)` takes a
  `DroppedProject` per **project**, so Task 9 explodes a `v2-workspace-bundle` into one per
  embedded project — which `ImportPreview`'s distinct-`projectId` refinement requires anyway — and
  gives each its own `path`, because that `path` is what a schema reason quotes and the only thing
  that tells a bundle's nine rows apart.
- **`DroppedDocument.id` is the id the *drop* named the document by**, not the document's own: a
  task file's basename, or `null` for a bundled document that nothing but its own `id` names. That
  is Task 2's settled reading made into a field. Passing a document's own id for a **file** silently
  disables the third cross-check reason below.
- **`DroppedProject.shape` names conversion state, not provenance** — `'raw' | 'converted'`, never
  `'v2' | 'legacy'`. It is the distinction that decides what happens: `raw` is a manifest and
  documents nobody has validated, `converted` is a project already in the shape this repo stores.
  Provenance names would read fine until Task 5's **reminted v2** project is re-checked, which is
  converted and would have to be labelled `legacy` to be accepted.
- **Legacy arrives already converted; raw arrives raw.** `convertBundledProject` requires
  pre-validated input, so schema-check-then-convert is `checks.ts`'s to own and not a caller's to
  remember. `convertLegacyProject` is total, needs a clock and an id generator, and has no order to
  get wrong — so the caller runs it and hands over the `ConvertedProject`.
- **Schema conformance also runs on the *converted* legacy manifest**, that being the only manifest
  a legacy file has. It is the only thing anywhere in the preview that refuses a `position` which is
  not a number — carried through as `NaN`, written by `JSON.stringify` as `null`, and refused by the
  client through `ProjectList` with the whole index behind it. It makes the id, token and count
  checks redundant on that path and not dead: each reports its own sentence where a zod issue path
  names only a field, and each one's absence is a live hole on the other path.
- **The cross-check carries a third reason neither difference can see:** a task file named for an id
  the manifest *does* name, holding the document of a different task. Both id sets agree on such a
  file, and `convertBundledProject` pairs a document to its entry by the id **inside** the document,
  so it lands the wrong content under the right name and leaves the entry's cache untouched. It is
  one reason inside the cross-check, not a ninth check.
- **Bounds are read from `LIMITS`, not applied through `assertWithin`.** `assertWithin` asks "may
  one more be added?" and answers by throwing; a preview asks "is what arrived already over?" and
  may not throw. Same numbers, same module, so nothing can drift from `ProjectService.create`.
- **Reasons arrive pre-elided *and* pre-capped** — each inside `MAX_PREVIEW_TEXT_LENGTH`, the list
  inside `MAX_PREVIEW_REASONS`, the last reason spent saying how many were dropped. Task 9 must not
  elide or truncate a second time, for the reason Task 2 settled for classifier reasons.
- **A reason names a field path, never a schema's sentence.** Including zod's message would make the
  bounds tests unfalsifiable, its "Too big" text quoting the very limit a purpose-built reason
  exists to name.
- **`CheckedProject.converted` is populated on a blocked row too**, so a preview row can report the
  counts it is refusing; `outcome` is the field that says whether it may be written. It also carries
  **live tokens**, being the manifest as it would be stored — so Task 9 builds
  `ImportPreviewShareLink` from it by index, role and scope and never serialises it whole (ADR 0033).
- **The session `projectsPerProduct` bound must be re-run by the confirm**, inside the `QueueLock`
  and **after** any reminting: a concurrent confirm may have landed, and a project imported as `new`
  takes a fresh id, so it adds one where the colliding id it arrived with adds none.
- **Six check halves cannot fire on either path**, and a later task must not read their presence as
  evidence that some input reaches them: the `role` enum, `createdBy`, the tab-id and folder-id ULID
  halves, and — measured, not assumed — `foldersPerProject` and `tabsPerTask`. The legacy converter
  always produces `view`/`write`, `createdBy: null`, minted ULID tab ids, no folders and exactly one
  tab per document; a raw drop over any collection bound fails `ProjectManifest`/`TaskDocument`
  first and comes back with `converted: null`. The two counts that *do* still add a sentence are
  `tasksPerProject` and `shareLinksPerProject`, on a converted legacy project. All six are kept as
  defence in depth and tested directly against hand-built converted projects.
- **`overBound` is exported from the barrel** so the confirm words the `projectsPerProduct` refusal
  with the same sentence and reads the bound from the same place. Restating the comparison in
  `apps/api` is the drift "same numbers, same module" exists to prevent.
- **`TokenCarriers` answers only the cross-project question, and is a set for that reason.** Keyed by
  token, holding the **set** of project ids that carry it. It was a list of one entry per link, and
  that shape produced a live false refusal: two groups can claim one project id — which
  `ImportPreview` anticipates, and which the plan answers by letting the **first** group keep the id
  — so both record the same id for the same token, a count of entries reads two for a project
  holding one link, and the good row is refused with a reason that is not true of it. Every project
  on the volume has share links, so that was the common case rather than a corner. The
  within-project twin is read off `manifest.shareLinks`, the only place that answer lives, and the
  set makes counting entries unexpressible rather than merely discouraged.

### What Task 5 settled, which later tasks are written against

Same reason again, and the first three are things Task 9 cannot get right by reading the criteria.

- **`replaceProject`'s `current` must be resolved by the incoming project's own id, and by nothing
  else.** Its precondition is that `current` is the manifest of the project `incoming` collides
  with, and **nothing enforces it** — the function reads `current` only for its share links and its
  task ids, and writes `incoming`'s id either way. Hand it the wrong manifest and it writes the
  bundle's project while reporting *another* project's tasks as removed, and merges that project's
  share links into this one. The confirm therefore reads the manifest at
  `incoming.manifest.id` — not the manifest of the row, the session, or the collision flag the
  preview computed earlier, any of which can have moved by the time the lock is held.
  `ShareIndex.add` is a partial backstop, refusing a token another project owns, but it says
  nothing about the tasks.
- **`replace` lives in its own module**, `import/replace.ts`, not in `remint.ts`. The two share no
  input and no theme: reminting rewrites identity from an injected generator, where a replace
  reconciles against what the target already holds, mints nothing, and has to return a second
  value — `removedTaskIds`, which cannot be read off the resulting manifest.
- **How `removedTaskIds` is applied is deliberately left open**, because ADR 0006 decides it. A
  project built whole and moved into place drops those files by construction; an apply that writes
  in place has to delete them, and must do it through `store.deleteTask` rather than
  `TaskService.remove`, which takes the same non-reentrant lock the confirm already holds
  (ADR 0030). Either way the list is the statement of what a replace removes, which a per-project
  outcome has to be able to report.
- **`remintProject` returns only the reminted `ConvertedProject`** — no old-to-new maps. Link order,
  names, roles and stamps are preserved, so a caller needing to pair an input link with its output
  one does it by index. A confirm that wants to say *"N share links will get new URLs"* takes N from
  the preview row it already has, not from here.
- **Folder ids and inner tab ids are not minted**, and ADR 0019's list does not ask for them.
  Nothing references either across a project: a folder id is named only by `TaskEntry.folderId` in
  the same manifest, a tab id only inside its own task document, and neither becomes a path segment
  or an index key. A later task must not read their absence as an omission.
- **A reference that resolves to nothing is carried through unchanged, not repaired** — a
  `scope.taskId` naming a task the project has not, or a document the manifest names no entry for.
  Both are refused by checks that already exist, which is what `DroppedProject`'s `'converted'`
  shape exists to allow, so **re-checking a reminted project reports the problem** where nulling it
  would import a project nobody could be warned about. Widening such a task scope to a project
  scope is specifically not the answer: it hands the holder authority no check agreed to.
- **The bundle is the authority for everything it carries; the kept links are the only thing a
  replace adds to it.** So a link both sides hold takes the bundle's name and role, the project
  name, folders and both stamps are the bundle's (design §7.4), and the bundle's links come first
  with the kept tail after. That ordering is load-bearing for Task 6: a replace into a store
  holding nothing then produces *exactly* the bundle's manifest, which is what lets the
  export/import/export round trip compare equal.
- **Task 9 re-checks after a remint and *not* after a replace.** A remint rewrites the incoming
  project and takes a new project id, so `checkImport` has to see it again — that is what
  `DroppedProject`'s `'converted'` shape is for. A replace adds nothing the preview did not
  already check: the incoming project went through it, and the merge only appends links that were
  on disk. Re-checking a replace is not merely redundant, it is **wrong**, for the reason in the
  next entry.
- **Scope containment is an import guard, not a store invariant**, so it must not be applied to a
  link kept from disk. It exists to refuse a *bundle* asserting a scope it has no business
  asserting; a kept link was validated by this store when it was minted. The case that forces the
  distinction: a kept link scoped to a task the bundle does not carry is left scoped to a task
  that is about to be removed, and `checkImport` would block the whole project for it with
  "Share link N is scoped to task …, which this project has not". That is a false refusal. The
  state is not corruption and is not even new — `TaskService.remove` rebuilds the manifest as
  `{...current, tasks, updatedAt}` and leaves `shareLinks` untouched, so **any `manage` holder
  deleting a task already strands a scope the same way**. It is a link that 404s, which this
  product tolerates.
- **The stranding is reported rather than repaired**, through `Replacement.strandedTaskScopes` —
  indices into `project.manifest.shareLinks`, naming the kept links a replace invalidates. Task 9
  tells the admin how many client links will stop resolving, which is a consequence of their own
  conflict choice and should not be silent. It is the same argument `removedTaskIds` rests on: a
  caller needs a statement the resulting manifest cannot express. Neither of the two repairs is
  available — widening such a scope to the project grants authority nothing agreed to, and dropping
  the link silently withdraws access nobody revoked. An index and not a token, a token being a
  credential and the scope being readable off the link at that index.
- **A share link the bundle never mentions is kept**, and that is also why a replace needs no
  lineage pass at all: preserved tokens plus kept links means every token either manifest held
  still exists, so no `createdBy` that resolved before resolves nowhere afterwards.
- **What a duplicated token actually costs was measured here and the record corrected.** It is not
  the link-flips-on-restart ADR 0019 described; `ShareIndex.add` refuses the token and
  `warmTokenIndex` is awaited before `serve()` with no catch, so the next container restart never
  opens a socket. See the amendment dated 2026-09-12 on ADR 0019. Reminting and the preview's
  token-uniqueness check are boot-critical, which is how Task 9 should weigh them.

### Task 2: grouping and the four shapes

**Files:** create `packages/microtask-domain/src/import/grouping.ts`, `sniff.ts` + tests; modify
`packages/microtask-domain/src/index.ts`.

- [ ] Input is `{ path, json }[]` where `path` is the normalised relative path the browser harvested.
      Grouping is **by directory**, and the four shapes of ADR 0018 are detected on the group.
- [ ] The regression that motivates the whole ADR is a test: a directory containing `project.json`
      **and** `tasks/<id>.json` files classifies as one **v2 project directory** whose task files are
      members. Classifying the same input per file — `project.json` importable, every task file
      "unrecognised" — is the bug; the test asserts the task files are members, not skips.
- [ ] A `tasks/*.json` orphan with no sibling `project.json` is an **error naming the missing
      manifest**. A test asserts the message names `project.json` and the directory. A generic
      "unrecognised file" is a failure of this criterion.
- [ ] A legacy project is detected by `{ id, name, tabs[], shareLinks[] }` **with no `format` key**.
      A file carrying `format` but an unknown `version` is an error naming the version found and the
      version supported — not "unrecognised", which would read as "this isn't ours".
- [ ] Path normalisation is one helper, and it rejects rather than repairs: an absolute path, a `..`
      segment, a drive letter, and a backslash-separated path are each pinned by a test. A test
      proves the server does not trust the client by feeding a hostile path straight to the
      server-side entry point. **[amended 2026-09-12] It lives server-side only.** The draft said
      "shared by both browser sources", which cannot be built: `packages/ui` may not import a
      `*-domain` package (ADR 0014, and the lint rule enforces it), and `@repo/contracts` cannot host
      it either — it throws `Invalid` from `@repo/kernel`, which contracts holds as a devDependency
      with a committed test asserting it stays one (ADR 0038), and giving a package shared by two
      products a dependency on one product's contracts is the coupling ADR 0014 prevents. See the
      amendment appended to ADR 0018. Task 11 owns the *decoding* of the two browser path shapes and
      must not re-implement the rejection rules.
- [ ] Grouping is stable and order-independent: shuffling the input array yields the same groups. A
      test shuffles with a fixed seed, because `readdir` order and drop order are both arbitrary.

### Task 3: the legacy reader

**Files:** create `packages/microtask-domain/src/import/legacy.ts` + test; modify
`packages/microtask-domain/src/index.ts`.

The source of truth for every rule here is `legacy-prod:lib/store.js`, not a paraphrase of it. Read
`normalizeShareLinks` at `legacy-prod:lib/store.js:119-127` before writing this.

- [ ] Mapping is design §7.6: old project → **Project**; each old **tab** → a **Task**; old
      `shareLinks` → **project-scoped** links, `write → write`, `read → view`; tokens preserved; ids
      preserved.
- [ ] **[audited] The produced Task takes the old tab's `name` and `position` verbatim**, and its
      `folderId` is `null` — legacy has no folders. The **inner tab, and only the inner tab**, is
      named `General`. The draft named the inner tab and left the Task's name unstated, which yields
      a workspace where every task is called "General": since search matches names only and tab names
      are explicitly out of its reach (ADR 0021), that is an entire imported workspace nobody can
      find. A test asserts imported task names equal the source tab names in source order, and a
      second asserts search finds an imported task by the name its legacy tab carried.
- [ ] **A legacy link with no `permission` maps to `write`, not `view`.** **[audited] The real rule
      is broader than "missing"**: `PERMISSIONS.includes(link.permission) ? link.permission : 'write'`
      — *any* value outside `['read', 'write']` becomes `write`. Pinned by two tests: a link with no
      `permission`, and a link with `permission: 'admin'`. Mapping either to `view` silently takes
      away access a client has today. This is the highest-consequence line in the group.
- [ ] **[audited] A legacy link with no `name` but a `label` maps that `label` to `name`** —
      `name ?? label ?? ''`, the other half of the same line. Its own test, on a hand-built link
      carrying only `{token, label, createdAt}`. Legacy's own comment defines one generation: *"Older
      links stored a `label` and no permission"* — so the data that makes the rule above load-bearing
      is the same data that carries a `label`. Dropping it turns a named credential into an unnamed
      row, and no data in this repo can reveal the omission: the local demo files all use `name`.
- [ ] A legacy link with `createdAt` missing takes the import's clock, matching `link.createdAt || now()`.
- [ ] **[audited] Names are normalised, not carried through.** `EntityName` is `.trim().min(1)`, and
      the **only** name the contracts let be empty is a share link's. So every imported project, task,
      folder and tab name goes through `cleanName(value, fallback)` with a stated literal fallback. A
      test imports a legacy project with an empty project name, an empty tab name and a 200-character
      tab name, and asserts the produced manifest parses clean as `ProjectManifest` and the task as
      `TaskDocument`. Writing `''` does not fail at import — it fails later, when the client refuses
      the response and takes the whole projects index down with it.
- [ ] **An imported share link with no `name` is accepted**, because import is not minting. This is
      the one thing ADR 0042 adds for the importer to honour (`docs/parity/legacy-microtask.md`,
      feature 67). A test pins a nameless link surviving import and rendering as "Unnamed link".
- [ ] Ids are preserved, so an old **tab** id becomes a **task** id. A test asserts the produced task
      ids equal the source tab ids, and that they are ULIDs — if legacy ever held a non-ULID tab id,
      `taskFile()` throws `Invalid` at write time and the import fails late instead of in the
      preview. Decide and pin which it is.
- [ ] **[audited] Every manifest entry's cache comes from `taskCache(document)` — all four fields.**
      `progress`, `updatedAt`, `tabCount` and `tabNames` are written by one operation precisely so
      that an entry refreshing three of them is a cache that looks current and is not. The entry's
      `updatedAt` is the **task document's**, not the project's. A test imports a legacy project with
      a real checked/unchecked document and asserts all four fields against `taskCache()` on that
      document. An import that writes `{done: 0, total: 0}` renders 0% everywhere; one that writes
      the project's stamp into the entry defeats `cacheAgrees`, which only self-heals when that task
      file is read.
- [ ] **The same applies to a v2 bundle**: the cache is a cache of a derivable value, so all four
      fields are recomputed, never trusted. A test feeds a bundle asserting `{done: 99, total: 99}`
      and a `tabCount` of 41 over a document with two unchecked items in one tab, and asserts the
      stored entry says `{done: 0, total: 2}` and `tabCount: 1`.
- [ ] Conversion is tested against **`data/projects/*.json` as it actually is**, not a hand-written
      fixture, via the derived fixture machinery already in `packages/contracts/scripts` — and the
      derivation's fail-closed neutralisation is not weakened to make this easier.

### Task 4: the blocking preview checks

**Files:** create `packages/microtask-domain/src/import/checks.ts` + test; modify
`packages/microtask-domain/src/index.ts`.

Each check **blocks** the import for the project it fails. A check that warns is a failed criterion.
A check that throws is also a failed criterion: §7.3's preview has to describe every problem at once,
so these return outcomes and the tests assert on the returned plan.

- [ ] **[audited] Schema conformance, and it runs FIRST** so the other checks operate on data of
      known shape. Every manifest in the drop set parses as `ProjectManifest` and every task document
      as `TaskDocument`, failure naming the project and the offending path. Nothing downstream does
      this: `FsProjectStore` reads and writes `JSON.parse(raw) as T` with no validation, and the API
      returns the domain object straight through — the validation happens one process later, in the
      **client**, which parses every response through the contract schema. So a malformed imported
      project is not refused at import; it makes the whole projects index render "Microtask could not
      reach its API", because `ProjectList` is one array parsed as a whole. And a manifest missing
      `shareLinks` entirely is worse than a render problem: `warmTokenIndex` and `ShareIndex.add`
      both dereference it, awaited in `main()` before `serve()` with no catch, so **the next
      container restart never opens a socket**. Three tests: a `position: -1` entry and an
      out-of-enum `role` blocked at preview; a malformed `shareLinks` member blocked before reaching
      `ShareIndex.add`; and a confirmed import round-tripping through `ProjectView.parse` and
      `ProjectList.parse`, which are the schemas the client actually reads it back with.
- [ ] **[audited] Manifest/file cross-check by task id, not by count.** Build the set of
      `TaskEntry.id` from the manifest and the set of ids the task files are named for, and block
      when either difference is non-empty, reporting **both sets by id**. Three tests: 9 entries with
      8 files; 9 files with a manifest naming 8; and **9 entries with 9 files whose ids do not
      correspond**. The third is the one that separates a set comparison from a count comparison, and
      it is the same observable failure ADR 0018 exists to prevent — now behind a preview that
      truthfully says "9 and 9".
- [ ] **Token uniqueness** within the drop set **and** against disk. The on-disk half is
      `TokenIndex.collisions`. A test pins a bundle whose two projects share one token — the in-set
      half, which `collisions` cannot see. **[audited]** A collision is reported by marking the link
      and naming the owning project, never by echoing the token into the preview.
- [ ] **[audited] Id, token and role validity.** Project, task, tab and folder ids go through
      `isUlid`; every `shareLinks[].token` and `shareLinks[].createdBy` through the `ShareToken`
      pattern; every `shareLinks[].role` through the `Role` enum. Rejected, not sanitised.
      **State the reason in the criterion, because it differs from the reason ids are checked:** an
      id is checked because it becomes a path segment, but **a token is checked because nothing
      downstream of import ever checks it again.** `ShareIndex` is a bare `Map` and `find()` is a
      bare `get`, so any string in a manifest resolves as a principal — while revocation and rename
      declare `token: ShareToken` in their route params, so a 12-character token or one containing a
      `.` gets a 422 and **can never be cut**, and `ShareLinkList` refuses the whole decode so the
      share manager cannot even open to show it. Drop one crafted legacy-shaped file on an admin and
      it plants a `manage` bearer credential the product has no mechanism to withdraw. ADR 0019
      accepts that whoever can import can plant a token they choose; it does not accept that the
      planted token is outside the revocation surface. An unenumerated `role` has the mirror-image
      failure: `GRANTS[principal.role].includes(...)` reads `undefined.includes` and 500s every
      request that link makes. Four tests: a path-shaped id; a 12-character token; a token with dots;
      a link declaring `role: "owner"`.
- [ ] **[audited] Id uniqueness**, which shape-checking does not give. Task ids and folder ids unique
      within a manifest; tab ids unique within a task document; project ids unique across the whole
      session. Two entries sharing a task id resolve to one file, so the second document written
      overwrites the first — and the cross-check still passes, because a v2 bundle carries nine
      entries and nine embedded documents. The pinned test is the bundle case, which the cross-check
      structurally cannot see.
- [ ] **[audited] Folder reference integrity**: every non-null `TaskEntry.folderId` names a folder in
      its **own project's** `folders[]`. Blocks, naming the task and the missing folder id. It is not
      repaired by silently nulling the reference: `assertFolder` treats "the folder exists in this
      project" as an invariant on every create, move and reorder, and import is the only write path
      that can violate it.
- [ ] **[audited] Collection bounds**, because import does not go through the services and therefore
      never reaches `assertWithin`. Per project: `tasksPerProject`, `foldersPerProject`,
      `shareLinksPerProject`, and each task document's `tabs.length` against `tabsPerTask`; every name
      against `nameLength`. Across the session: `projectsPerProduct` against **what is on disk plus
      what this confirm will add**, evaluated inside the same `QueueLock` the confirm takes — checking
      the drop set alone lets two confirms of 300 each land 600. These are not merely bounds: the same
      numbers are compiled into the response schemas, so an over-cap project is not "slightly over",
      it is **unreadable**, and through `ProjectList` it takes the index with it. Exceeding
      `projectsPerProduct` has a different and permanent consequence — `ProjectService.create`
      compares against it, so an over-cap import silently disables project creation for the product.
      This check runs on the **converted v2 shape**, so the legacy path is covered too.
      **[amended 2026-09-12, after Task 3] The collection *counts* run there; the name bound does
      not.** Task 3's converters put every project, task, folder and tab name through `cleanName`,
      which caps at `LIMITS.nameLength`, so on the converted shape that half of the check cannot
      fire for four of the five name kinds — a check that looks alive and is dead. Run the name
      bound on the **drop set** instead, the raw manifest and raw task documents, where a malformed
      v2 name still exists; the legacy path then needs no name bound at all, conversion guaranteeing
      it. See "What Task 3 settled" above.
      **[amended 2026-09-12, during Task 4] The name bound goes entirely. The collection *counts*
      run exactly as specified above.** The amendment before this one was right that a malformed v2
      name still exists in the raw drop and wrong that it is a problem there: it is either repaired
      or already refused, in every one of the five cases. `cleanName` caps the project, folder, task
      and tab names in *both* converters (`legacy.ts:64,77,100,159` and `:211,214,217`); the
      share-link name the v2 converter deliberately leaves alone is bounded by
      `ShareLink.name` = `EntityName.or(z.literal(''))`, so an over-long one fails the
      schema-conformance check above and blocks the project with a reason. A bound of its own can
      therefore produce no outcome those do not already produce — except a **false refusal**, and it
      did produce one: measured on the raw value it blocked `" " + 80 characters + " "`, which
      `EntityName` accepts because it trims first, and which `cleanName` writes as a clean
      80-character name. Measuring the trimmed value instead does not fix that, it only moves it:
      `cleanName` *truncates* at `nameLength` rather than rejecting, so a 200-character name is
      repaired too and refusing it is equally wrong. Verified against zod 4.6.1 and `cleanName`
      before removal, and pinned by two tests — one that a padded name imports clean, one that an
      over-long name draws exactly one reason, the schema's.
- [ ] **Scope containment**: every share link's scope resolves inside the project it arrived with. A
      test pins a link whose `scope.taskId` names a task in a **different project of the same
      bundle** — plausible, and the case a naive "does this task id exist anywhere" check passes.
- [ ] **Document validation**: every document goes through `assertSafeDocument`, the failure naming
      project, task and tab. A test pins a `javascript:` href refused at preview — not at write time,
      when half the bundle has landed.

### Task 5: reminting for `import as new`

**Files:** create `packages/microtask-domain/src/import/remint.ts` + test; modify
`packages/microtask-domain/src/index.ts`.

ADR 0019 lists what reminting rewrites. Each gets a test that fails when that one is missed.

- [ ] The **project id** is new, and every reference to the old one moves with it.
- [ ] Every **share token** is new. Pinned by asserting no token in the output appears in the input.
- [ ] **Manifest task ids** are new **and the task filenames follow**. A test asserts the written file
      name matches the manifest entry — the failure mode is a manifest naming tasks whose files are
      still on the old ids, which reads as a successful import of empty tasks.
- [ ] **Share-link `scope.taskId`** is rewritten to the new task id. A test pins a task-scoped link
      surviving a remint and still resolving inside its project.
- [ ] **[audited] `createdBy` lineage is rewritten, and the reason is intra-project.** The draft
      claimed a cross-project revocation cascade; that is structurally impossible —
      `ShareLinkService.revoke` takes one `ProjectRef`, reads that one manifest, and walks `createdBy`
      only over that manifest's own links, which is what ADR 0010 means by "one file read". So the
      test the draft named could not fail. The real failure is the one ADR 0010 states: inside the
      **new** project the child names a token that does not exist, so its parent's revocation no
      longer reaches it and a delegated link survives a revoke that should have cut it. The test
      builds a parent/child pair, remints, revokes the **new** project's parent, and asserts the
      child is gone.
- [ ] A `createdBy` naming a token **absent from the bundle** becomes `null`, not a dangling
      reference.
- [ ] Reminting is deterministic under an injected id generator, so every assertion above is exact.
- [ ] **`replace` does the opposite and is tested as such**: tokens preserved, project identity
      preserved, tasks absent from the bundle removed (it is a replace, not a merge), and existing
      share links the bundle does not mention **kept**. Four assertions, four tests.

---

## Group C — the API

### Task 6: export

**Files:** create `apps/api/src/routes/microtask/export/{routes,handlers}.ts`,
`packages/microtask-domain/src/export/bundle.ts` + tests; modify
`packages/microtask-domain/src/index.ts`, `apps/api/src/routes/authorize-targets.test.ts`,
`apps/api/src/surface.test.ts`, `apps/api/src/routes/response-shapes.test.ts`,
`apps/api/src/routes/microtask/index.ts`, `apps/api/src/routes/microtask/project-scoped.ts`.

- [ ] `GET /v1/microtask/export` and `GET /v1/microtask/projects/:projectId/export`. The workspace
      route is admin-only by `workspace:list-projects`; the project route gates
      `authorize(c, 'export:run', { kind: 'project', projectId })` — a **literal** action and target,
      so the existing literal-agreement test confirms it against `ACTION_DECISIONS`.
- [ ] **[audited] Three committed tests fail the moment this route exists, and fixing them is part of
      this task, not a surprise at the gate.** `authorize-targets.test.ts` asserts the only ungated
      actions are exactly `export:run`, `workspace:import`, `workspace:search`; remove `export:run`
      from that list and from the test's name. Do **not** weaken or delete the `toEqual` — it is the
      only thing binding the `ACTION_DECISIONS` target column to the targets handlers really gate on.
      Add the new `export` group to `surface.test.ts`. **Corrected 2026-09-12: the plan said two, and
      there is a third** — `routes/response-shapes.test.ts` walks every operation the document
      declares and asserts `SAMPLES` has an entry for each ("a new route cannot opt out of the
      walk"), then asserts `walked.length === Object.keys(SAMPLES).length`. Both export operations
      need a `SAMPLES` entry, and that walk is not a formality: it also enforces that the 200 body
      comes from a **named component resolvable in `@repo/contracts`**, which is what stops this
      route declaring an inline bundle shape beside the handler. `ExportBundle` already carries
      `.meta({ id })` and is exported from that package's index, so it satisfies both — do not
      declare a second inline schema for the stripped variant.
- [ ] `?tokens=strip` omits share links **entirely** — not blanked tokens, not empty strings. A test
      serialises a stripped bundle and asserts no token substring appears anywhere in the JSON.
- [ ] **Stripping is the default.** A request with no `tokens` parameter is a stripped bundle. Getting
      this backwards turns every manual download into a credential dump and nothing in the response
      would look wrong.
- [ ] **[audited] One positive assertion, by value** — without it the single mutation "always strip"
      turns every criterion in this task green while destroying the only migration path the plan
      exists for, and the operator finds out after cutover. An admin `GET …?tokens=preserve` over a
      seeded data root returns, for each link, its exact `token`, `role`, `scope` and `name`,
      asserted against the fixture's values. Every negative assertion above anchors to the **same**
      fixture, so "preserved" and "stripped" are distinguishable by more than a count.
- [ ] `tokens=preserve` requires the admin principal, and a non-admin asking for it is a **403 and
      not a silently stripped 200** — answering a different question than was asked, with a success
      status, is how a preserved-looking bundle gets imported as new and quietly drops every link.
      A test asserts a **project-scoped `manage` holder cannot preserve tokens**.
      **[audited] Corrected 2026-09-12 — keep the behaviour, do not keep the old reason.** The plan
      said this stops a holder harvesting "the credentials of links it does not hold". That is
      **false**, and a worker who checks it will be tempted to relax the gate on the strength of it.
      Measured against the committed fixture: a `manage` holder scoped to project one reads
      `GET /v1/microtask/projects/:id` and receives **all four** of that project's links, tokens
      included — the task-scoped one too, since `visibleLinks` clears each link against its own
      scope and a project scope contains its tasks. `share:read` is `{minimum: manage, target:
      project}`, so that is the policy working as designed, not a leak.
      So the admin check on `preserve` discloses nothing on either route: the workspace route is
      already admin-only, and on the project route the caller can already read the exact tokens it
      is being refused. What it actually buys is that **one condition, in one place, decides whether
      a response may carry live credentials** — instead of that following implicitly from two route
      gates plus a per-link view filter. It is insurance against a later loosening: drop
      `export:run`'s minimum to `write`, or add a second non-admin export address, and the
      token-bearing variant does not come along silently. Write it down that way; a TSDoc claiming a
      present-day confidentiality win is a claim this fixture refutes.
- [ ] **[audited] A task-scoped `manage` holder is refused with a 403**, matching `share:read`,
      `share:revoke` and `share:update`. `export:run` is decided against a project target and a task
      scope reaches only `project:read`, so a filtered bundle is not an option the policy offers —
      see the box in "What is already built". `capabilities('manage', {kind:'task'})['export:run']`
      is false, so the UI draws no export control from it.
- [ ] `bundleId` is a fresh ULID per export, from the injected generator.
- [ ] A round-trip test: export a workspace with `tokens=preserve`, import it into an empty data
      root, export again, and assert the two bundles are equal apart from `bundleId` and
      `exportedAt`. **[audited]** This test only means something alongside the positive assertion
      above — with links dropped from both sides, two token-free bundles are still equal.
      **Added 2026-09-12, two things this criterion does not say and a worker cannot infer:**
      **(a) There is no import route yet** — Task 9 builds it. The import half is performed at the
      domain level: `convertBundledProject` per `projects[]` entry, then `saveTask` per document
      (`saveManifest` for a project carrying none) into a **fresh** `MemoryProjectStore`. Do not
      reach for `replaceProject`; nothing is being replaced, and its `current` parameter has no
      value here. Note `convertBundledProject` recomputes all four cache fields from the documents
      (ADR 0007) and repairs blank names, so this leg is only an identity on a bundle whose cache
      already agrees with its documents — which the `taskEntry`/`taskDocument` fixture pair
      guarantees by construction, and which is *itself* worth one assertion rather than an
      assumption.
      **(b) Give each project in the round-trip fixture a distinct `updatedAt`.** Both stores end
      `listManifests` with `sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))` and **no
      tie-break**, and every shared fixture carries the single `STAMP` — so with the shared fixture
      every project ties, and the order of `projects[]` falls out of `Array.prototype.sort`'s
      stability over the store's own insertion order. The test would then pass by accident and
      `bundleId`/`exportedAt` would not be the only things that could differ. Distinct stamps make
      the listing order total, which is what lets the assertion stay whole-object equality.
      Sorting `projects[]` by id before comparing is the **wrong** repair: it silently drops order
      from an assertion whose whole job is to be exhaustive.

### Task 7: staging and upload

**Files:** create `apps/api/src/routes/microtask/import/{routes,handlers,staging}.ts` + tests;
modify `packages/microtask-domain/src/storage/paths.ts`,
`packages/microtask-domain/src/index.ts`, `apps/api/src/routes/authorize-targets.test.ts`,
`apps/api/src/surface.test.ts`, `packages/contracts/src/capabilities.ts`.
**Depends on:** ADR 0044 and ADR 0045 being committed.

- [ ] **[audited] Staging paths get builders in `storage/paths.ts`**, beside `projectDir` and
      `taskFile` — that file already wraps `contained()` at every builder and already rejects
      non-ULID segments before resolving, which is also exactly what this task's session-id criterion
      needs. `contained()` itself is package-private and must not be exported raw: handing `apps/api`
      the primitive without the ULID guard means restating the validation at the call site. Extend
      the domain's `index.ts` to export the new builders.
- [ ] `POST /v1/microtask/import/sessions` opens a session; `POST …/sessions/:id/files` takes one
      file with its normalised path. Both gate
      `authorize(c, 'workspace:import', { kind: 'workspace' })`. A test asserts a `manage` link
      principal gets 403 on every route in this subtree — import can create projects, which is why it
      sits above `manage` (ADR 0017).
- [ ] **[audited]** Drop `workspace:import` from the no-route list in `authorize-targets.test.ts`,
      leaving `workspace:search` alone, and rewrite the paragraph in
      `packages/contracts/src/capabilities.ts` that says `export:run` and `workspace:import` "have no
      route yet, so nothing has confirmed the target against a gate". Both now have routes and both
      targets are confirmed by the scan. Nothing in the four gates catches a stale TSDoc, so this is
      a named deliverable rather than a side effect.
- [ ] Both halves of the Decision 2 staging guard live here.
- [ ] A path arriving from the client is re-normalised and re-checked server-side, and a traversal
      attempt is refused with the file rejected rather than the session aborted.
- [ ] The session id is a ULID; a non-ULID id is a 422 before any path is resolved.

### Task 8: zip expansion

**Files:** create `apps/api/src/routes/microtask/import/zip.ts` + test, with fixture archives;
modify `apps/api/package.json`.

ADR 0020 names four hardening rules and the design names five. All are enforced **before anything is
written**, and each has a fixture.

- [ ] Entry-name rejection: `..`, absolute, drive letter. Symlink entries refused outright, never
      followed. An entry-count cap.
- [ ] **[audited] Each cap is independently falsifiable.** Both caps are exported named constants, so
      fixtures can be defined relative to them. **Fixture A pins the ratio cap alone**: total
      uncompressed size strictly *below* the size cap, per-entry ratio above the ratio cap, entry
      count below its cap — and the refusal's problem document names **which** cap fired and the
      measured ratio. **Fixture B pins the size cap alone**, the mirror image. A conventional bomb
      trips both, so a test asserting only "rejected" stays green after the ratio check is deleted:
      the size cap fires instead and the assertion cannot tell them apart.
- [ ] Caps are enforced **while expanding**, not after. A test asserts the bomb fixture never writes
      its full expansion to staging — measure the staging directory, do not just assert the error.
- [ ] Expansion lands in staging and then goes through **exactly the same** grouping and sniffing as a
      dropped folder. A test asserts a zip of a directory and the same directory dropped produce
      identical previews. Two importers that drift is the failure ADR 0020 is avoiding.
- [ ] **[audited] The dependency claim needs a test that can fail.** The deploy tests read the
      Dockerfile as text; they install nothing and build nothing, so they are green whether the zip
      reader is a dependency, a devDependency, or absent — and `pnpm --filter=api deploy --prod` drops
      dev deps, so a misplaced entry ships a container that throws on first import **in production,
      after cutover**. Declare it in `apps/api/package.json` under `dependencies` at an exact version
      inline, matching how `hono` and `@hono/zod-openapi` are pinned there today — **not** through the
      workspace catalog, which carries deps shared across packages. A test reads that manifest and
      asserts the package is in `dependencies` and absent from `devDependencies`.

### Task 9: preview, confirm, and the write

**Files:** create `apps/api/src/routes/microtask/import/apply.ts` + tests; modify
`packages/kernel/src/ports/file-system.ts`, `packages/store/src/node-file-system.ts`,
`packages/microtask-domain/src/storage/{paths,fs-project-store}.ts`, and the `MemoryFileSystem` fake
used by the store's ordering tests.

- [ ] `GET …/sessions/:id/preview` returns the plan from Group B. It reads staging and writes nothing.
- [ ] `POST …/sessions/:id/confirm` applies it under the conflict choices.
- [ ] **[audited] A confirmed project is built whole, then moved into place.** ADR 0006 states a rule
      for exactly this case — *"A bulk import writes many files at once, so it stages into a temporary
      directory and moves the project directory into place as its final step"* — which is **not** the
      per-write "task file then manifest" rule the draft cited. Building a live project through
      `saveTask` in a loop republishes the manifest on every call, so the first task file publishes a
      manifest naming all N tasks; for a `replace`, where the tokens are preserved and therefore
      already live, every not-yet-written task 404s for the length of the import, and a failure on
      task 7 of 20 leaves entries pointing at files that are not there. A crash-ordering test kills
      between the last task file and the move and asserts `listManifests` shows the project wholly
      absent or wholly present.
- [ ] **[audited] The primitive that move needs does not exist and is part of this task.**
      `FileSystem` has `readText`, `writeTextAtomic`, `remove`, `removeDir`, `listDirs` — no rename
      and no move. Add it to the port, to `NodeFileSystem`, and to the in-memory fake. Its contract
      must state that the destination is absent when it is called: a directory rename onto a
      non-empty destination fails on both platforms, and ADR 0006 records `MoveFileEx(REPLACE_EXISTING)`
      measuring 4/20 successes under concurrency on win32. Every call stays inside the lock.
- [ ] **[audited] `QueueLock` is not reentrant, and this is the criterion most likely to be violated.**
      Confirm takes `lock.run` **exactly once** for the whole apply and inside it calls **only the
      `store` and `tokens` ports — never a `*Service`**. Every mutating service method takes the same
      lock, and `QueueLock` is a single promise chain: an inner `run` chains onto a promise that only
      settles when the outer work returns, and the outer work is awaiting the inner one. The result is
      not a slow import — `#chain` is left pointing at a promise that never settles, so **every
      subsequent write anywhere in the process hangs forever** while reads and `/healthz` keep
      answering 200. Two specific traps: "tasks absent from the bundle removed" must not use
      `TaskService.remove`, and "the index reflects the imported tokens" must not use
      `ShareLinkService.create`. Use `store.deleteTask` and `TokenIndex.add`, neither of which takes
      the lock — which also independently satisfies the no-stamping requirement, since service writes
      stamp.
- [ ] **[audited] Import does not stamp `updatedAt`, asserted by value rather than by ordinal.** The
      draft's "assert it does not sort first" is vacuous three ways: with one project on disk it sorts
      first regardless; the repo's fixtures and the harness clock share one timestamp, so "stamp with
      `now()`" produces a string identical to the preserved one; and `sort` is stable, so the tie
      keeps the order either way. Instead: build the app with a **ticking** clock and a bundle whose
      stamps all differ from the fixture stamp, then assert **exact string equality** against the
      bundle for every timestamp import writes — the manifest's `createdAt` and `updatedAt`, every
      `TaskEntry.updatedAt`, and each task document's `createdAt` and `updatedAt`.
- [ ] **[audited] The lock test asserts an invariant, not an ordering.** Two operations launched
      back-to-back in a single-threaded test usually observe the same order with or without the lock,
      so "asserts one ordering" stays green when `lock.run` is dropped. Byte-level corruption is not
      the hazard either — `writeTextAtomic` renames a temp file. The hazard is a **lost update**:
      both sides read-modify-write the same manifest (`TabService.writeDocument` reloads it to refresh
      the progress cache; `replace` must merge in the share links the bundle does not mention). Drive
      it with a store double that interleaves a concurrent document write inside the apply's
      read-modify-write window, and assert the concurrent edit survives.
- [ ] Per-project outcomes are reported; a failure on one project does not silently abort the rest,
      and the response says which landed and which did not. Cross-project atomicity is not claimed.
- [ ] A confirmed session is swept.
- [ ] The OpenAPI document regenerates and `check-exports` passes; every new route appears in it with
      its problem responses, like every other route.

---

## Group D — the surfaces

### Task 10: the shared panel

**Files:** create `packages/ui/src/transfer/**`; modify `packages/ui/package.json`.

- [ ] **[audited] Do not touch `globals.css`.** Its existing `@source "../**/*.{ts,tsx}"` already
      covers `src/transfer`, exactly as it covers `src/shell` today, and an existing test asserts the
      scan roots are **exactly** two — so adding a third line fails the gate. Verify the coverage on
      the **built CSS**; do not add a scan root.
- [ ] **[audited] `packages/ui/package.json` gains a `./transfer/*` exports entry.** The package
      publishes a closed map with three subtrees and nothing else resolves, so without this the app
      cannot import the panel at all. The map splits by extension, and this directory mixes `.ts` and
      `.tsx`, so it needs the pattern pair that split implies. A test imports the panel by the package
      name the app will use, which fails if the entry is missing — `check-exports` does not cover it.
- [ ] The panel is product-agnostic: it takes harvested files and a preview and renders them. It knows
      nothing about microtask's entities beyond the preview's wire shape.
- [ ] The preview table shows **every share link with name, role and scope**, not a count (§7.3) — and
      no token, which the wire shape does not carry.
- [ ] **[audited] Choosing `import as new` on a project that already exists renders the sentence §7.4
      and ADR 0019 both give verbatim**: *"N share links will get new URLs; the existing project's
      links keep working."* It is the single most consequential thing an admin needs before
      confirming, and the collision flag from Task 1 is what makes it renderable. A test pins it.
- [ ] The export dialog says an export contains live tokens in plaintext, and preserving is opt-in
      (ADR 0017). A test asserts the warning renders when preserve is selected.
- [ ] "Skipped" and "error" are visually distinct outcomes, because silent skipping is what ADR 0018
      was written about.
- [ ] `.tsx` files stay under 80 lines.

### Task 11: harvesting, and the two silent failures

**Files:** create `packages/ui/src/transfer/harvest.ts` + test.

ADR 0018 names two browser behaviours that fail silently. Both get a regression test, and **both tests
need their double specified here** — under happy-dom neither API exists, so the double *is* the thing
under test and an unspecified double makes the test vacuous.

- [ ] **[audited] `readEntries()` batches at 100 in Chromium.** It must be pumped on **one** reader
      per directory until it returns an empty array; a second reader restarts it. The double's
      behaviour is specified, not left to the implementer: `createReader()` returns an object whose
      `readEntries()` yields **at most 100 entries per call**, yields the empty array only once that
      reader is exhausted, and **restarts from entry 0 for any newly created reader**. With 150+
      files the test asserts all are harvested. Against a double that returns all 150 at once, the
      naive one-call implementation passes and the test is worthless.
- [ ] **`DataTransfer` must be harvested synchronously in the drop handler.** After dispatch ends,
      `webkitGetAsEntry()` returns `null` and `.files` is empty, so **no `await` may happen before the
      items are read**. The test awaits a microtask before harvesting and asserts the harvest is
      empty — proving the test can see the bug — then asserts the real handler harvests everything.
- [ ] **[amended 2026-09-12]** A directory **pick** uses `webkitRelativePath`; a **drop** uses
      `fullPath`. Both go through one helper here whose whole job is **decoding** them into the one
      encoding the server expects — `fullPath` is drag-root-relative and carries a single leading `/`
      by spec, so passing it through unchanged makes the server refuse **every drop**, since
      `normaliseImportPath` rejects an absolute path. A test feeds both shapes and asserts identical
      output. **Do not re-implement the rejection rules** (`..`, drive letter, backslash, trailing
      separator): they are the server's authority and a second copy that disagrees is
      indistinguishable from either copy working. See the amendment on ADR 0018 for why the function
      itself cannot be shared.
- [ ] Loose files with no path classify individually, as before.
- [ ] `harvest.ts` is framework-free and separately testable. It is not a hook.

### Task 12: wiring the admin surface

**Files:** create `apps/microtask/app/(admin)/transfer/page.tsx`,
`apps/microtask/app/api/export/route.ts`, `apps/microtask/app/api/import/upload/route.ts`,
`apps/microtask/components/transfer/**`; modify `packages/api-client/src/surface.ts` and add
`packages/api-client/src/operations/transfer.ts`.

- [ ] **[audited] The export download needs a Next route handler, and the draft had none** — so the
      feature would have shipped with an export nobody could download. The API is internal-only: no
      published port, no domain, unreachable from any browser (ADR 0041). And an action cannot return
      a `Content-Disposition` response, which is why ADR 0015 names `GET /api/export/…` as one of
      exactly three route handlers this app must have. `GET /api/export` therefore **proxies**: it
      establishes its own authority (`proxy.ts` passes `/api/*` through ungated), reads `mt_admin`,
      and answers 401 when absent. A test asserts that a request with no admin cookie, and one
      carrying a link principal's cookie, both get 401/403 and no bytes.
- [ ] It forwards `?tokens=` to the API unchanged, so the API stays the single authority on stripping,
      and a test asserts the forwarded query string — the app must not re-decide the default.
- [ ] It sets `Content-Disposition: attachment` with a stated filename rule and **streams** the
      upstream body rather than buffering it. A test asserts the header and that no
      `await response.json()` sits in the path.
- [ ] Uploads go through `app/api/import/upload/route.ts`, not a Server Action — actions cap at 1 MB
      and a workspace bundle exceeds that immediately (ADR 0015). The existing `Transport` cannot
      serve either handler: it exposes only `json` and `empty`, JSON-stringifies every body, and parses
      every response through a contract schema. Pin the reason in the TSDoc.
- [ ] **[audited] Bounded client concurrency, tested so that "no bound at all" fails.** The bound is a
      named constant. The fake upload returns a promise the test **releases explicitly** — a fake that
      resolves on its own makes the observed in-flight count 1 for every implementation, including one
      that fires all 200 at once. With 200 files the test asserts the in-flight count **reaches** the
      bound (equality, not `≤`) before anything is released, never exceeds it, and that all 200
      complete. A bound of 1 must fail this too.
- [ ] Per-file errors are reported per file. One rejected file does not fail the session.
- [ ] The page is admin-only and unreachable from `/s/*`. A test asserts a link principal cannot
      render it.
- [ ] A 413 renders the cap from the problem document's `maxBytes` extension, naming the limit rather
      than saying "too large".
- [ ] `apps/microtask` still has exactly **one** `process.env` site.

---

## Group E — cutover

### Task 13: the legacy addresses this phase finally makes answerable

The parity audit leaves **Route R3** open with an explicit reason: *"mapping a legacy `?tab=` needs
the importer's tab-to-task id rule, which does not exist yet … it cannot be taken before the importer
exists"*. Task 3 creates that rule, so this is the task that closes it.

**Files:** modify `apps/microtask/proxy.ts` or add the redirect routes; update
`docs/parity/legacy-microtask.md`.

- [ ] `/admin/projects/:projectId` redirects to `/p/:projectId`. Safe only because §7.6 preserves
      project ids — a test asserts the id is preserved by the importer **and** that the redirect uses
      it, so the two cannot drift apart silently.
- [ ] A legacy `?tab=<tabId>` maps to `/p/:projectId/t/<tabId>`, because Task 3 makes an old tab id
      the new task id. A test pins the mapping against a converted legacy project rather than a
      hand-written id, so it fails if Task 3's id rule ever changes.
- [ ] A `?tab=` naming a tab the project does not have falls back to the project page rather than
      404ing. An address in a client's browser history must not become a dead end.
- [ ] Record the decision — the parity audit says it needs one taken alongside ADR 0022.
- [ ] Feature 67 and Route R3 move from GAP to reproduced in the parity audit, with this plan cited.

### Task 14: the real data

Only after Tasks 1–13 are green. This is the task the whole plan exists for.

- [ ] The operator takes a backup first. Stated in the report, not assumed.
- [ ] **Re-run the Tiptap round-trip against data containing links.** The existing round-trip was
      measured on demo data with **zero** `href` values, so a v2 `link` mark gaining `"title": null`
      on mount is unproven. Cheap to run, expensive to miss.
- [ ] **`SAFE_HREF_SCHEMES` is load-bearing from the first import.** The demo data exercised no href
      at all; the real data will.
- [ ] Import the real volume through the UI. Read the preview: project and task counts, the
      manifest/file cross-check by id, and every share link with its role and scope.
- [ ] Assert against the live app that each pre-existing share URL still opens the same content with
      the same permission. A legacy link with no `permission` must still be write-capable, and a
      legacy link carrying only a `label` must still show its name.
- [ ] Coolify auto-deploy is disabled before any merge to `main`, and the compose service name is
      settled. Coolify keys domains by service name; merging with the service still named `microtask`
      would point the production FQDN at an empty database.

---

## Final audit

- [ ] Four gates cold: `Cached: 0`.
- [ ] `node scripts/check-exports.mjs` exits 0.
- [ ] The export round-trip passes from a **populated** data root, with the positive token assertion
      alongside it.
- [ ] No share token appears in any stripped export, or anywhere in a preview response, asserted on
      the serialised body.
- [ ] A malformed imported manifest cannot reach disk — pinned by the schema-conformance check, whose
      absence is a boot failure rather than a render failure.
- [ ] Every ADR this plan required (0044, 0045) is committed, and the record of the R3 decision with
      them.
- [ ] The report names every deliberate difference from the design with its reason.
