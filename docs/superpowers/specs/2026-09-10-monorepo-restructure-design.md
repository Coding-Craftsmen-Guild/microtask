# Monorepo restructure: Microtask → one API + two consumers

**Status:** ready for review
**Date:** 2026-09-10
**Branch:** `feat/monorepo-restructure`
**Decisions:** [`docs/adr/`](../../adr/README.md) — 38 records
**Legacy inventory:** [`docs/parity/legacy-microtask.md`](../../parity/legacy-microtask.md)

## 1. Why

The app that exists today is a ~3,000-line vanilla-JS server (`server.js`, 473 lines, all routing +
auth + endpoints inline) over one JSON file per project. It works and it is live in production on
Coolify with real client share links in circulation. Two things have outgrown it:

1. A project is the top-level entity, but the thing being modelled is a *checklist* — so the
   hierarchy is one level too shallow to organise anything.
2. A second product (Macroplan) is coming, and none of this code can be shared as it stands.

So: rename the current entity to **Task**, add **Project** above it, add roles, move to TypeScript,
put an OpenAPI-documented API in front of everything, and split the result into a monorepo of one
API and two Next.js consumers over shared packages.

## 2. Scope

**In:** the entity rename; the new Project/Folder layer with search; three roles replacing
read/write; project- *and* task-scoped share links; JS → TS throughout; a documented REST API with
Swagger UI; drop-in import/export; pnpm + Turborepo monorepo; shadcn/ui in a shared package;
Macroplan as a working shell; deploy as one compose file with three services.

**Out:** nested folders (one level only), document full-text search (names only), user accounts
(one shared admin password), a database (JSON files stay), and Macroplan's own feature set.

## 3. Decisions taken

Each decision has its own record in [`docs/adr/`](../../adr/README.md) with the context it was made
in, its consequences and what else was considered. This document does not repeat that reasoning — it
states what to build.

| Decision | Choice | ADR |
| --- | --- | --- |
| Tooling | pnpm + Turborepo monorepo | [0001](../../adr/0001-pnpm-turborepo-monorepo.md) |
| API stack | Standalone Hono on `@hono/node-server`, not Next route handlers | [0002](../../adr/0002-standalone-api-not-nextjs.md) |
| Storage | JSON files on disk, no database | [0003](../../adr/0003-json-files-no-database.md) |
| Hierarchy | Project → one level of folders → Task → tabs | [0004](../../adr/0004-project-task-folder-hierarchy.md) |
| Layout | Directory per project: manifest + one file per task | [0005](../../adr/0005-manifest-plus-task-files.md) |
| Durability | Write ordering, not multi-file transactions | [0006](../../adr/0006-write-ordering-not-transactions.md) |
| Progress | Derived from documents, cached in the manifest | [0007](../../adr/0007-progress-derived-then-cached.md) |
| Roles | `view` / `write` / `manage` behind one pure `AccessPolicy` | [0008](../../adr/0008-three-roles-one-policy.md) |
| Collections | Deny-by-default; no wildcard branch in the policy | [0009](../../adr/0009-deny-by-default-collections.md) |
| Revocation | Cascades through `createdBy` lineage | [0010](../../adr/0010-revocation-cascade-lineage.md) |
| Share scope | Project **and** task; **task is the default** | [0011](../../adr/0011-task-is-default-share-scope.md) |
| API auth | Service key **and** principal token; key alone → 401 | [0012](../../adr/0012-dual-credential-api.md) |
| Routing | One route tree, two principal kinds | [0013](../../adr/0013-one-route-tree-two-principals.md) |
| Macroplan | Own entities, namespaced from day one | [0014](../../adr/0014-namespace-products-now.md) |
| Mutations | Server Actions, except anything that moves bytes | [0015](../../adr/0015-actions-except-bytes.md) |
| Document writes | Conditional on last known `updatedAt`; 409 on mismatch | [0016](../../adr/0016-conditional-document-writes.md) |
| Migration | Drop-in import/export, no CLI | [0017](../../adr/0017-drop-in-import-export.md) |
| Import sniffing | By directory group, not per file | [0018](../../adr/0018-sniff-by-directory-group.md) |
| Import identity | `replace` preserves tokens; `import as new` remints | [0019](../../adr/0019-token-identity-on-import.md) |
| Zip | Expanded server-side only | [0020](../../adr/0020-zip-server-side-only.md) |
| Search | Names only | [0021](../../adr/0021-names-only-search.md) |
| Cutover | Keep the live FQDN; the merge is not the deploy | [0022](../../adr/0022-hostname-continuity-gated-cutover.md) |
| Language | TypeScript everywhere, one strict shared config | [0023](../../adr/0023-typescript-strict-shared-config.md) |
| Contracts | Zod only, framework-free; the API assembles the OpenAPI doc | [0024](../../adr/0024-framework-free-zod-contracts.md) |
| Styling | shadcn/ui + Tailwind v4 in `packages/ui`, explicit `@source` | [0025](../../adr/0025-shadcn-tailwind-shared-package.md) |
| Images | `node:24`, one `turbo prune` per image, Next standalone | [0026](../../adr/0026-docker-turbo-prune-standalone.md) |
| Code style | SOLID, 80-line `.tsx` / 150-line `.ts`, TSDoc only, ESLint-enforced | [0027](../../adr/0027-code-style-solid-enforced.md) |
| Autosave | Flush-on-unload is best-effort only — `keepalive` caps at 64 KiB | [0028](../../adr/0028-autosave-under-keepalive-cap.md) |
| Documents | Sanitised at the boundary, by walking them | [0029](../../adr/0029-document-sanitised-at-the-boundary.md) |
| Services | One context of ports; a double never re-implements a correctness component | [0030](../../adr/0030-service-context-of-ports.md) |
| Vendored lint | Vendored primitives are a separate regime, applied where its glob resolves | [0031](../../adr/0031-vendored-primitives-separate-lint-regime.md) |
| Sessions | One encrypted cookie, the admin's; a share link authenticates from its URL and holds no cookie | [0032](../../adr/0032-two-cookies-url-wins.md), [0040](../../adr/0040-link-surface-url-token-authority.md) |
| List payloads | The project list ships a share-link **count**, never share links | [0033](../../adr/0033-list-ships-no-share-tokens.md) |
| Manifest | `TaskEntry` carries what a list row renders | [0034](../../adr/0034-task-entry-carries-list-row.md) |
| Share links | Renamable, role changeable; scope still immutable | [0035](../../adr/0035-share-links-renamable-role-changeable.md) |
| Shared facts | Caps, problem codes and the document walk live in `contracts` | [0036](../../adr/0036-wire-facts-live-in-contracts.md) |
| Share URLs | `/s/<token>`, plus `/t/<taskId>` when the scope is a project; `/share/` 308s | [0037](../../adr/0037-share-url-shape.md) |
| UI gating | Controls gate on role **and** scope, never role alone | [0038](../../adr/0038-capabilities-role-and-scope.md) |

Also settled, without needing a record of their own: one shared `ADMIN_PASSWORD`; Macroplan ships as
a working shell; deploy is one compose file with three services and two domains.

Two things are deliberately **not** settled, and are called out where they matter rather than
guessed: the end-to-end Zod-`.meta()`-to-OpenAPI path (ADR 0024 — a short spike before
implementation), and everything Coolify-specific, above all whether Coolify renames named volumes
(ADR 0026, §15.1 step 1 — verified on the server before cutover).

### 3.1 Deliberately not built

Named here so their absence reads as a decision rather than an oversight.

**No realtime and no polling.** The app being replaced had neither — an admin does not see a client's
edits without a reload — and that is unchanged on purpose, not overlooked.

**No relative-move route.** `POST …/tabs/:tabId/move {direction}` does not exist; the app computes a
permutation and calls `…/tabs/reorder`. See §8.2.

**No token refresh route.** Minting a bearer needs the password, so a refresh route would either
hold the password or mint tokens from tokens. `mt_admin`'s lifetime tracks the bearer instead, which
turns expiry into a clean re-login (ADR 0032).

**No `/healthz` method on `@repo/api-client`.** The probe is for Docker and compose, and it takes no
credential; a typed client method would only invite a page to call it.

**Import/export comes last**, by instruction. That means **cutover stays blocked on it**, and this
phase does not claim otherwise: every step of the runbook in §15.1 from step 4 onwards depends on
the importer existing.

## 4. Domain model

```
Project ──┬─ Folder[]      flat, positioned, one level
          ├─ Task[]        folderId: string | null   ← today's Project, renamed
          │    └─ Tab[] ── Tiptap ProseMirror JSON
          └─ ShareLink[]   scope: project | task
```

A Project is a **phase or workstream** (Discovery, Build, Launch), not a client. That has a direct
security consequence, handled in §6: a phase spans clients, so a project-scoped link can expose one
client's work to another.

## 5. Storage

One directory per project. Today one project is one file; with tasks × tabs × 2 MB documents that
file would balloon and every keystroke would rewrite all of it.

```
data/microtask/projects/<projectId>/
  project.json          manifest: name, folders[], tasks[] (id/name/position/folderId +
                        progress/updatedAt/tabCount/tabNames as cache),
                        shareLinks[] (project- and task-scoped), timestamps
  tasks/<taskId>.json   tabs[] only
data/macroplan/…        reserved, same shape rules
```

Task name, position and `folderId` live **only** in the manifest, so there is nothing to drift.
Task files hold only tabs. This buys: autosave rewrites one small file, search is one read per
project, and the boot-time token index reads only manifests.

`TaskEntry` also carries `updatedAt`, `tabCount` and `tabNames` — the first eight, matching the
legacy `slice(0, 8)` chips — on the same terms as `progress` (ADR 0034): the task file is the source
of truth, the entry is a cache written by the same operation, and a stale entry is recomputed on
read of that task. All three are free, because the mapper already reads the whole task document to
count progress. Without them the tab count, the name chips and "updated 3h ago" have no data source
but a full read per row.

### 5.1 Invariants

- **Every disk path is built by exactly two helpers** — `projectDir(projectId)` and
  `taskFile(projectId, taskId)`. Each asserts `isUlid()` on its arguments, then asserts
  `path.resolve(p).startsWith(path.resolve(ROOT) + path.sep)`, throwing `Invalid` otherwise.
  Nothing else in `packages/store` may call `path.join`. This closes reads, writes, the tmp+rename,
  and the recursive delete behind import's `replace` in one place.
- **Write ordering replaces the lost atomicity.** One file per project meant `tmp` + `rename` *was*
  the commit. It no longer is, so: **create/update writes the task file first, then the manifest;
  delete writes the manifest first, then unlinks.** A crash can then only ever leave a file nobody
  references — harmless garbage — never a manifest entry pointing at a missing file.
- **Defensively**, `packages/store` treats a manifest entry whose task file is missing or unparseable
  as a single unreadable task. It surfaces in the UI as broken; it never fails the whole project.
- **A share token belongs to exactly one project.** Enforced at import (§7) and asserted at boot.
- Positions stay dense `0..n-1` for folders, tasks-within-folder, and tabs.
- `updatedAt` is *not* stamped by import — see §7.4.

### 5.2 Progress is derived, then cached

Progress must not be stored as a source of truth — it is counted from `taskItem` nodes, as today.
But a project's overall progress now needs every task file, so a list of 20 projects would read the
whole workspace. So: the manifest caches `{ done, total }` per task, written by the same operation
that writes the task's document, and the source of truth stays the document. A missing or stale
cache entry is recomputed on read of that task. List and search views use the cache only.

## 6. Roles and access

```ts
type Role      = 'view' | 'write' | 'manage'
type Principal = { kind: 'admin' } | { kind: 'link', role: Role, scope: Scope, token: string }

// pure, no I/O, unit-tested as an exhaustive role × action matrix
can(principal: Principal, action: Action, target: Target): boolean
```

**A role alone does not decide anything — a role and a scope do.** The columns below are
`role × scope`, because scope containment refuses a `folder` target outright and refuses every
`project:*` action except `project:read`, so a task-scoped holder of a role can do strictly less
than a project-scoped holder of the same role. `T` is task scope, `P` is project scope.

| | view T | view P | write T | write P | manage T | manage P | admin |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| read its own task and tabs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| read the project's name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| read sibling tasks, the folder tree, folder names | | ✓ | | ✓ | | ✓ | ✓ |
| edit documents, tick checklist items | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| create / rename a tab in its own task | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| create / rename a task or folder | | | | ✓ | | ✓ | ✓ |
| delete / reorder / move between folders | | | | | tabs only | ✓ | ✓ |
| mint a share link within its own scope | | | | | ✓ | ✓ | ✓ |
| list and revoke the project's share links | | | | | | ✓ | ✓ |
| rename or delete the project itself | | | | | | ✓ | ✓ |
| export | | | | | | ✓ | ✓ |
| list all projects, create project, import | | | | | | | ✓ |

`manage` is admin **within its scope** and blind outside it — that is the "everything except top
level" line. Import is admin-only because an import can create projects.

The asymmetry in the `manage T` column is real and is the reason this table has a scope axis at all:
minting is authorized against the **new link's** scope, while listing and revoking are authorized
against the project, so a task-scoped `manage` holder can mint a link it can then neither list nor
revoke. The UI must not render from role alone — `capabilities(role, scope)` in `@repo/contracts`
returns this table, and a contract test holds it to `can()` for every triple (ADR 0038).

### 6.1 Two rules that are not in the matrix

**Collection and top-level actions are deny-by-default.** `can()` is keyed on a target, so any
route whose target is a *collection* (`GET /projects`, `GET /search`, `GET /export`) has no natural
target to check and would default open. Every such route names its required principal explicitly,
and `AccessPolicy` has no wildcard branch. A link principal calling a collection route gets results
filtered to its scope or a 403 — never an unfiltered list.

**Revocation cascades.** Delegation is unbounded, as chosen — a `manage` link may mint further
`manage` links. That is only safe if revocation actually revokes, so every link records
`createdBy: token | null`, and revoking a link revokes every link descended from it. Without this,
revoking a manager leaves behind links they created and there is no way to find them.

### 6.2 Default share scope

A Project is a phase, so a project-scoped link exposes every client's work in that phase. Therefore:

- New links default to **task scope**.
- Project scope is available, but the confirm dialog lists every folder and task the link will
  expose before it is created.
- A link's scope is immutable after creation. Changing scope is revoke-and-reissue.

## 7. Import and export

The migration path for live production data, so it is specified in full rather than as a feature.

### 7.1 Export

```
GET /v1/microtask/projects/:projectId/export    one project bundle (.json)
GET /v1/microtask/export                        whole workspace (.json)
```

```json
{ "format": "ccg.microtask", "version": 2, "exportedAt": "…", "bundleId": "01M…", "projects": [ … ] }
```

`bundleId` exists so "did I already import this?" is answerable.

**An export contains live share tokens in plaintext** — it is a credential dump, not just data. The
export dialog says so, and offers `?tokens=strip`, which omits share links entirely. Stripping is
the default for a manual download; preserving is opt-in and is what the migration uses.

### 7.2 Import — drop a file, files, a folder, or a zip

Admin-only. Accepts loose `.json` files, a whole directory tree, or a `.zip`.

**Zip is expanded server-side in the API**, never in the browser: the browser has no ZIP container
primitive, so a client-side reader would mean a dependency in the browser bundle. The API's
expander enforces entry-name rejection (`..`, absolute, drive-letter), symlink rejection, an
uncompressed-size cap, a compression-ratio cap, and an entry-count cap.

**Files are sniffed by group, not individually.** This is not cosmetic — sniffing each file alone
breaks the app's *own* directory export: `project.json` would import fine with its task manifest
while every `tasks/*.json` is discarded as "unrecognised shape", producing structurally valid
projects with all documents gone, behind a preview that truthfully said "3 projects, 9 tasks".

So: bucket every file by directory first (`File.webkitRelativePath` for a pick,
`FileSystemEntry.fullPath` for a drop), then classify each bucket. Four recognised shapes:

| Shape | Detected by |
| --- | --- |
| v2 workspace bundle | `format` + `version`, `projects[]` |
| v2 single project | `format` + `version`, one project |
| **v2 project directory** | a directory containing `project.json`; its `tasks/*.json` are members |
| legacy Microtask project | `{ id, name, tabs[], shareLinks[] }`, no `format` key |

A `tasks/*.json` orphan with no sibling `project.json` is an **error naming the missing manifest**,
never a generic skip.

### 7.3 Preview, then confirm

Nothing touches disk until confirmed. The preview shows counts **and every share link with its role
and scope** — a bundle can assert `role: 'manage'` with an attacker-chosen token, and a counts-only
preview would hide that.

It also runs, and blocks on, these checks:

- **Manifest/file cross-check** per project: "tasks in manifest: 9, task files found: 9". A mismatch
  blocks the import rather than warning.
- **Token uniqueness**, both within the drop set and against what is already on disk.
- **Scope containment**: every share link's scope must resolve inside the project it arrived with. A
  link scoped to a `taskId` in another project is rejected.
- **Id validity**: any id failing the ULID pattern is rejected, not sanitised.
- **Document validation** (§7.5).

Uploads go through a route handler, one file per request with bounded client concurrency, because
Server Actions cap request bodies at 1 MB and a workspace bundle exceeds that immediately.
Sniffed-and-previewed files are staged server-side under an import-session id; confirm references
that id rather than re-posting the payload.

### 7.4 Conflict handling and identity

Per project: **skip**, **import as new**, or **replace**.

- **`replace` preserves tokens** — same project identity, same links. It removes tasks absent from
  the bundle (it is a replace, not a merge) and keeps existing share links that the bundle does not
  mention.
- **`import as new` must remint every share token.** The original project is still on disk still
  serving those URLs, so preserving tokens would put one token in two projects — and the token index
  is single-valued, built in `readdir` order, so which project a live client link opens would flip
  on restart. Reminting also rewrites: manifest task ids, share-link `scope.taskId`, `createdBy`
  lineage, and the task filenames themselves. The preview states it plainly: *"3 share links will
  get new URLs; the existing project's links keep working."*
- **Import does not stamp `updatedAt`.** The current write path stamps it unconditionally; if import
  did too, every imported project would sort to "just now" and round-tripping would never be stable.
  Import writes the timestamps the bundle carries.

### 7.5 Untrusted documents

An imported document is rendered in the admin's own browser, so today's `isValidDoc` (type is
`doc`, `content` is an array, ≤ 2 MB) is not enough. Import additionally enforces: a maximum node
depth, so the recursive `countTasks` walk cannot blow the stack; rejection of `__proto__`,
`constructor` and `prototype` as object keys; and an href scheme allowlist on `link` marks
(`http`, `https`, `mailto`, `tel` — no `javascript:`, no `data:`).

### 7.6 Legacy mapping

- old project → **Project**
- each old **tab** → a **Task** holding that document in a single `General` tab
- old `shareLinks` → **project-scoped** links, `write → write`, `read → view`
- **a legacy link with no `permission` field maps to `write`, not `view`.** Today's
  `normalizeShareLinks` treats a missing permission as `write`, so the oldest links in circulation
  are write-capable. Mapping them to `view` would silently take away access clients currently have.
- tokens preserved; ids preserved

## 8. API

One route tree, two principal kinds. Today `server.js` duplicates every mutation between an admin
branch and a separate `/api/share/:token` branch; that duplication is deleted.

### 8.1 Credentials

**Both** headers are required on every non-public route:

```
x-api-key: <service key>            service identity — which app is calling
Authorization: Bearer <token>       principal identity — admin token, or share token
```

`x-api-key` alone resolves to **no principal and 401s.** This is the single most important change
the review produced: if the service key alone meant "admin", then every Server Action in a Next app
would carry admin authority, and a visitor on a read-only `/s/<token>` page could reach admin
actions — `AccessPolicy` would never see a link principal at all.

`POST /v1/auth/login` verifies `ADMIN_PASSWORD` and returns a short-lived signed admin token. The
API therefore always has a real principal, and `AccessPolicy` is genuinely the only gate.

### 8.2 Routes

Namespaced per product from day one, because Macroplan has its own entities.

```
POST   /v1/auth/login                      no logout route — see below
GET    /v1/microtask/projects · POST /v1/microtask/projects
GET|PATCH|DELETE  /v1/microtask/projects/:projectId
       /v1/microtask/projects/:projectId/folders[/:folderId]
POST   …/folders/reorder
       /v1/microtask/projects/:projectId/tasks[/:taskId]
POST   …/tasks/reorder
POST   /v1/microtask/projects/:projectId/tasks/:taskId/move        between folders
       /v1/microtask/projects/:projectId/tasks/:taskId/tabs[/:tabId]
PUT    …/tabs/:tabId/document
POST   …/tabs/reorder                      a permutation, not a relative move
       /v1/microtask/projects/:projectId/share-links[/:token]
PATCH  …/share-links/:token                {name?, role?} — ADR 0035
GET    /v1/microtask/shares/current        bootstrap: what this link sees + its role
GET    /v1/microtask/search?q=
POST   /v1/microtask/imports · POST /v1/microtask/imports/:sessionId/confirm
GET    /v1/microtask/export · /v1/microtask/projects/:projectId/export
GET    /v1/macroplan/…                     reserved
GET    /openapi.json · /docs · /healthz    root, above the /v1 mount
```

**Reordering is a permutation, not a relative move.** There is no
`POST …/tabs/:tabId/move {direction}` — the legacy pair of one-step swaps is replaced by
`POST …/{collection}/reorder` taking the full order, for folders, tasks and tabs alike. The app
computes the permutation, so a drag that moves an item three places is one request and one write
rather than three, and a reorder is idempotent against what the client believed the order was.

**The three meta routes sit at the root, not under `/v1`.** `/openapi.json`, `/docs` and `/healthz`
are properties of the process rather than of an API version, and they are registered before the
`/v1` mount because a `route()` call copies an already-complete child (ADR 0024).

**There is no `POST /v1/auth/logout`, deliberately.** The admin bearer is a self-contained HMAC the
API cannot revoke without a store, and rotating `SESSION_SECRET` would sign out every admin at once.
Logout clears the Next cookie; the bearer stays valid until it expires. ADR 0032 records that limit
rather than letting an absent route imply it. There is no refresh route either — minting a token
needs the password, and `mt_admin`'s lifetime makes expiry a clean re-login.

Two further deliberate choices: **`reorder` and `import` are real endpoints**, because they are role
actions and "everything consumable via API" is a requirement. And **the bootstrap route takes no
token in its path** — `/shares/current` reads the token from the `Authorization` header like every
other route, keeping the credential out of server logs and `Referer`.

### 8.3 Writes are conditional

`PUT …/document` requires an `If-Match`-style precondition carrying the tab's last known
`updatedAt`. A mismatch is `409`. Without this, the keepalive flush on unload — the request most
likely to arrive late — can overwrite content saved after it was queued.

## 9. Data flow

```
browser ──encrypted httpOnly cookie──> Next server ──x-api-key + Bearer──> apps/api ──> data/
```

**One cookie, for the admin; a share link carries its own authority** (ADR 0032, and ADR 0040 for
links). `mt_admin` holds the admin session after password login and is read by every route except
`/s/*`. A link's credential is the token in its URL, taken from the route on every page and handed
to every Server Action under `/s/*` as its argument, so nothing under `/s/*` reads or writes a
cookie, and an admin opening a client link keeps their own session — the single most common thing
an admin does while testing a link. ADR 0032 kept the token in an `mt_link` cookie between
navigations, overwritten by every visit; ADR 0040 drops that cookie entirely.

**The URL is the authority.** No stored copy of a token exists for it to disagree with, so the link
a client sees in the address bar is the only link that can act.

**`mt_admin` is AES-256-GCM encrypted and authenticated, not merely signed.** Its payload carries the
admin's bearer, a live credential, and `Path=/` sends it on every request, so integrity alone is not
the property needed. `COOKIE_SECRET` (32 bytes or more) is required at boot, read by the same single
module that reads `API_KEY`, and distinct from the API's `SESSION_SECRET`.

**Its lifetime matches the credential behind it.** `mt_admin` takes its `Max-Age` from the bearer's
own `expiresInSeconds`. The legacy 30-day cookie against a one-hour bearer is the defect being fixed.

**401 handling is per surface**, and the blanket "any 401 goes to `/login`" is wrong: an admin 401
redirects to `/login?next=<pathname>` — which also fixes the legacy deep-link loss — and clears
nothing, because the browser retires `mt_admin` when its bearer expires (ADR 0032, as amended). A
share link that no longer resolves — revoked, or a segment that cannot be a token — lands on the
static `/s/unavailable` page, which clears nothing either, since there is no link cookie to clear.
A client is never shown a password form.

**Exactly one file per app may read `process.env.API_KEY`** (`apps/*/lib/api.ts`). It exports
`apiForSession('admin')`, which builds an admin client from `mt_admin` and admits no other audience,
and `apiForLink(token)`, which builds a link client from the token in an `/s/*` URL once it has the
shape of a share token (ADR 0040). `packages/api-client` exports two non-interchangeable
constructors with distinct branded types, has no default export, and reads no environment variable —
so a component cannot accidentally obtain admin authority. An ESLint boundary rule enforces the single reader.

**Server Actions, except anything that moves bytes.** Actions cap at 1 MB, cannot return a `Response`
with `Content-Disposition`, cannot be dispatched on unload, and are dispatched one-at-a-time per
client. So three route handlers exist: import upload, export download (streams the API response
through), and autosave. Actions keep the small structural mutations — rename, reorder, create,
delete, and "confirm this staged import".

## 10. Pages and per-role views

### 10.1 Routes

```
/                          projects list — search, folders, create        admin
/projects/:projectId       folder + task tree, share manager, export      admin
/projects/:projectId/tasks/:taskId?tab=<tabId>   tab bar + editor         admin
/import                    drop zone, preview, confirm                    admin
/login[?next=<pathname>]   admin sign-in                                  admin
/s/:token?tab=<tabId>      task-scoped link: the task itself              link
/s/:token                  project-scoped link: its task list             link
/s/:token/t/:taskId?tab=<tabId>   project-scoped link: one task           link
/share/:token              308 → /s/:token                                (continuity)
```

The client surface is two shapes, not one, and which one a token gets is decided by its scope at
bootstrap (ADR 0037). A single `/s/:token?tab=` cannot address a project-scoped link, because a tab
id is only meaningful inside a task — so it would name a tab without naming which task. Every `/s/*`
route is `noindex`; the legacy app marked one page, and here the client surface is a subtree.

### 10.2 The project page

```
← Projects
Launch                                    Overall 72%   [ Import ] [ Share ]
──────────────────────────────────────────────────────────────────────────────
  Search tasks and folders…                                        [ + Task ] [ + Folder ]
──────────────────────────────────────────────────────────────────────────────
▾ ACME                                                                    8/11
    Go-live                          4/6 ▓▓▓▓░░
    DNS cutover                      4/5 ▓▓▓▓▓░
▾ Beta Co                                                                 2/7
    Kickoff                          2/7 ▓▓░░░░
  Hosting notes                      0/0            ← task at project root
```

Search filters this tree in place — it is names-only, so it is a client-side filter over the
manifest the page already has, and `GET /v1/microtask/search` serves the cross-project case on the
projects list. A search result never shows a name outside the caller's scope.

**A project in a list carries `shareLinkCount`, not `shareLinks`** (ADR 0033). Tokens appear only on
`projects.read()`, which is the request that renders the share manager. The count is what the legacy
"· N share links" row needed anyway, and the reason is not payload size: anything a Server Component
hands a client component — such as this in-place filter — is serialised into the Flight stream and
lands in the HTML, so a list carrying links would put every share token in the page source.

### 10.3 What each role sees at `/s/:token`

Every row here is `capabilities(role, scope)`, never `role` on its own (ADR 0038). `T` is task
scope — the default — and `P` is project scope.

| | view | write | manage T | manage P |
| --- | --- | --- | --- | --- |
| Badge | "View only" | "You can edit" | "You can edit" | "You can edit" |
| Editor | not editable; checkbox `disabled` | editable | editable | editable |
| Toolbar | hidden | shown | shown | shown |
| Tab `+` | — | ✓ | ✓ | ✓ |
| Tab menu | — | Rename | Rename · Move · Delete | Rename · Move · Delete |
| Task / folder create | — | P only | — | ✓ |
| Delete / reorder | — | — | tabs only | ✓ |
| Share manager | — | — | **mint only, no list** | ✓ (own scope) |
| Export | — | — | — | ✓ |

**Corrected after the fact (2026-09-12).** Two cells above described a build that never happened,
and the code is right in both. The **Badge** row promised a third string, "You manage this", for a
`manage` link; `components/link/access-badge.tsx` draws two, chosen by
`capabilities(role, scope)['tab:write']`. Legacy had two permissions and two badges, so the third
string was a spec invention, and at task scope it would name an authority the page does not hand
over — a task-scoped `manage` holder is shown no share list (below). The **Editor** row said a
read-only checkbox "snaps back"; it is `disabled`, so neither a pointer nor a key reaches it.
[ADR 0043](../../adr/0043-client-head-names-no-visitor.md) decides the badge,
[ADR 0042](../../adr/0042-three-parity-departures-on-the-surfaces.md) the checkbox.

A task-scoped link shows only its task — never sibling task names, never the folder tree, and
therefore no breadcrumb (ADR 0011). A task-scoped `manage` holder is shown no share list, because
listing and revoking are authorized against the project it cannot name; that is why the table needs
the scope column, and why rendering from role alone would put a 403 behind a button.

## 11. Feature parity with the app being replaced

These behaviours are load-bearing and were recorded nowhere but the code. The complete inventory —
71 features, 25 routes, 41 non-obvious behaviours, captured from `apps/legacy` immediately before it
was deleted — is [`../../parity/legacy-microtask.md`](../../parity/legacy-microtask.md). What follows
is the subset that shapes the design; the inventory is the checklist, and each of its rows is either
reproduced or deliberately dropped by a named decision.

**`apps/legacy` is deleted at the end of this phase, not the start.** It is the only record of
behaviour documented nowhere else, so the order is: capture the inventory, build to parity, then
delete. `legacy-prod` is tagged at `6184c9d` so the running code stays recoverable after the
directory is gone.

**Autosave** — 700 ms debounce; `flush()` awaited before a tab switch and on `Ctrl/Cmd+S`. States:
`Saving…` / `Saved` / `Not saved — retrying…`, retrying after 4 s. `dirty` clears before the request
and is restored on failure. Deleting a tab clears `dirty` first so the deleted tab's document is not
resurrected. The browser's unsaved-changes prompt on `beforeunload` stays.

**This is the one behaviour deliberately *not* carried over as-is.** Today both flush paths use
`fetch` with `keepalive`, which is capped at 64 KiB against a 2 MB document limit — so it already
fails silently on real documents. Replaced per ADR 0028: `visibilitychange → hidden` sends a normal
request, and `beforeunload` attempts a keepalive flush only under 50 KB. A 409 from the precondition
in ADR 0016 is not retryable.

**Tab bar** — clicking the *active* tab opens its menu, clicking another switches, right-click opens
any tab's menu. Menu is Rename · Move left (disabled at first) · Move right (disabled at last) ·
Delete (danger, disabled at one tab, confirm required). After delete, selects `tabs[index - 1]`.
The active tab scrolls into view; the bar scrolls horizontally on mobile. Per-tab `done/total`
badges are patched in place on keystroke, not re-rendered.

**Progress** — derived from `taskItem` nodes. Per tab `4 / 6 completed` or `No checklist items in
this tab`; overall `Overall progress: 72%` or `No tasks yet`; bar animates on
`requestAnimationFrame` and takes a `done` state at 100 %.

**URLs** — `?tab=` is validated against the **task's** own tabs and falls back to the first tab, so
a token can never reach another task's tab. Written with `replaceState`, so tab switching adds no
history entries.

**Title editing** — an uncontrolled `<input type="text">`; Enter blurs, Escape reverts, blur saves
when changed, whitespace collapses, empty reverts. A re-render never overwrites the field while
focused. **Corrected after the fact (2026-09-12):** this said `contenteditable="plaintext-only"`.
It is an `<input>` — `components/task-tree/inline-name.tsx` — and the code is right: the field
holds a name of at most 80 characters, so it takes `maxLength={LIMITS.nameLength}` straight from the
contract, an accessible name from `aria-label`, and `spellCheck={false}`, none of which a
`contenteditable` span has without re-implementing them. Every behavioural clause in the sentence
survived the change of element: `inline-name.test` pins Enter, the Escape that sends nothing, the
empty value that restores with no request, and both "never overwrites while the user is typing"
cases.

**Share manager** — name + role per link; row shows name (or "Unnamed link"), role badge, readonly
URL, Copy (clipboard API with `execCommand` fallback), and a menu with Rename · role changes
(current one disabled) · Revoke (danger, confirm). Empty state: "No links yet — add one above."
Rename and the role changes are the two controls that need `PATCH …/share-links/:token` (ADR 0035);
without it the UI can only revoke and recreate, which mints a new token and silently breaks the
client's bookmark. Rendered only where `capabilities(role, scope)` allows it, which is never for a
task-scoped holder.

**Editor** — StarterKit with headings 1–3, `codeBlock` spellcheck off, TaskList, nested TaskItem
with no `onReadOnlyChecked`, Link with `openOnClick: !editable`, autolink, `linkOnPaste`,
`rel="noopener noreferrer nofollow" target="_blank"`, and a placeholder only when editable. Toolbar `B I S </> | H1 H2 H3 | ☑ • 1. ❝ ― | 🔗`, `mousedown` prevented so the
selection survives. The link dialog removes the mark on empty input and prefixes a schemeless value
with `https://`. **Corrected after the fact (2026-09-12):** `no onReadOnlyChecked` is exactly what
is configured, but this sentence carried "(so read-only checkboxes snap back)" and no viewer reaches
that. A read-only editor also gets a node view that sets `disabled` on the checkbox, so the pointer
and the key are both stopped before the snap-back has anything to undo; the omission is the floor
under it rather than the mechanism
([ADR 0042](../../adr/0042-three-parity-departures-on-the-surfaces.md)).

**Tiptap 3.31.3, and it lives in `apps/microtask`.** The editor is app code, not a `packages/ui`
component, and the `@tiptap/*` set is catalogued in `pnpm-workspace.yaml` at one exact version and
bumped as a unit. **Why it is not shared, and the measurement behind every setting below, is
[ADR 0039](../../adr/0039-tiptap-in-the-app-and-v3.md)** — including the one that matters most: the
stored document format is unchanged from the app being replaced, so there is no migration. What to
build:

- **`StarterKit.configure({ ... })` and nothing alongside it.** The `Link` options go *inside* it —
  v3 bundles `Link`, and a separate `Link` extension is a duplicate-name error. Also
  `trailingNode: false` (required: it otherwise rewrites any tab ending in a `taskList` on the first
  keystroke), `undoRedo` rather than `history` (a `history` key is silently ignored), headings 1–3,
  `codeBlock` spellcheck off. `Underline` is in the schema now; validation must accept the mark.
- **`TaskList` / `TaskItem` from `@tiptap/extension-list`, `Placeholder` from `@tiptap/extensions`.**
  The old `extension-task-list` / `-task-item` / `-placeholder` packages are re-export shims.
- **`useEditor({ ..., immediatelyRender: false })`**, required under the App Router; it types the
  editor as `Editor | null`, which is what it is on first render, so every access is null-guarded.
  Toolbar state comes from `useEditorState({ editor, selector })`, not from `onSelectionUpdate` /
  `onTransaction` — `shouldRerenderOnTransaction` defaults to `false` in v3.
- **`generateHTML` / `generateJSON` from `@tiptap/core`.** `@tiptap/html` is not a dependency; it
  takes a non-optional `happy-dom` peer.
- **The production documents in `data/projects/` are test fixtures.** Two checks, both of which fail
  if a bump breaks compatibility or the `trailingNode` option is dropped:
  `getSchema(...).nodeFromJSON(doc).check()` with an unchanged progress count (12 `taskItem` nodes,
  12 checked), and one transaction against a tab ending in a `taskList` asserting 2 root children in,
  2 out.
- **Peer dependencies are not optional.** `@tiptap/react` requires `@types/react` and
  `@types/react-dom`; omitting either reproduces as `ERR_PNPM_PEER_DEP_ISSUES`.
- **No new `allowBuilds` entry is needed.** Nothing in the Tiptap/ProseMirror graph declares
  `preinstall`, `install` or `postinstall`, and `prepare` does not run for registry tarballs.

**Caps and invariants** — names collapse whitespace, trim, max 80 chars; ≤ 40 tabs per task;
≤ 50 share links per project; documents `type: 'doc'` with an array `content`, ≤ 2 MB; request
bodies ≤ 4 MB → 413; a task always keeps ≥ 1 tab; positions stay dense. **These caps now also bound
what an untrusted `write`/`manage` link holder can create**, and gain companions: max tasks per
project, max folders per project, max projects.

**Auth** — `ADMIN_PASSWORD` required at boot, process exits without it, warns under 8 characters;
constant-time comparison; `HttpOnly; SameSite=Lax`, `Secure` when `x-forwarded-proto` says HTTPS.
`/healthz` stays unauthenticated. **Changed** per ADR 0032 and ADR 0040: an admin cookie encrypted
rather than signed, with its bearer's `Max-Age` rather than a flat 30 days; a share link that
carries its authority in its URL and sets no cookie; and 401 handling per surface — a client never
sees `/login`, and a link that no longer resolves lands on `/s/unavailable`. **New:** login
throttling. **Not built:** there is no
session invalidation path, and the reason is recorded rather than left as a gap — the bearer is a
self-contained HMAC the API cannot revoke without a store, and rotating `SESSION_SECRET` would sign
out every admin at once.

**Conflicts are surfaced, not hidden.** Legacy document saves were last-write-wins: two tabs editing
one document silently overwrote each other. The API requires `If-Match` (ADR 0016), so the app holds
`updatedAt` and renders a 409 as "someone else saved this tab" with a reload affordance. This is a
visible behaviour change from the app being replaced, and an improvement, so it is stated rather
than smoothed over.

**Small things that were bugs once** — a conditional child must not render as the literal string
`"null"` (the fix in `HEAD`); popup menus reposition inside the viewport, flip when they overflow,
and mount inside `dialog[open]` so the top layer does not hide them; `relativeTime` renders
`just now / Nm / Nh / Nd / locale date`.

**Corrected after the fact (2026-09-12).** Two clauses stood in that list and neither describes what
was built.

- **"toasts auto-hide at 2600 ms".** There are no toasts. Every outcome is said beside the control
  that caused it, as a `status` or an `alert`, or shown by the change itself: a refused sign-out
  beside the button, a rename's refusal under the field, a save's state in the indicator, a list
  that could not load said in place of the list. `sonner` is vendored in `packages/ui` and mounted
  nowhere, and `2600` appears in no source file of `apps/` or `packages/`. The code is right: a
  toast is a message that leaves, which is the wrong shape for a refusal the reader has to act on,
  and legacy demonstrated both failure modes — it toasted "Link copied" even when the copy failed,
  and toasted a 403 every four seconds forever (ADR 0016, last amendment). This correction is the
  record parity feature 60 and U22 were waiting for; they are changes, not gaps.
- **"code assets are `no-cache` and images `max-age=86400`".** Nothing in the app sets either. The
  only `Cache-Control` it sets anywhere is `private, no-store`, on `/s/*` and `/share/*`
  (`next.config.ts`, ADR 0040); everything else is whatever Next serves, and `proxy.ts`'s matcher
  deliberately excludes `_next/static`, `_next/image`, `favicon.ico` and `img/`. The code is right
  not to hand-roll the first half: `_next/static` URLs are content-hashed, so `no-cache` on them
  would re-fetch an immutable file on every load. The second half is a real difference rather than
  an equivalence, and it is **unmeasured**: `public/img/logo.webp` is not content-hashed and legacy
  cached it for a day, while what Next serves it with here has not been checked — that needs a
  running production build, not a test.

## 12. Errors

`AppError` subclasses in `packages/kernel` — `NotFound`, `Forbidden`, `Invalid`, `Conflict` — mapped
by one Hono error middleware to RFC 7807 JSON, every variant declared in the OpenAPI document. Zod
failures become 422 with field paths. A 403 never reveals whether the target exists.

**The code set is a published contract, not a private table.** `ProblemCode`, `Problem` and
`ValidationProblem` live in `@repo/contracts` and `apps/api/src/http/problem.ts` imports the code set
rather than defining it, so a code the app switches on is the same list the API can emit (ADR 0036).
`errorFrom` in `@repo/api-client` keeps the extension members — `in`, `errors[]`, `maxBytes` — which
is the difference between "something went wrong" and a form that points at the field, or a message
naming the cap a 413 hit.

## 13. Testing

Vitest. The role × action matrix is exhaustive and includes the collection and top-level routes from
§6.1. Services run against in-memory repositories. `packages/store` runs against a temp directory,
including crash-ordering tests: kill between the two writes of each mutation and assert the
self-healing rule. The importer is fixture-driven, with fixtures for each recognised shape, the
`tasks/*.json` orphan, a token collision, a cross-project scope, a `__proto__` key, a
`javascript:` href, and a zip with a traversal entry. API routes go through Hono's `app.request()`,
with a case asserting that a service key without a principal token 401s.

## 14. Monorepo layout

```
pnpm-workspace.yaml     workspaces + catalog (zod pinned once) + overrides
turbo.json              build · lint · test · openapi
apps/
  api/                  Hono on @hono/node-server; wiring only. Owns the data volume.
  microtask/            Next 16 App Router. Takes over the live FQDN.
  macroplan/            Next 16 App Router. Working shell.
packages/
  kernel/               roles, AccessPolicy, ids, errors, repository ports, transfer framework
  microtask-domain/     Project, Folder, Task, Tab + their services
  macroplan-domain/     stub — the seam, reserved
  contracts/            Zod schemas, the wire facts both sides need, capabilities().
                        Runtime dependency: `zod` and nothing else. `kernel` is a devDependency,
                        for the contract test only.
  store/                filesystem adapters implementing kernel's ports
  api-client/           typed HTTP client; two non-interchangeable constructors
  ui/                   shadcn/ui + Tailwind v4 + app shell, dialogs, theming
                        (no editor — ADR 0001 puts the unshared thing in the app)
  typescript-config/ · eslint-config/
```

**`packages/contracts` holds more than schemas**, and the line is drawn narrowly (ADR 0036). The
facts a browser needs in order to behave live there and are imported *from* there by
`@repo/microtask-domain`, so there is one definition of each: `LIMITS`, `MAX_DOCUMENT_BYTES`,
`MAX_DOCUMENT_DEPTH`, `SAFE_HREF_SCHEMES`, `emptyDocument()`, `countTasks()`, the closed
`ProblemCode` set with `Problem` and `ValidationProblem`, and `capabilities(role, scope)`. What may
live here is a value or a pure function over a document; what may not is anything that throws a
domain error or touches a port — so `cleanName()` and `assertWithin()` stay in the domain. Without
this the app hard-codes `40` and `80` and `2 MB`, re-implements the `taskItem` walk for its
optimistic progress badge, cannot map a 422 to the field that caused it, and cannot tell a user
which cap a 413 hit.

`@repo/api-client` changes with it: `errorFrom` preserves `in`, `errors[]` and `maxBytes` instead of
discarding them, the path helpers in `paths.ts` join the barrel, and `Call` gains an optional
`signal` so a debounced search can be cancelled.

**Compiled vs raw source.** `kernel`, `contracts`, `store` and the domain packages are compiled
(`tsc` → `dist`, `exports` pointing at `dist` with types), because `apps/api` is plain Node and
cannot import `.ts` — Node's type stripping is unusable here, since it ignores tsconfig `paths`,
needs explicit import extensions and rejects `.tsx`. `packages/ui` ships **no** build step: per-file
subpath exports point at raw source and Turbopack transpiles it. No barrel file (ADR 0025).

`transpilePackages` is not needed — Turbopack transpiles workspace packages automatically under both
routers.

The dependency graph needs mechanical enforcement rather than good intentions:

```
apps/api      ──> packages/{kernel, microtask-domain, macroplan-domain, contracts, store}
apps/microtask
apps/macroplan ──> packages/{contracts, api-client, ui}        and NOTHING else
```

**A Next app must not be able to import `packages/store`.** If it can, it can bypass the API and
write files directly — two write paths to one volume, two lock domains, and the single-writer
assumption ADR 0002 relies on is gone. Enforced by package `exports` plus an ESLint boundary rule,
not by convention.

## 15. Deploy and cutover

Three images from `node:24`, one `turbo prune <pkg> --docker` each, Next apps built to standalone
output with `outputFileTracingRoot` set to the monorepo root and started from their **nested** path
(`node apps/<app>/server.js`). One compose file; the existing volume referenced `external: true` by
its real name and mounted on `api` only; no `ports:` and no `networks:` block, since Coolify supplies
both. Full mechanics and the reasoning are in ADR 0026.

### 15.1 Cutover runbook

Ordered, because the ordering is the safety (ADR 0022):

1. **Verify the Coolify volume name on the server**, before anything else. Whether Coolify renames or
   prefixes named volumes for compose resources is unverified, and it is the highest-risk unknown in
   this entire plan. Confirm it on a throwaway resource first.
2. **Disable auto-deploy** on the production resource, or bring the new stack up on a temporary
   hostname. The merge to `main` must not be the cutover.
3. **Back up the live volume.** Copy it; never write to the copy's source. This backup is the
   rollback.
4. **Convert locally.** Adjust the copied files to the new structure, or leave them legacy-shaped and
   let the importer's legacy reader handle them (ADR 0019).
5. **Deploy the new stack** with an empty data volume, on a temporary hostname.
6. **Import** the converted data through the UI. Read the preview — project and task counts, and
   every share link with its role and scope — before confirming.
7. **Verify against imported data**, not a fixture. Open a real client share link of **each scope**
   and confirm it resolves to the right task with the right role — a project-scoped link lands on a
   task list, which the old app had no equivalent of and is therefore the case with nothing to
   compare against. This is the step that catches what silently breaks.
8. **Hand over the hostname.** Point the production FQDN at `microtask`, confirm `/share/<token>`
   **308**s to `/s/<token>` (ADR 0037).
9. **Stop the old container.** Keep its volume untouched until you are satisfied.

**The write gap** is between step 3 and step 8: any client edit in that window is lost, because it
lands in the old volume after the backup was taken. Keep the window to minutes and run it while
clients are idle. Closing it entirely would need a read-only mode on the app being replaced, which
is not being built.

**Rollback** is: re-point the hostname, redeploy the old image against the untouched backup. There is
no automated path from v2 data back to the legacy shape, which makes step 8 the point of no return.

The cutover requirements this follows from (ADR 0022):

- **Microtask must answer on the existing production FQDN.** A `/share/<token>` → `/s/<token>` path
  redirect is worthless if the host changes, because links already sent to clients embed the host.
  Macroplan gets a new hostname.
- **Merging to `main` must not be the cutover.** Coolify auto-deploys from this repo, so the merge
  would otherwise replace the live app with an empty one at a moment nobody chose. The deploy has to
  be gated separately from the merge.
- **The write gap is accepted and must be small.** Backup → convert locally → deploy → import is not
  zero-downtime in the strict sense: any client edit between the backup and the import is lost.
  Closing it entirely would need a read-only mode added to the app being replaced. Not doing that;
  instead the runbook keeps the window to minutes and says to run it when clients are idle.
- **There is no automated path back from v2 data to the legacy shape.** Cutover is one-way; the
  rollback is "redeploy the old image against the backup".

## 16. Risks accepted

1. **`manage` can delete the project it was given** — chosen deliberately. Mitigated by lineage-based
   revocation cascade (§6.1), not prevented.
2. **Delegation is unbounded** — a manage link can mint manage links without depth limit.
3. **Export bundles are credential dumps.** Token-stripping is the default for manual exports.
4. **Search is names-only**, so document text will not match.
5. **The API service gains runtime dependencies** — the runtime image is no longer
   `node_modules`-free. Unavoidable with generated OpenAPI.
6. **The write gap at cutover** (§15).
