# Microtask app implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to execute
> this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/legacy` with a Next 16 App Router app over `apps/api`, sharing `packages/ui`
with the future Macroplan app, at or above the parity recorded in `docs/parity/legacy-microtask.md`.

**Architecture:** Server Components read through `@repo/api-client`; Server Actions write. The browser
never holds a credential — an encrypted httpOnly cookie names a principal and the Next server
exchanges it for `x-api-key` + `Authorization: Bearer` on every call (ADR 0012, ADR 0032). The Tiptap
editor is the one heavy client island; everything else renders on the server.

**Tech stack:** Next 16.3.4, React 19.3.0, Tailwind 4.3.3, shadcn/ui (22 vendored primitives),
Tiptap 3.31.3, vitest 5 + happy-dom + @testing-library/react.

---

## Why this plan does not dictate code

The previous plan in this series dictated implementation line by line. Executing it found that the
dictated code contained a live XSS hole whose own test list was entirely clean, a byte cap measured in
UTF-16 units, a name truncation that split surrogate pairs, and a parity check that walked the wrong
object and returned `{done:0,total:0}` for every input — while passing both review gates.

So this plan fixes **interfaces, decisions, and acceptance criteria**, and names the specific
behaviour each test must pin. It does not hand over function bodies. Where a value is load-bearing it
is stated exactly; where a body is mechanical the implementer writes it and the tests judge it.

Every task ends with `npx turbo run build typecheck lint test --force` green and `Cached: 0`. Without
`--force`, turbo restores from cache and reports `FULL TURBO`, so a clean run proves nothing.

---

## Binding constraints

| Rule | Source |
| --- | --- |
| An app imports `@repo/contracts`, `@repo/api-client`, `@repo/ui` — never `@repo/store`, `@repo/kernel` or either `*-domain` (the domain barrel reaches `node:path` and `node:crypto`) | ADR 0001, 0027 |
| `.tsx` files cap at 80 lines, functions at 50, complexity at 10, params at 4 | ADR 0027 |
| TSDoc only. No other comments, no file-level `eslint-disable` | ADR 0027 |
| Vendored `src/components/**` is exempt from exactly `max-lines` and `jsdoc/require-jsdoc`, via the shared factory | ADR 0031 |
| `packages/ui` has no build step and no barrel; per-file subpath exports | ADR 0025 |
| One stylesheet, in the package. A new scan root needs an `@source` line or it fails silently | ADR 0025 |
| `'use client'` on line 1 of each file that needs it. Compound pieces are named exports, never static properties | ADR 0025 |
| Only `lib/env.ts` reads `process.env` (`n/no-process-env` is off nowhere else) | ADR 0012 |
| Class names are complete strings, never interpolated — the scanner reads source as text | ADR 0025 |

---

## File structure

```
packages/ui/src/
  components/**          22 vendored primitives (exists)
  shell/                 shared, hand-written, full ADR 0027 rules
    app-bar.tsx          brand, slot for actions
    page.tsx             width + padding container
    empty-state.tsx      centred muted card
    progress-bar.tsx     the gold/green bar, animates from 0
    relative-time.tsx    just now / Nm / Nh / Nd / date
    confirm-dialog.tsx   destructive confirm, nothing autofocused
    prompt-dialog.tsx    single-field prompt, input focused AND selected
  lib/
    utils.ts             cn (exists)
    time.ts              pure relativeTime(from, now)

apps/microtask/
  lib/
    env.ts               the only process.env reader
    crypto.ts            AES-256-GCM seal/open
    session.ts           mt_admin + mt_link read/write/clear
    api.ts               apiForSession(), createLinkClient(), admin client
    problem.ts           ApiError -> what the UI shows
    reorder.ts           relative move -> permutation for tabs.reorder
  app/
    layout.tsx
    login/page.tsx
    (admin)/
      page.tsx                                projects index
      p/[projectId]/page.tsx                  folders + tasks
      p/[projectId]/t/[taskId]/page.tsx       tabs + editor
    s/[token]/page.tsx                        link landing
    s/[token]/t/[taskId]/page.tsx             project-scoped link task
    api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/route.ts
  components/            app-only, product-specific
    editor/              Tiptap island
    share-manager/
    task-tree/
  actions/               Server Actions, one file per entity
```

---

## Group A — the shared vocabulary (packages, no UI)

### Task 1: wire facts into `@repo/contracts`

**Files:** `packages/contracts/src/{limits,document-facts,problem}.ts`, `src/index.ts`;
`packages/microtask-domain/src/limits.ts` and its document modules; `apps/api/src/http/problem.ts`.

Move, do not copy: `LIMITS`, `MAX_DOCUMENT_BYTES`, `MAX_DOCUMENT_DEPTH`, `SAFE_HREF_SCHEMES`,
`emptyDocument()`, `countTasks()`. `@repo/microtask-domain` imports them from contracts so exactly one
definition exists. Add `ProblemCode` as a closed set, plus `Problem` and `ValidationProblem` schemas;
`apps/api/src/http/problem.ts` imports the code set instead of defining `MEANINGS` privately.

- [ ] The whole existing domain suite still passes unchanged — that is the evidence the move was a
      move and not a rewrite.
- [ ] A test asserts `ProblemCode` contains every code the API can actually emit, by enumerating the
      API's own sources: `MEANINGS` plus the three per-cause 401s (`unknown_service`, `no_principal`,
      `unknown_principal`). A code the API emits and the contract omits is the failure this pins.
- [ ] `countTasks` is tested against a real production document from `data/projects/` and against
      the `underline` mark Tiptap 3 adds, which v2 had no concept of.

### Task 2: `capabilities(role, scope)` and the test that keeps it honest

**Files:** `packages/contracts/src/capabilities.ts`; `packages/contracts/package.json` (devDependency
on `@repo/kernel`); `packages/contracts/src/capabilities.test.ts`.

A pure function returning the boolean set the UI renders from. It exists twice — here and as
`can()` in the kernel — and the only thing that makes that acceptable is the agreement test.

- [ ] For **every** `role × scope.kind × action` triple, `capabilities()` agrees with `can()`. Not a
      sample: the full cross product, enumerated from the kernel's own exported action list, so a new
      action added to the kernel fails this test until the projection accounts for it.
- [ ] The specific trap is pinned by name: a **task-scoped `manage`** holder can `share:create` but
      can neither `share:read` nor `share:revoke`, because those gate on a `{kind:'project'}` target
      and `withinTaskScope` refuses it. A UI rendering from `role` alone shows a share manager that
      403s on open.
- [ ] `@repo/kernel` appears only in `devDependencies` — a test asserts it is absent from
      `dependencies`, because a runtime edge would put `node:crypto` in the browser bundle.

### Task 3: `TaskEntry` and `ProjectList` change shape

**Files:** `packages/contracts/src/{task,views}.ts`; `packages/microtask-domain/src/views/*`,
`services/task-mapper.ts`; `apps/api/src/routes/microtask/*`; `apps/api/openapi.json`.

`TaskEntry` gains `updatedAt`, `tabCount`, `tabNames` (first 8). `ProjectList` items drop
`shareLinks` and gain `shareLinkCount`.

- [ ] A test proves `projects.list()` response JSON contains **no** share token, by serialising a
      fixture with live links and asserting the token strings are absent from the payload. This is
      the security property; assert it on the bytes, not on the type.
- [ ] `tabNames` caps at 8 and `tabCount` reports the true total, so a 12-tab task yields
      `{tabCount: 12, tabNames: [...8]}`. Legacy silently dropped tabs 9+ with no indicator; the
      count is what lets the new UI say "+4 more".
- [ ] `projects.read()` still carries `shareLinks` for a caller that clears `share:read`, and still
      omits the key entirely for one that does not — `shareLinks === undefined` is the only
      admin-block discriminator the UI has.

### Task 4: `share:update`, and the route behind rename

**Files:** `packages/kernel/src/access/{action,policy}.ts`; `packages/microtask-domain/src/services/
share-link-service.ts`; `apps/api/src/routes/microtask/share-links/*`;
`packages/api-client/src/operations/share-links.ts`; `apps/api/openapi.json`.

`PATCH /v1/microtask/projects/{projectId}/share-links/{token}` taking `{name?, role?}`, gated
`share:update` over `{kind:'project'}`.

- [ ] The token does not change. A test asserts the returned token equals the requested one — the
      whole reason this route exists instead of revoke-and-recreate is that a new token breaks the
      client's bookmark.
- [ ] Downgrading `write` → `view` takes effect on the **next** request, because the resolver re-reads
      role and scope from the manifest every time. Pin it: mint a link, PATCH the role, and assert
      the same token is refused the write it previously cleared.
- [ ] An empty `name` is accepted (production data already contains one, and legacy rendered it as
      "Unnamed link"), but a **new** link still requires a name.
- [ ] Every existing policy test passes, and one new test asserts a task-scoped `manage` principal is
      refused `share:update`, matching `share:read` and `share:revoke`.

### Task 5: `@repo/api-client` stops discarding what the UI needs

**Files:** `packages/api-client/src/{api-error,transport,paths,index}.ts`.

`errorFrom` preserves `in`, `errors[]` and `maxBytes`. `paths.ts` joins the barrel. `Call` gains an
optional `signal`, threaded through `initFor`.

- [ ] A 422 from the real API round-trips to an `ApiError` carrying `in: 'json'` and the field path,
      so a form can put the message on the field that caused it.
- [ ] A 413 carries the `maxBytes` extension, so the UI can name the cap it hit instead of saying
      "too large".
- [ ] An aborted `signal` rejects with an abort error and issues no request — pinned with a fetch
      double that records calls, because a debounced search that cannot cancel is the reason this
      exists.

---

## Group B — the shared shell (`packages/ui`)

### Task 6: `packages/ui/src/shell/**`

Hand-written, shared with Macroplan, under the full ADR 0027 rule set: 80-line files, TSDoc on every
export, no other comments.

Seven components (see File structure). `relativeTime` is a **pure function** in `src/lib/time.ts`
taking `(from, now)` — never reading the clock itself.

- [x] `relativeTime` is tested at every boundary. **Corrected after the fact:** this plan first wrote
      the thresholds as `<1min` / `<60min` / `<24h` / `<30d` and called them "exactly legacy's",
      which is truncation. `apps/legacy/public/js/util.js:62-72` uses `Math.round` at every step, so
      each boundary sits at the half unit — 30s reads "1m ago", 59.5min reads "1h ago", 23.5h reads
      "1d ago", 29.5d reads as a date. The implementer built legacy's behaviour and said so; the
      plan was wrong, not the code. A falsy input yields `''`, also matching legacy.
- [ ] `progress-bar` renders "No tasks yet" at `total === 0`, switches to the green gradient when
      `done === total && total > 0`, and animates from width 0 on first paint. Assert the class
      strings are **complete literals**, not interpolated — Tailwind's scanner reads source as text
      and cannot see a composed name.
- [ ] `confirm-dialog` autofocuses **nothing**, so Enter cannot confirm a delete; `prompt-dialog`
      focuses and text-selects its input, so retyping replaces. Both are legacy behaviours worth
      keeping and both are easy to lose.
- [ ] Escape closes both dialogs and resolves the cancel branch.
- [ ] A test imports each shell component individually by subpath and asserts no client-only module
      is reachable from a server-safe one. `packages/ui` has no barrel precisely so this holds.
- [ ] The stylesheet gains an `@source` line if a new directory is introduced. State explicitly in
      the report whether one was needed — a missing line produces silently unstyled output with no
      error, so "I checked" is the deliverable.

---

## Group C — authority (nothing else can be built first)

### Task 7: `lib/env.ts`, `lib/crypto.ts`, `lib/session.ts`, `lib/api.ts`

The only `process.env` reader is `lib/env.ts`, validated at module load: `API_BASE_URL`, `API_KEY`,
`COOKIE_SECRET` (≥32 bytes). A missing or short secret is a boot failure, not a runtime one.

**Corrected after the fact:** not at module load. `next build` imports every route's module graph to
collect its configuration, so a module-level `readEnv(process.env)` made the **build** require
production secrets — measured as `Failed to collect configuration for /login`, and
`export const dynamic = 'force-dynamic'` does not avoid it. `lib/env.ts` exports `appEnv()`, a
memoised function, and `register()` in `instrumentation.ts` calls it once at server start, which Next
skips during `next build`. The boot failure the plan asked for is kept: measured against the
standalone server with `COOKIE_SECRET` unset, boot logs the error and every request is a 500 (ADR
0032, amendment (d)).

`crypto.ts` seals a principal into an AES-256-GCM blob (`node:crypto`, no dependency). Signing would
prove integrity only, and the payload is a live share token sent on every request under `Path=/`.

`session.ts` owns two cookies: `mt_admin` (Max-Age = the bearer's own `expiresInSeconds`) and
`mt_link` (Max-Age 30 days, because a share token has no expiry). `Secure` derives from
`x-forwarded-proto`, matching how the app is deployed behind Coolify.

- [ ] A tampered cookie fails to open and is treated as absent. Flip one byte of ciphertext, one byte
      of the auth tag, and the IV — all three reject. This is the whole reason for GCM over a
      signature; assert it rather than trusting it.
- [ ] A cookie sealed with a different secret does not open.
- [ ] `mt_admin` and `mt_link` are independent: sealing one leaves the other untouched. An admin
      opening a client's link must not lose their session, which one shared cookie would have done.
- [ ] `apiForSession()` sends both `x-api-key` and `Authorization: Bearer`; a service key with no
      bearer is a 401 by the API's design and the client must not attempt to paper over it.
      **Corrected after the fact:** it is `apiForSession(audience)`. With two disjoint cookies a
      bare call cannot know which to read, and the audience is fixed by the route (ADR 0012).
- [ ] `env.ts` throws on a 31-byte `COOKIE_SECRET`. Pinned, because a short key silently weakens
      everything above.
- [ ] `grep` proves exactly one `process.env` site in the app.

### Task 8: `/login`, logout, and the 401 branch

**Files:** `app/login/page.tsx`, `actions/auth.ts`, `middleware.ts`, `lib/problem.ts`.

**Corrected after the fact:** `proxy.ts`, not `middleware.ts`. Next 16.3.4 deprecates the
`middleware` file convention — `next build` warns and names the `middleware-to-proxy` codemod — so
the gate was built under its current name, with the same role (ADR 0032, amendment (a)).

- [ ] A wrong password and an unknown service key are indistinguishable in the response and
      distinguishable in the logs — the login route must not become a password oracle.
- [ ] `?next=` is honoured on success and **sanitised**: an absolute URL, a protocol-relative `//`,
      or anything not starting with a single `/` falls back to `/`. An open redirect on a login form
      is the classic version of this bug, so assert the hostile inputs, not just the happy path.
- [ ] An admin 401 anywhere redirects to `/login?next=<pathname>`; legacy dropped the deep link and
      always landed on `/`.
- [ ] A link 401 **never** reaches `/login`. It renders the terminal "this link is no longer
      available" page and clears `mt_link`. A revoked client shown an admin password form is the
      worst available answer. **Corrected after the fact:** it redirects to `/s/unavailable` and
      clears nothing. A render cannot write a cookie, and the proxy clear on arrival that replaced
      it made a `GET` — and so a Next prefetch — change state; a stale `mt_link` decides nothing,
      because the URL wins. The same goes for `mt_admin` on `/login`: nothing clears it there, and a
      signed-in admin who opens `/login` keeps their session, as in legacy (ADR 0032, amendment (b)).
- [ ] Logout clears the cookie. The report states plainly that the bearer stays valid until its TTL
      and that this is a recorded limit (ADR 0032), not an oversight.

---

## Group D — the admin surface

### Task 9: projects index (`/`)

Parity rows 5–13 of the inventory. Create, list, open, delete, empty state, load error.

- [ ] Row metadata reads exactly legacy's shape: "N tabs · N share links · updated Nh ago", with the
      share-links clause omitted when the count is zero.
- [ ] The derived progress bar walks `tabs[].document` for `taskItem` nodes — **not** the project
      object. A parity check that walked the project reported `{done:0,total:0}` for every input and
      "agreed" with an implementation that did the same, proving nothing. Use `countTasks` from
      contracts against a real production document.
- [ ] Delete confirms with the name in the title and states that tabs, content and share links go
      with it. On confirm, the project's tokens stop resolving immediately.
- [ ] The empty state is verbatim: "No projects yet — create your first one above."
- [ ] No share token appears anywhere in the rendered HTML. Assert on the response body.

### Task 10: project page (`/p/[projectId]`)

Folder tree and task list: create, rename, move, reorder, delete, plus search within the project.

- [ ] Controls render from `capabilities(role, scope)`, never from `role`. A test renders as a
      task-scoped `manage` principal and asserts the folder-create and sibling-task-create controls
      are **absent** — they would 403.
- [ ] Rename is inline and matches legacy's editing rules: Enter commits, Escape reverts, empty or
      unchanged silently restores with no request.
- [ ] A re-render must not overwrite the field the user is typing in. Legacy guarded this explicitly
      and an autosave-triggered re-render otherwise eats keystrokes.
- [ ] The name the server returns may differ from the one typed — `cleanName` collapses internal
      whitespace runs and truncates at 80 **code points** while the schema validates 80 UTF-16
      **code units**. The UI shows the server's value, not the optimistic one.
- [ ] Reorder sends a strict permutation; a test asserts a partial or duplicated list is rejected
      before it reaches the API.

### Task 11: task page shell (`/p/[projectId]/t/[taskId]`)

Tab strip, tab CRUD, reorder, per-tab progress. Not the editor.

- [ ] Relative "move left/right" is computed into a full permutation for `tabs.reorder` — there is no
      move route, despite the spec's route table naming one.
- [ ] `?tab=` is validated against the task's own tabs with fallback to the first, and is written
      with `replaceState` semantics so Back leaves the page rather than walking tab history.
- [ ] After deleting a tab, focus lands on the tab to the **left** (`max(0, index - 1)`), not the
      first.
- [ ] Switching tabs flushes a pending save first, so no edit is lost by navigating.
- [ ] The active tab scrolls into view without rebuilding the strip, so horizontal scroll survives.
      Legacy's share page rebuilt the strip on every keystroke and lost scroll position; do not
      reproduce that half.
- [ ] `+ Tab` is disabled at the tab limit, read from `LIMITS` in contracts rather than a literal 40.

### Task 12: the editor island

**Files:** `components/editor/**`, `app/api/.../document/route.ts`.

Tiptap 3.31.3, `'use client'`, one client leaf.

Required configuration, each for a measured reason:

- `immediatelyRender: false` — App Router; it also selects the `Editor | null` overload, which is what
  actually happens on first render, so every `editor.` access needs a guard.
- `trailingNode: false` — StarterKit 3 appends an empty trailing paragraph on the **first**
  transaction for any document not ending in one. Both production checklist tabs end in a `taskList`,
  so without this the first keystroke produces a diff the user never typed and an autosave they never
  caused. Measured: `before=2 after=3` with it on, `2 → 2` with it off.
- `link` inside `StarterKit.configure` — StarterKit 3 bundles Link. Passing a separate `Link`
  extension logs "Duplicate extension names found" and races two configurations.
- `TaskList` / `TaskItem` from `@tiptap/extension-list`; `Placeholder` from `@tiptap/extensions`. The
  old packages are two-line re-export shims.
- Toolbar state via `useEditorState`, **not** `onSelectionUpdate`/`onTransaction`.
  `shouldRerenderOnTransaction` defaults to `false` in v3, so legacy's pattern ported naively gives
  buttons that never light up.

Autosave: 700ms debounce, 4000ms retry, `keepalive` on `beforeunload` and on
`visibilitychange → hidden` (the real mobile safety net). The flush sets `dirty = false` **before**
awaiting and restores it on failure, so typing during an in-flight save cannot produce a false
"Saved".

**Corrected after the fact:** `visibilitychange → hidden` sends a **normal** request, not a
`keepalive` one. This plan contradicted ADR 0028, whose decision 2 says so: the page is usually still
alive when that event fires, a normal request has no size limit, and a `keepalive` body shares a
64 KiB budget across the fetch group, so a real document would fail there as a network error — the
silent loss the flush exists to prevent. Only `beforeunload` sends `keepalive`, and only under 50 KB.
The code follows the ADR (`components/editor/use-autosave.ts`). Writes are also **serialised**, one
in flight per tab, because `If-Match` makes two overlapping writes conflict with each other (ADR 0016
amendment).

- [ ] A stored production document round-trips byte-identically through mount and unmount with no
      edit. This is the single most important test in the plan: it is what proves Tiptap 3 did not
      silently rewrite live data.
- [ ] Writes carry `If-Match` on `updatedAt`. A stale write gets 409 and renders "someone else saved
      this tab" with a reload affordance. Legacy was last-write-wins and silently lost an edit; this
      is a deliberate, visible change.
- [ ] 20 concurrent writes with the same `If-Match` yield `{200: 1, 409: 19}` — **and the test must
      advance the clock**, because under a frozen clock the same scenario yields `{200: 20}` and the
      headline assertion proves nothing.
- [ ] A read-only viewer's checkbox is `disabled`, links open on click in the read-only view and
      do **not** in an editable one (`openOnClick: !editable`). **Corrected after the fact
      (2026-09-12):** this asked for a click that snaps back, which is what legacy did. The build
      sets `disabled` on the checkbox instead, so neither a click nor a key reaches it and
      assistive technology is told as much; the omitted `onReadOnlyChecked` is now the floor under
      that rather than the mechanism. The implementer built the better behaviour and said so in
      TSDoc; the plan was wrong, not the code. ADR 0042 records it, and `document-editor.test`
      "marks every checkbox disabled" pins it.
- [ ] A `javascript:` href is refused. Pre-validate against `SAFE_HREF_SCHEMES` from contracts and
      assert the hostile forms the guard was hardened against — a leading space, an embedded tab, an
      embedded newline, a NUL — because browsers strip exactly those and `java<TAB>script:` executes.
- [ ] The save-state indicator distinguishes saving, saved, and "not saved — retrying…", and the
      retry does not stack timers.

### Task 13: share manager

Parity rows 42–49. List, create, copy, rename, change role, revoke.

- [ ] The manager is only rendered when `capabilities()` says the principal can read links in this
      scope. For a task-scoped `manage` holder it is absent, with the "you can create but not list"
      case stated in the UI rather than shown as an error.
- [ ] Copy selects the input text, falls back to `execCommand` and reports success honestly — legacy
      toasted "Link copied" even on total failure. Do not reproduce the lie.
- [ ] A blank link name renders "Unnamed link". Production data already contains one.
- [ ] Rename and role change hit `PATCH` and keep the token.
- [ ] The share URL is built from the request origin, never hardcoded.
- [ ] Revoke confirms with the name, or "Revoke this link?" when unnamed.

---

## Group E — the client surface

### Task 14: `/s/[token]` and `/s/[token]/t/[taskId]`

- [ ] `noindex` on every `/s/*` route. It appears in exactly one place in the whole repo today (an
      ADR line) and nowhere in code.
- [ ] The URL token **always** beats the cookie: arriving at `/s/<tokenB>` while holding `tokenA`
      resolves B and rewrites the cookie.
- [ ] A task-scoped link lands on its task; a project-scoped link lands on a task list, and its tasks
      link to `/s/<token>/t/<taskId>`.
- [ ] A revoked token renders the terminal unavailable page, clears `mt_link`, and never redirects to
      `/login`. **Corrected after the fact:** it redirects to `/s/unavailable` and clears nothing —
      see Task 8. The reseal of `mt_link` on `/s/<token>` meets the same constraint: a page render
      cannot write a cookie, and `proxy.ts` is tested to write none, so settle first whether any
      route still reads `mt_link` now that every client URL carries its token (ADR 0032, amendment
      (e)).
- [ ] `/share/<token>` 308s to `/s/<token>`, for links already in clients' hands.
- [ ] A `view` link gets a non-editable editor and no toolbar; a `write` link can add and rename tabs
      but cannot delete or reorder them — matching the API, which refuses those.
- [ ] The share dialog's stale hint text is **not** carried forward: "Nobody can add, rename or
      delete tabs" was already false in legacy, because write links can add tabs.

---

## Group F — cutover

### Task 15: delete `apps/legacy`

Only after Tasks 1–14 are green and the parity audit is done.

- [ ] `docs/parity/legacy-microtask.md` exists and every one of its 71 features is marked reproduced
      or deliberately dropped with a reason. A feature silently missing from both the app and the
      audit is the failure this catches.
- [ ] `"legacy#build"` comes out of `turbo.json`'s `//#check-exports` dependsOn — turbo fails a graph
      naming a package that does not exist.
- [ ] The root `Dockerfile` and `docker-compose.yml` are rewritten for `microtask` per ADR 0026: one
      `turbo prune microtask --docker`, Next standalone, `node:24`. `shadcn` must survive the prune,
      because `globals.css` imports `shadcn/tailwind.css`.
- [ ] A `.gitattributes` exists before the Docker build. `core.autocrlf=true` with no `.gitattributes`
      is a recorded hazard.
- [ ] `allowBuilds: { esbuild: false }` **stays** — its own comment says it outlives legacy, because
      vitest reaches esbuild through vite. Only the wording changes.
- [ ] `.dockerignore` and `README.md` updated.
- [ ] `legacy-prod` still resolves to `6184c9d` after deletion.

### Task 16: final audit

- [ ] Four gates cold: `Cached: 0`.
- [ ] `node scripts/check-exports.mjs` exits 0.
- [ ] Exactly one `process.env` site in `apps/microtask`.
- [ ] No share token in any rendered HTML, asserted on response bodies for the projects index, the
      project page and the share pages. **Added after the fact:** on the project page this holds
      because the share manager loads its links when it is opened, rather than receiving them from
      the page's server render — anything a Server Component hands a client component is
      serialised into the Flight payload in the HTML (ADR 0033), so a `shareLinks` prop would put
      every token in the page source. Unit D1 builds the manager that way; assert it on a project
      that has at least one link, or the check passes vacuously.
- [ ] `capabilities()` agrees with `can()` across the full cross product.
- [ ] The parity audit is committed, not just performed.
- [ ] The report names every deliberate difference from legacy, with its ADR.
