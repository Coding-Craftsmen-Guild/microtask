# Architecture decision records

One file per decision. Each records the context at the time, the decision, its consequences, and
what else was considered. Numbers are permanent; a decision that changes gets a **new** ADR that
supersedes the old one rather than an edit.

The implementation-facing detail — domain model, page map, cutover runbook — lives in
[`../superpowers/specs/2026-09-10-monorepo-restructure-design.md`](../superpowers/specs/2026-09-10-monorepo-restructure-design.md),
which references these by number. The full behavioural inventory of the app being replaced, captured
before it was deleted, is [`../parity/legacy-microtask.md`](../parity/legacy-microtask.md): 71
features, 25 routes and 41 non-obvious behaviours. Its audit marks every one of them reproduced,
changed or dropped, with the decision that says so, or a gap, with why it is still open. That
app's code is at the `legacy-prod` tag, which predates the move into `apps/legacy/`: a path cited
below as `apps/legacy/server.js:97` is `server.js:97` at that tag, same line, and no longer exists
in the working tree.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-pnpm-turborepo-monorepo.md) | Restructure as a pnpm + Turborepo monorepo | Accepted |
| [0002](0002-standalone-api-not-nextjs.md) | One standalone API, not Next.js route handlers | Accepted |
| [0003](0003-json-files-no-database.md) | Keep JSON files on disk, no database | Accepted |
| [0004](0004-project-task-folder-hierarchy.md) | Rename Project to Task; add Project with one-level folders | Accepted |
| [0005](0005-manifest-plus-task-files.md) | Directory per project: manifest plus one file per task | Accepted |
| [0006](0006-write-ordering-not-transactions.md) | Write ordering instead of multi-file transactions | Accepted |
| [0007](0007-progress-derived-then-cached.md) | Progress is derived, then cached in the manifest | Accepted |
| [0008](0008-three-roles-one-policy.md) | Three roles behind one pure AccessPolicy | Accepted |
| [0009](0009-deny-by-default-collections.md) | Collection and top-level actions are deny-by-default | Accepted |
| [0010](0010-revocation-cascade-lineage.md) | Revocation cascades through link lineage | Accepted |
| [0011](0011-task-is-default-share-scope.md) | Task is the default share scope | Accepted |
| [0012](0012-dual-credential-api.md) | The API requires a service key *and* a principal token | Accepted |
| [0013](0013-one-route-tree-two-principals.md) | One route tree, two principal kinds | Accepted |
| [0014](0014-namespace-products-now.md) | Namespace products from day one | Accepted |
| [0015](0015-actions-except-bytes.md) | Server Actions, except anything that moves bytes | Accepted |
| [0016](0016-conditional-document-writes.md) | Document writes are conditional | Accepted |
| [0017](0017-drop-in-import-export.md) | Drop-in import/export instead of a migration CLI | Accepted |
| [0018](0018-sniff-by-directory-group.md) | Sniff dropped files by directory group, not individually | Accepted |
| [0019](0019-token-identity-on-import.md) | Replace preserves tokens; import-as-new remints them | Accepted |
| [0020](0020-zip-server-side-only.md) | Zip archives are expanded server-side only | Accepted |
| [0021](0021-names-only-search.md) | Search matches names only | Accepted |
| [0022](0022-hostname-continuity-gated-cutover.md) | Microtask keeps the live hostname; the merge is not the cutover | Accepted |
| [0023](0023-typescript-strict-shared-config.md) | TypeScript everywhere, one strict shared config | Accepted |
| [0024](0024-framework-free-zod-contracts.md) | Zod contracts stay framework-free; the API assembles the OpenAPI document | Accepted |
| [0025](0025-shadcn-tailwind-shared-package.md) | shadcn/ui and Tailwind v4 in `packages/ui`, with explicit `@source` paths | Accepted |
| [0026](0026-docker-turbo-prune-standalone.md) | Three images via one `turbo prune` per image and Next standalone output | Accepted |
| [0027](0027-code-style-solid-enforced.md) | Code style: SOLID, small files, TSDoc only, enforced by ESLint | Accepted |
| [0028](0028-autosave-under-keepalive-cap.md) | Autosave does not rely on flush-on-unload for large documents | Accepted |
| [0029](0029-document-sanitised-at-the-boundary.md) | A document is sanitised at the boundary, by walking it | Accepted |
| [0030](0030-service-context-of-ports.md) | Services take one context of ports; a double never re-implements a correctness component | Accepted |
| [0031](0031-vendored-primitives-separate-lint-regime.md) | Vendored primitives are a separate lint regime, applied where its glob resolves | Accepted |
| [0032](0032-two-cookies-url-wins.md) | Two cookies, encrypted, and the URL always wins | Accepted; link half superseded by 0040 |
| [0033](0033-list-ships-no-share-tokens.md) | The project list ships a share-link count, never share links | Accepted |
| [0034](0034-task-entry-carries-list-row.md) | `TaskEntry` carries what a list row renders | Accepted |
| [0035](0035-share-links-renamable-role-changeable.md) | A share link can be renamed and its role changed; its scope still cannot | Accepted |
| [0036](0036-wire-facts-live-in-contracts.md) | The wire facts a browser needs live in `@repo/contracts` | Accepted |
| [0037](0037-share-url-shape.md) | The share URL shape: `/s/<token>`, plus a task segment for a project scope | Accepted |
| [0038](0038-capabilities-role-and-scope.md) | Controls gate on role **and** scope, never role alone | Accepted |
| [0039](0039-tiptap-in-the-app-and-v3.md) | The Tiptap editor lives in the app, and what Tiptap 3 changed | Accepted |
| [0040](0040-link-surface-url-token-authority.md) | The link surface authenticates from its URL, and holds no cookie | Accepted |
| [0041](0041-api-internal-only.md) | The API is internal-only: no published port and no domain | Accepted |
| [0042](0042-three-parity-departures-on-the-surfaces.md) | Three departures from the app being replaced: a disabled checkbox, a named link, Sign out everywhere | Accepted |
| [0043](0043-client-head-names-no-visitor.md) | The client head names no visitor: `Signed in as` is dropped, and the badge stays two-state | Accepted |
| [0044](0044-uploads-are-chunked.md) | Every import upload is chunked, and the global body limit stands | Accepted |
| [0045](0045-staging-and-build-roots.md) | Staging and build roots live beside `projects/`, never inside it | Accepted |
| [0046](0046-legacy-admin-address-redirect.md) | The legacy admin address redirects, and a stale `?tab=` degrades instead of 404ing | Accepted |

## Amendments

A decision that **changes** still gets a new ADR. An earlier ADR that turns out to be **factually
wrong** — an instruction that cannot execute, a number that is not what was measured — is amended in
place instead, because ADR 0027 leaves no explanatory comments in code and a stale ADR is then the
one place a design error can hide. An amendment appends a dated section and corrects the wrong
sentence where the sentence lives, so nobody executes it from the body and finds the correction
afterwards.

Amended on 2026-09-11, from executed measurements and from decisions recorded since:

| ADR | What was wrong |
| --- | --- |
| [0001](0001-pnpm-turborepo-monorepo.md) | "The parts worth sharing — … the app shell, the editor" — the editor is Microtask's alone, and sharing it is the one case that carries a standing hazard rather than a cost (ADR 0039) |
| [0009](0009-deny-by-default-collections.md) | Gate and filter were the only two categories; rendering is a third, and ADR 0038 defines it |
| [0011](0011-task-is-default-share-scope.md) | "No PATCH can widen a link" — precisely, no PATCH can change its **scope**; role is changeable (ADR 0035) |
| [0012](0012-dual-credential-api.md) | "No second secret is needed" — the Next app mints a `{kind:'link'}` cookie the API never signs, so it needs `COOKIE_SECRET` (ADR 0032). And a bare `apiForSession()` cannot choose between two disjoint cookies: it takes the route's audience — and, since ADR 0040, admits `'admin'` alone, the link principal coming from the URL |
| [0013](0013-one-route-tree-two-principals.md) | The token in a `/s/<token>` URL was said to be bounded by "a session cookie on first load"; no cookie bounded the URL, and ADR 0040 removed it. It is bounded by `no-referrer`, `private, no-store` and `noindex` on every `/s/*` response |
| [0014](0014-namespace-products-now.md) | `openapi.json` and `/docs` are served at the root, not under `/v1` |
| [0015](0015-actions-except-bytes.md) | The autosave handler is `PUT /api/projects/:projectId/tasks/:taskId/tabs/:tabId/document`, not `POST /api/tabs/:tabId/document` |
| [0016](0016-conditional-document-writes.md) | `If-Match` makes a client with two writes in flight on one tab conflict with itself, so writes are serialised; and a 409 cannot auto-reload, because the refused write always carried unsaved edits — nor may a tab switch, create, delete or rename remount the editor over edits it is holding. And leaving the page by an in-app link dropped held edits with no prompt, because a Next navigation fires no `beforeunload`: a link now asks first, while Back and Forward still do not — a regression from parity feature 37, evaluated and left open, since no App Router approach is reliable. And the retry loop retried every refusal but a 409 every four seconds, forever: only a transport failure, 408, 429 and 5xx are retried now, and any other refusal stops the loop until the user chooses *Try again*, in the surface's plain words rather than the API's |
| [0022](0022-hostname-continuity-gated-cutover.md) | The continuity redirect is a **308**, and it has two destinations by share scope (ADR 0037) |
| [0023](0023-typescript-strict-shared-config.md) | `noUncheckedIndexedAccess` was predicted to be the irritating flag; it cost **zero** across 22 vendored files, `exactOptionalPropertyTypes` cost **2** |
| [0024](0024-framework-free-zod-contracts.md) | `strict-peer-dependencies` in `.npmrc` **was never in effect** — pnpm 10+ reads it from `pnpm-workspace.yaml` |
| [0025](0025-shadcn-tailwind-shared-package.md) | Six instructions could not execute as written: `pnpm dlx`, "the CLI writes both `components.json`", "one stylesheet" during `init`, two dead `@source` lines, the server-safe list (6 of 22, not 4), and a local `cn` the CLI no longer generates |
| [0026](0026-docker-turbo-prune-standalone.md) | Turbo silently never caches `.next` when `output: 'standalone'` is set; `!.next/standalone/**` is the fix. And, from building and running the images: the API mounts a **new** volume — the legacy one it said to mount `external: true` is unreadable by this API and is ADR 0022's rollback; Microtask's probe is `GET /login`, because a static-file probe stays healthy on a failed boot; `serve()` needs no `hostname`; `pnpm deploy --prod` ships every package's `src` and tests unless trimmed; Next bakes build-time keys into the image; and `.dockerignore` alone keeps an app's `.env.production` out of its image, which `next build` otherwise copies into standalone output. Measured: API 240 MB, Microtask 272 MB |
| [0027](0027-code-style-solid-enforced.md) | The vendored-components override named a directory the CLI never writes to, **and** its glob was inert in the shared config — the trap this ADR documents and then walked into. And the one environment reader imported `node:process` into the Edge instrumentation bundle; it reads the global instead, so the single-reader rule needs no second read |
| [0028](0028-autosave-under-keepalive-cap.md) | "Edits are durable within ~700 ms" held only while the server accepts the writes: a refusal a retry cannot change now stops the loop, neither unload flush sends it, and the unsaved-changes prompt is the only guard left (ADR 0016) |
| [0032](0032-two-cookies-url-wins.md) | A render cannot write a cookie, so "a 401 clears its cookie" was unbuildable; the proxy clear that replaced it made `GET /login` a logout, and is gone. Also: `proxy.ts` not `middleware.ts`, the boot check in `register()`, and why `/s/unavailable` sits inside `/s/`. And its link half — `mt_link`, sealed from the URL on arrival — is superseded by ADR 0040: a state-changing `GET` that let a hostile page replace the link a visitor held, restating a token every `/s/*` URL already carries |
| [0033](0033-list-ships-no-share-tokens.md) | The share-link **count** was unconditional; it is gated on the same `share:read` decision the links were, so a link principal is told nothing rather than a number. And the share manager was to render from `projects.read()`, which would put every token into the project page's HTML: the page renders a count, and the links load when the dialog opens. The task page mounts the same manager, scoped to its task |
| [0038](0038-capabilities-role-and-scope.md) | One answer per action is not enough: `project:read` is gated on **two** targets, so the projection is `mayReach(role, scope, action, target)` with `capabilities()` as the record over it. And a task-scoped `manage` holder was said to get no share manager; the record grants it `share:create`, so it gets a create-only one with no list |
| [0039](0039-tiptap-in-the-app-and-v3.md) | The server pass with `immediatelyRender: true` warns and overrules the flag rather than throwing, and a Tiptap 2 link mark gains `title: null` rather than round-tripping unchanged |
| [0040](0040-link-surface-url-token-authority.md) | "Every `/s/*` response carries `Cache-Control: private, no-store`" — a Server Action answer on `/s/<token>`, the share-link list included, keeps Next's own `no-cache, no-store, …`; uncacheable still, but not what the sentence said |

Amended on 2026-09-12, from four fixes measured against the running containers:

| ADR | What was wrong |
| --- | --- |
| [0006](0006-write-ordering-not-transactions.md) | "Containers are killed on every deploy" was true and not inevitable: the API installed no `SIGTERM`/`SIGINT` handler, so every deploy killed it where it stood. Measured three ways against the built image — 10.9 s and exit 137 with node as PID 1, 1.0 s and exit 143 with tini as PID 1 (`init: true`, which compose sets), 0.9 s and exit **0** with the handler — so `init: true` buys a fast kill rather than a clean one, and only the handler makes the stop ordered. The amendment also pins what "drained" can mean when `QueueLock` has no observable idle: every `lock.run` is awaited inside a route handler, so waiting for the request waits for the write, and a test parks a write inside the lock rather than sleeping |
| [0026](0026-docker-turbo-prune-standalone.md) | The "does it build in Docker" check this ADR asks for was unreachable: the suite the image build runs read a gitignored production file, so a fresh clone, a CI runner and every container build errored. It now reads a derived fixture, proven portable in a fresh worktree. Also: `restart: unless-stopped` did nothing for a bad environment, because Docker restarts on exit and never on unhealthy; and `docker stop` "always ended in SIGKILL" only with node as PID 1 — `init: true` plus the `CMD` exec form get the signal to node, which then dies fast rather than cleanly until the handler exists (ADR 0006 carries the measurements) |
| [0032](0032-two-cookies-url-wins.md) | Amendment (d) left `register()` throwing and called a health check the thing that turns a bad environment into a failed deploy. Nothing acted on it — Docker restarts on exit, never on unhealthy — so a deploy with a bad `COOKIE_SECRET` came up and served 500s. `register()` now exits 1 |

Also on 2026-09-12, from the records audit, and **no ADR was factually wrong in that pass**. What
was wrong is the design spec, in six places, and two behaviours had no record at all. So the spec is
corrected where each sentence lives — dated, and left visible, as the `relativeTime` correction in
the app plan was — and the two decisions are new ADRs rather than amendments, because a decision
nobody took cannot be an amendment to one somebody did. The rows below are the map from each piece
of debt to where it now lives, kept here because this index is where a reader looks for it.

| Record | What was wrong, and where it is settled |
| --- | --- |
| spec §10.3, Editor row | "checkbox snaps back". It is `disabled`, so neither a pointer nor a key reaches it. Corrected in place; decided by [0042](0042-three-parity-departures-on-the-surfaces.md) |
| spec §11, Editor paragraph | "no `onReadOnlyChecked` (so read-only checkboxes snap back)". The configuration is exactly as written; the parenthetical is not, because a read-only view also sets `disabled`, and the omission is the floor under it rather than the mechanism ([0042](0042-three-parity-departures-on-the-surfaces.md)) |
| spec §10.3, Badge row | "You manage this", promised for a `manage` link at either scope and never built. The badge is two-state, from `capabilities(role, scope)['tab:write']`; at task scope the third string would have named an authority the page withholds ([0043](0043-client-head-names-no-visitor.md)) |
| spec §11, Title editing | `contenteditable="plaintext-only"`. It is an uncontrolled `<input>`, which is what takes `maxLength` from the contract and an accessible name from `aria-label`; every behavioural clause in the sentence survived the change of element |
| spec §11, Small things | "toasts auto-hide at 2600 ms". There are no toasts: every outcome is said beside the control that caused it. `sonner` is vendored in `packages/ui` and mounted nowhere, and `2600` is in no source file. The correction carries the argument, so parity feature 60 and U22 stop being gaps |
| spec §11, Small things | "code assets are `no-cache` and images `max-age=86400`". Neither rule exists. The app sets `Cache-Control` in two places and neither is an asset rule: `private, no-store` on `/s/*` and `/share/*` (ADR 0040), and `public, max-age=3600` on the `/favicon.ico` **redirect**, which caches the 308 rather than a file. One half is right not to be built — `_next/static` is content-hashed — and the other leaves a **measurement owed**: `public/img/logo.webp` is not, legacy cached it for a day, and what Next serves it with is unmeasured |
| (no ADR) → [0042](0042-three-parity-departures-on-the-surfaces.md) | Three behaviours built and tested with a record nowhere but their TSDoc: a read-only checkbox `disabled`, a share-link name required at minting, Sign out on every admin page (parity features 28, 43, 2 and U32, U39) |
| (no ADR) → [0043](0043-client-head-names-no-visitor.md) | The one parity loss nothing decided: legacy's `Signed in as <link name>` is dropped rather than added to `ShareView` (parity feature 51) |

The code gaps were deliberately **not** given a decision here, because each was scheduled work the
parity audit already names and none of them was a record problem. Three of the four are now closed,
and the rows are kept so the closing is legible: no `SIGTERM`/`SIGINT` handler (feature 71), closed
on 2026-09-12 by the fixes in the table above; the importer, which exists as of the import/export
plan (feature 67); and no redirect from the old admin addresses (route R3), closed on 2026-09-17 by
[0046](0046-legacy-admin-address-redirect.md) — the decision the parity audit said had to be taken
alongside ADR 0022, and which could not be taken until the importer existed to make a legacy
`?tab=` mappable at all. What remains is `QueueLock` plus the token index still assuming a single
replica (ADR 0030; plan 2 says ADR 0006 records whichever way that goes), and inventing a decision
for it would put a choice in the index that nobody has made; it is named in the parity audit
instead, with what it is waiting on.

## Verification

ADRs 0024–0026 and 0028 state configuration and platform behaviour that was checked against official
documentation and vendor source on 2026-09-10, rather than recalled. That pass corrected four things
worth knowing about, because each would have been implemented as written:

- **`fetch` `keepalive` really is capped at 64 KiB.** An earlier review claimed otherwise and a
  verifier agreed with it; both were wrong. It breaks flush-on-unload for real documents — ADR 0028.
- **`readEntries()` really does batch at 100 entries** in Chromium. A one-shot directory read
  silently truncates a dropped folder — ADR 0018.
- **Node 20 is end-of-life** (2026-04-30) — ADR 0026 pins `node:24`.
- **The official shadcn monorepo template ships a broken `@source` path**, off by one directory
  level, which fails silently — ADR 0025.

The end-to-end Zod-`.meta()`-to-OpenAPI path was then **executed** rather than left to inference —
see "Verified by spike" in ADR 0024. It works, so contracts stay framework-free. The spike also
corrected the research in the dangerous direction: a duplicate `.meta({ id })` does **not** throw at
conversion as documented — it silently collapses two schemas into one and points both `$ref`s at the
winner, which makes the unique-id test the only defence rather than a formality.

ADR 0039 was produced the same way, and it is the largest of these: the Tiptap 2 → 3 jump was
**executed against the two real files in `data/projects/`**, not read from a changelog. The headline
is that stored documents need no migration — `taskList`, `taskItem` and `attrs.checked` round-trip
unchanged and every progress number is identical (12 of 12 items). The finding that would have cost
real data is quieter: StarterKit 3's bundled `TrailingNode` rewrites any tab ending in a `taskList`
on its first transaction (root children 2 → 3), changing **no** `taskItem` count — so it edits the
user's document while every number the product displays stays right. `trailingNode: false` is a
required setting, not a preference.

What remains unverified is everything Coolify-specific, above all whether Coolify renames named
volumes (ADR 0026, and step 1 of the cutover runbook). The mitigation is backups taken before
deploy, so a wrong volume name is discovered at the import step with the original data intact.

## What "production data" means in these records · 2026-09-12

Several ADRs reason from a dataset they call *production*, *live* or *production customer data* —
0026, 0029, 0039, 0042 and 0043, plus the parity inventory and both plans. **They all mean the two
files in this machine's gitignored `data/projects/`, and those are development data, not the live
dataset.**

Measured: both were created `2026-09-09T21:16Z` and last written that evening, hours before the
final commit of the app they belonged to (`legacy-prod`, 2026-09-10 07:56), and they are named
`ACME Website` and `Other Co` with a share link named `Sam (agency)`. The product owner's
instruction was explicit that the local copy is disposable and the real dataset is on the Coolify
volume: *"discard current local, but we need to migrate the ones that are live on coolify before
deploy."* **Nothing in this repository has ever inspected the live dataset.**

The origin is established, not merely inferred: the agent session that built the app being replaced
created both projects through that app's own HTTP API on 2026-09-09, and its first-hand account
matches the files on three independent details — `createdAt` to the millisecond
(`21:16:20.246Z`), both surviving share-link tokens by prefix (`976q3MP9…`, `gjgZyUrk…`), and the
id of the default tab the create seeded (`01M240ERCR2CEBJM17CZF7A644`, named `General`, at
position 1 today because it was reordered afterwards). A third share link, named and then revoked
while exercising the revoke path, is why `ACME Website` carries two links rather than three. Worth
pinning rather than leaving open, because a record that says *unknown* about something knowable
invites the question to be re-derived later — which is how the mis-scoping below survived two days.

One trap in doing that dating, for whoever does it next: a session's reported age is not the age of
its work. The session in question has run since 2026-09-09 and the date has rolled twice, so an
age of "a day" sat alongside data it had written three days earlier, and reasoning from the age
signal pointed at the wrong session. The file stamps and the ids are the evidence; the session
metadata is not.

The designs do not change — every guard, cap and parse was built to hold for arbitrary input, which
is why this is a scoping correction and not a defect. Three claims get weaker, and two of them are
cutover checks rather than code changes:

- **0029** says the dataset exercises no `href` or `src`, so the scheme allowlist is never hit in
  practice. True of the local files (`grep -c '"href"'` is 0 in both). Unknown of the live data, so
  the allowlist should be assumed load-bearing from the first import, not eventually.
- **0039** says stored documents round-trip unchanged, qualified as holding *for the production
  data, which carries no links*. Same scoping. If the live data does carry links, a v2 `link` mark
  gains `"title": null` under Tiptap 3, so the first edit of such a tab rewrites the document — the
  round-trip check belongs in the import runbook against the real volume, where it is cheap.
- **0042** and **0043** justify accepting a blank share-link name because *production data already
  contains one*. The local dataset does, verified. Accepting a blank on read and refusing to mint
  one stays correct either way: it is defensive against any stored blank, not evidence of one.

The fixtures under `packages/contracts/src/testing/` are derived from these same local files, which
bounds what has been published to this public repository — but the derivation is written to be safe
for the live volume too, because `fixture:derive` is a step the import runbook will eventually run
on a machine that holds it.
