# Architecture decision records

One file per decision. Each records the context at the time, the decision, its consequences, and
what else was considered. Numbers are permanent; a decision that changes gets a **new** ADR that
supersedes the old one rather than an edit.

The implementation-facing detail — domain model, page map, cutover runbook — lives in
[`../superpowers/specs/2026-09-10-monorepo-restructure-design.md`](../superpowers/specs/2026-09-10-monorepo-restructure-design.md),
which references these by number. The full behavioural inventory of the app being replaced, captured
before it was deleted, is [`../parity/legacy-microtask.md`](../parity/legacy-microtask.md): 71
features, 25 routes and 41 non-obvious behaviours, each of which is reproduced or deliberately
dropped by one of the decisions here.

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
| [0016](0016-conditional-document-writes.md) | `If-Match` makes a client with two writes in flight on one tab conflict with itself, so writes are serialised; and a 409 cannot auto-reload, because the refused write always carried unsaved edits — nor may a tab switch, create, delete or rename remount the editor over edits it is holding |
| [0022](0022-hostname-continuity-gated-cutover.md) | The continuity redirect is a **308**, and it has two destinations by share scope (ADR 0037) |
| [0023](0023-typescript-strict-shared-config.md) | `noUncheckedIndexedAccess` was predicted to be the irritating flag; it cost **zero** across 22 vendored files, `exactOptionalPropertyTypes` cost **2** |
| [0024](0024-framework-free-zod-contracts.md) | `strict-peer-dependencies` in `.npmrc` **was never in effect** — pnpm 10+ reads it from `pnpm-workspace.yaml` |
| [0025](0025-shadcn-tailwind-shared-package.md) | Six instructions could not execute as written: `pnpm dlx`, "the CLI writes both `components.json`", "one stylesheet" during `init`, two dead `@source` lines, the server-safe list (6 of 22, not 4), and a local `cn` the CLI no longer generates |
| [0026](0026-docker-turbo-prune-standalone.md) | Turbo silently never caches `.next` when `output: 'standalone'` is set; `!.next/standalone/**` is the fix |
| [0027](0027-code-style-solid-enforced.md) | The vendored-components override named a directory the CLI never writes to, **and** its glob was inert in the shared config — the trap this ADR documents and then walked into |
| [0032](0032-two-cookies-url-wins.md) | A render cannot write a cookie, so "a 401 clears its cookie" was unbuildable; the proxy clear that replaced it made `GET /login` a logout, and is gone. Also: `proxy.ts` not `middleware.ts`, the boot check in `register()`, and why `/s/unavailable` sits inside `/s/`. And its link half — `mt_link`, sealed from the URL on arrival — is superseded by ADR 0040: a state-changing `GET` that let a hostile page replace the link a visitor held, restating a token every `/s/*` URL already carries |
| [0033](0033-list-ships-no-share-tokens.md) | The share-link **count** was unconditional; it is gated on the same `share:read` decision the links were, so a link principal is told nothing rather than a number. And the share manager was to render from `projects.read()`, which would put every token into the project page's HTML: the page renders a count, and the links load when the dialog opens. The task page mounts the same manager, scoped to its task |
| [0038](0038-capabilities-role-and-scope.md) | One answer per action is not enough: `project:read` is gated on **two** targets, so the projection is `mayReach(role, scope, action, target)` with `capabilities()` as the record over it. And a task-scoped `manage` holder was said to get no share manager; the record grants it `share:create`, so it gets a create-only one with no list |
| [0039](0039-tiptap-in-the-app-and-v3.md) | The server pass with `immediatelyRender: true` warns and overrules the flag rather than throwing, and a Tiptap 2 link mark gains `title: null` rather than round-tripping unchanged |
| [0040](0040-link-surface-url-token-authority.md) | "Every `/s/*` response carries `Cache-Control: private, no-store`" — a Server Action answer on `/s/<token>`, the share-link list included, keeps Next's own `no-cache, no-store, …`; uncacheable still, but not what the sentence said |

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
