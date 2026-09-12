# ADR 0026 — Three images via one `turbo prune` per image and Next standalone output

**Status:** Accepted · 2026-09-10

## Context

One workspace has to produce three images — a Hono API and two Next apps — deployed by Coolify from a
single `docker-compose.yml`, with the API owning the existing production data volume.

Naive approaches fail at container start rather than at build time, which is the worst place to find
out. Verification pinned down the mechanics.

## Decision

### Base image

**`node:24` for all three** — the `node:24-slim` tag, in every stage (amendment below). Node 20 reached end of life on 2026-04-30; v24 is Active LTS until
2028-04-30. It satisfies Next 16's `engines` (`>=20.9.0`) and `@hono/node-server@2.1.1`'s (`>=20`).

pnpm is installed explicitly (`npm i -g pnpm@12.3.4`) — **not** through Corepack, which Node stopped
distributing in Node 25.

### Pruning

**One `turbo prune <pkg> --docker` per image**, positional form. Never `--scope=` (deprecated), and
never `--production` in a stage that also builds — it drops devDependency workspace packages such as
`typescript-config`.

Multiple positional targets happen to parse, but are undocumented, and a shared prune produces one
union lockfile — so a dependency added to Macroplan would reinvalidate the API's install layer,
defeating the point of pruning.

Anything referenced by turbo `globalDependencies` (a root `tsconfig.json`, `.env`) is **not** copied
by prune. All shared config therefore lives in workspace packages, not at the root.

Dev dependencies are installed **in full** in the builder stage — `next build` needs TypeScript and
Tailwind. They are stripped only from the API's runtime tree — by `pnpm deploy --prod`, whose
output is then trimmed to `package.json` and `dist` per workspace package (amendment below); the
Next runtime stages install nothing at all.

Every non-pnpm lockfile is deleted and gitignored: a stray `package-lock.json` silently moves the
inferred tracing root.

### Next standalone output

`outputFileTracingRoot` is set **explicitly**, as a **top-level** option (never under
`experimental`), absolute, pointing at the monorepo root.

Vendor docs and vendor source disagree here — v16.3.4's `find-root.ts` does treat
`pnpm-workspace.yaml` as a workspace marker, but the `output` docs page, stamped for the same
version, still instructs you to set it. Setting it explicitly is docs-sanctioned, harmless under the
source behaviour, and makes the standalone layout deterministic. It also matters because the nested
layout below only follows if the tracing root sits **above** the app directory.

`turbopack.root` is left unset — Next mirrors the value. No `webpack()` key appears anywhere: its
mere presence fails `next build` under Turbopack.

The copy paths are **nested**, and the server is started from its nested path:

```dockerfile
COPY --from=builder /app/apps/<app>/.next/standalone ./
COPY --from=builder /app/apps/<app>/.next/static ./apps/<app>/.next/static
COPY --from=builder /app/apps/<app>/public ./apps/<app>/public
CMD ["node", "apps/<app>/server.js"]
```

`node server.js` at the standalone root is `MODULE_NOT_FOUND`.

`PORT` and `HOSTNAME=0.0.0.0` are set as environment variables — the standalone server reads no CLI
flag. `@hono/node-server` needs no `hostname`: with none, `serve()` listens on `[::]`, every
interface (amendment below).

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is set in the environment and kept **stable across rebuilds**.

### Compose

One service per deployable — two today, `api` and `microtask`; Macroplan's joins when the app exists.
The API's data lives in a **new** named volume, `api-data`, mounted on `api` only. The existing
production volume is **never** referenced — not as `external: true`, not at all: this API cannot read
its layout, and it is the rollback ADR 0022 keeps untouched (amendment below). No `networks:` block
and no `ports:` on any service — Coolify supplies the network and routes by domain; the API is
internal-only (ADR 0041). `microtask` waits for `api` to report healthy.

Healthchecks use `node -e` with `node:http`, not `curl` or `wget`: `node:*-slim` images contain
neither. The API gets a real `/healthz` route. Microtask's probe is `GET /login`, which is dynamic
and reads no credential — a static file is **not** a health route (amendment below).

## Consequences

- Three Dockerfiles with near-identical prune/install stages. Duplication is accepted in exchange for
  independent cache invalidation per image.
- Shared root config cannot be relied on inside a pruned build, which pushes config into packages —
  the same direction ADR 0023 pushes tsconfig.
- Local dev and the built image now differ meaningfully (raw workspace vs pruned standalone), so a
  "does it build in Docker" check belongs in CI rather than being discovered at deploy.
- **Everything Coolify-specific is unverified and must be checked on the server before cutover** —
  above all whether Coolify renames or prefixes named volumes for compose resources. It no longer
  decides a takeover — the live volume is never mounted (amendment below) — but it decides the real
  name of the live volume the runbook backs up and of the `api-data` volume every redeploy must
  find again, and it is checked on a throwaway resource first. Also unconfirmed: whether its
  compose build pack supports three per-service `build.dockerfile` entries from one monorepo,
  whether it can assign the existing
  hostname to one of three services and leave the other two domain-less, and its proxy's body-size
  and streaming behaviour ahead of Hono's `bodyLimit`.

## Alternatives considered

**No pruning — build the whole workspace in each image.** Simpler Dockerfiles, much larger build
context and no cache isolation between the three images.

**One image running all three processes.** Fewer moving parts, and it discards the independent
deployability that motivated ADR 0002.

**`node:22`.** Still in maintenance until 2027-04-30, so viable. Rejected in favour of Active LTS.

**Node 26 for its built-in `node:zlib` ZIP reader** (real, added in v26.8.0, Stability 1.0 — verified,
not invented). Rejected: Node 26 is Current, not LTS until 2026-10-28, and the API is experimental.
ADR 0020's zip reader stays a library behind a narrow port so it can be swapped when that lands.

## Amended by measurement · 2026-09-11

Standing up the Next app surfaced an interaction between the two halves of this ADR — `output:
'standalone'` for the image, and Turborepo for the build — that neither half predicts.

**Turbo silently refuses to cache `.next` when `output: 'standalone'` is set.** Every run reported
`cache miss` with the matching artifact on disk, and emitted **no diagnostic at any verbosity**. The
cause is the `node_modules` subtree that standalone output copies into `.next/standalone`, whose
paths exceed Windows `MAX_PATH`; the cache write fails on those entries and the task is simply never
recorded as cached.

The fix is one glob. `apps/microtask/turbo.json` declares:

```json
"outputs": [".next/**", "!.next/cache/**", "!.next/standalone/**"]
```

`.next/standalone` stays on disk for the Docker builder stage, which copies it directly and never
reads a Turbo cache, so nothing the images depend on is lost. What is given up is restoring
`.next/standalone` from cache locally, which was never the artifact that mattered.

**The hazard is not the one the ADRs warn about.** The warning elsewhere is "FULL TURBO restoring
nothing" — a cache hit that skips a build whose output is incomplete. This is the opposite and it is
harder to notice: **never FULL TURBO, with no explanation.** A build that is always a miss looks like
a correctly configured pipeline that is merely slow, which is exactly the failure nobody
investigates. Any `outputs` entry that can contain a deep `node_modules` tree needs the same
exclusion, and the symptom to watch for is a task that never once reports a hit.

## Amended by building and running the images · 2026-09-11

Both images were built from an isolated worktree with Docker 26.1.1 and run as the compose stack
with throwaway secrets on a throwaway volume. Five sentences above were corrected where they live;
this is the evidence.

**The legacy volume is never mounted.** The Compose section said the existing production volume is
referenced `external: true` and mounted on `api`. That contradicts ADR 0022 — "the old app's data
volume must be preserved read-only until the new stack is verified, not reused in place" — and step 5
of the runbook, which deploys "with an empty data volume". It would not work either: the volume holds
`data/projects/<id>.json`, and the new API reads `microtask/projects/<id>/project.json` (written by
the verification run, owned by `node`). The API gets a new named volume, `api-data`, and the importer
(ADR 0017) is the only bridge — which is why cutover is blocked on it. The image creates `/data`
owned by `node` so a fresh named volume inherits a writable root; without that line a non-root
`touch /data/probe` on a fresh volume fails.

**A static file is not a health route.** With `COOKIE_SECRET` five bytes long, `register()` throws,
Next logs `Failed to prepare server` and does **not** exit, and every dynamic route answers 500.
Measured: a probe on `/login` goes `unhealthy`; a probe on `/img/logo.webp` stays `healthy`, because
static files are served without the instrumentation hook. Microtask's healthcheck is therefore
`GET /login` — dynamic, since it reads `searchParams`, and credential-free, since `proxy.ts` passes it
ungated and the page reads no cookie and calls no API. A dedicated route would also have to be
ungated in `proxy.ts`, which gates every path but `/login`, `/s/*`, `/share/*` and `/api/*`.

**`@hono/node-server` needs no `hostname`.** `apps/api/src/server.ts` passes none, and inside the
container the socket is `[::]:4321` (`/proc/net/tcp6`), dual-stack, which Microtask reaches as
`http://api:4321`.

**The base tag is `node:24-slim`** (Node 24.21.0 on the day), for every stage: the builder needs
nothing the full image adds, and it is the image the healthcheck sentence already assumed. It is 230
MB of each image below. `npm i -g pnpm@12.3.4` on npm 11 warns that pnpm's own install scripts were
not run (`allowScripts`); pnpm works without them, so they stay un-run.

**`pnpm deploy --prod` copies whole package directories.** No workspace package declares `files`, so
the deployed API carried every package's `src/`, all its `*.test.ts`, `vitest.config.ts`,
`eslint.config.js`, `tsconfig*.json` and `.turbo/`. The Dockerfile trims each workspace package to
`package.json` and `dist`, removes the test doubles (`dist/testing` in `api` and in
`@repo/microtask-domain`, which only tests and the OpenAPI emit script reach) and the emit script
(`dist/scripts`), then **fails the build** if a test file, a `src/` or a `testing/` directory is left
in workspace code. A `"files": ["dist"]` in each package would make most of the trim a no-op; it is the
cleaner fix, and belongs to the packages. Third-party packages are left as published — `zod@4.6.1`
ships 196 test files of its own inside the API image.

| Image | Total | App layers | Without the measure |
| --- | --- | --- | --- |
| `apps/api` | **240 MB** | 9.6 MB (`/app` is 16 MB on disk) | the builder's workspace is 219 MB with dev dependencies, so shipping it would be ~450 MB |
| `apps/microtask` | **272 MB** | 40.1 MB standalone + 1.76 MB `.next/static` + 9.6 kB `public` | — |

**A missing static copy fails silently, exactly as warned.** Deleting the `.next/static` `COPY`
leaves `/login` answering 200 with its HTML intact while its stylesheet answers 404 — no error in any
log. Deleting the `public` `COPY` does the same to the logo. The verification therefore fetches the CSS
chunk the page links and the logo it renders, from the running container, and compares the logo's
bytes to the repository file. `node server.js` at the standalone root is `MODULE_NOT_FOUND`, as
stated: `Cannot find module '/app/server.js'`.

**Next bakes build-time keys into the image.** The standalone output carries a Server Actions
`encryptionKey` in `server-reference-manifest.json` and three preview-mode keys in
`prerender-manifest.json`, each generated at build. Next reads
`process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || manifest.encryptionKey` at request time (read
from `next/dist/server/app-render/encryption-utils.js`, not measured), so the environment key wins
and compose refuses to start without one; the preview keys guard draft mode, which the app never
enables. No secret of **ours** is in either image — no `.env`, no `data/`, no key file, checked on
the built filesystem. Setting the variable at build time would be worse: it would bake the real key.

**`turbo prune` rewrites `pnpm-workspace.yaml`.** The pruned copy keeps every setting — catalog,
overrides, `allowBuilds`, `strictPeerDependencies` — and drops every comment, so the file's reasoning
never reaches an image and does not need to.

**`.dockerignore` is the only thing keeping an app's `.env.production` out of its image.** Measured
on a throwaway worktree: with `**/.env.*` removed, `next build` copied an untracked
`apps/microtask/.env.production` into the standalone output, and it shipped at
`/app/apps/microtask/.env.production`. The API image stays clean either way, because its trim keeps
only `package.json` and `dist`. `.gitignore` ignores `.env` alone, so a `.env.production` or
`.env.local` is not even kept out of a commit.

**The invariants above are pinned in the gate**, since the verification scripts behind them were
thrown away: `apps/api/src/deploy/` reads `apps/api/Dockerfile`, `docker-compose.yml`,
`.env.example` and `.dockerignore`, and `apps/microtask/dockerfile.test.ts` reads Microtask's
Dockerfile — the runner stage's user, copies, probe and command, every `${VAR:?}`, the volume, the
absent ports and every exclusion. `apps/api/turbo.json` adds the three root files to the API's test
inputs, so editing one of them is a cache miss. They read files; whether the images build and run
is still the CI check the consequences above ask for — which, until the amendment below, no CI
runner could have performed, because the suite the build runs needed an untracked file.

## Amended · 2026-09-12 — the suite no longer needs `data/`, and the container lifecycle is real

Three things this ADR asks for could not happen as the code stood.

**The gate could not run anywhere but one machine.** `packages/contracts/src/document-facts.test.ts`
read `data/projects/01M240ERCRWWCN16Q5AHP1FZAQ.json` through a relative URL. `data/` is gitignored
and holds production customer data, so a fresh clone, a CI runner and every container build had no
such file and that test errored — which makes the "does it build in Docker" check above
unreachable for any runner that runs `turbo run test` first. Not because the image build runs the
suite: neither Dockerfile does, both stopping at `turbo run build --filter=…`, and
`.dockerignore` excludes `**/*.test.ts` and `**/*.test.tsx` from the build context altogether.
The block was on the gate, not on the build. The property the test exists to prove is
real and is kept: documents written by the app being replaced are valid input to Tiptap 3, and
`countTasks` agrees with the live numbers (ADR 0039). It now reads a committed fixture derived from
the real file by `packages/contracts/scripts/derive-legacy-fixture.mjs`, which preserves every
structural fact — four tabs and their positions, every node type and count, every `attrs` including
the 12-of-12 `checked` distribution, no `marks`, depth five — and replaces every text node and name
with filler. The real-file assertions stay, guarded by `existsSync`, and are reported as skipped
where `data/` is absent; one of them asserts that the fixture's structure equals the real file's, so
the fixture cannot drift on the machine that can tell. Proven by running the suite in a fresh `git
worktree`, where `data/` cannot exist: `@repo/contracts` is 116 passed, 2 skipped, and `api` is 653
passed.

**That first fix was not enough on its own, and two more files had the same defect.** The same
worktree run showed `apps/microtask/components/editor/extensions.test.tsx` (6 failed) and
`document-editor.test.tsx` (failed to collect, 0 tests run) reading `data/projects` directly, so
`turbo run build typecheck lint test --force` was **35 of 36 tasks** off this machine. They are the
ADR 0039 round-trip tests, and both production files feed them, not just the one. Both now read
committed fixtures: `derive-legacy-fixture.mjs` derives one fixture per production project, and the
tabs those tests want are selected by structure — the tab whose document ends in a `taskList` —
rather than by the customer's tab name, which the derivation replaces with filler. Their real-file
assertions stay, guarded by existence, and are reported as skipped where `data/` is absent.

**The gate is portable, measured.** In a fresh `git worktree add --detach` where `data/` cannot
exist, `npx turbo run build typecheck lint test --force` is `Tasks: 36 successful, 36 total`,
`Cached: 0 cached, 36 total`, exit 0, in 2m40s: `@repo/contracts` 118 passed and 3 skipped,
`api` 655 passed, `microtask` 1372 passed and 1 skipped. The four skips are exactly the
real-file assertions. The CI check the consequences above ask for is no longer blocked.

**What keeps the derivation honest.** The fixture guard originally held on tab names and text nodes
only, so a derivation that stopped neutralising `id` or `token` would have carried a live
production share token into a committed fixture with the whole suite green — mutating that branch
out of the script killed no test. `document-facts.test.ts` now asserts a stand-in under every key
the script touches, `id`, `token` and both timestamps included, which needs no `data/` and so
holds on CI; and where `data/` is present it also asserts that no stored string of three characters
or more reaches either committed fixture at all.

**`restart: unless-stopped` did nothing for a bad environment.** Docker restarts a container on
exit, never on unhealthy. A refused environment left Next up and serving 500s, so the compose
restart policy never fired and the `GET /login` probe this ADR chose only *showed* the failure.
`register()` now exits the process — ADR 0032's 2026-09-12 amendment.

**`docker stop` killed the API where it stood.** It installed no signal handler, so every deploy
ended in a kill rather than a stop — measured on this image at 10.9 s and exit 137 with node as
PID 1, and at 1.0 s and exit 143 with tini as PID 1, which is what `init: true` gives it here. It
now drains and exits 0 in 0.9 s — ADR 0006's 2026-09-12 amendment, which carries the three
measurements. `init: true` is what gets the signal to node at all, and the `CMD` exec form is what
keeps node the direct child.
