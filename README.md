# CC Guild

A pnpm + Turborepo monorepo: one HTTP API and two Next.js apps over it, sharing packages. Microtask
is a client-facing checklist tool — **Project → Task → tabs of rich-text/checklist documents** — that
an admin edits and hands to clients through share links. Macroplan is the second product: it ships
as a working shell — an admin signs in and lands on an empty dashboard — with its own entities
still unspecified ([ADR 0014](docs/adr/0014-namespace-products-now.md)).

> **This stack is not in production, and cannot be pointed at production data yet.** The live app is
> still the previous one, kept at the `legacy-prod` tag. Its data is one JSON file per project
> (`data/projects/<id>.json`); the new API stores a directory per project and **cannot read the old
> layout**. The only bridge between the two is the import/export panel
> ([ADR 0017](docs/adr/0017-drop-in-import-export.md)), and **as of 2026-09-17 it exists**: the live
> backup has been imported end to end through the real API and measured
> ([report](docs/superpowers/reports/2026-09-17-import-export-report.md)). That lifts the **code**
> gate and none of the operational one. Cutover is still ordered — backup, deploy, import, hostname
> last — and the step that can lose production is now a Coolify setting, not missing code: never
> mount the live volume into this stack, never give
> it the production hostname before the import, and never point it at the `data/` directory in this
> repository. The
> cutover itself is a separate, ordered runbook — §15.1 of the
> [design spec](docs/superpowers/specs/2026-09-10-monorepo-restructure-design.md) and
> [ADR 0022](docs/adr/0022-hostname-continuity-gated-cutover.md).

> **Do not run `npm install` at the repository root.** It creates a `package-lock.json`, which
> [ADR 0026](docs/adr/0026-docker-turbo-prune-standalone.md) forbids — a stray non-pnpm lockfile
> silently moves Next.js's inferred file-tracing root — and `.gitignore` hides that file, so it would
> sit there unnoticed. Use `pnpm install`.

## Layout

```
apps/api/              Hono on @hono/node-server; owns the data, serves /openapi.json and /docs
apps/microtask/        Next 16 App Router app; an HTTP client of the API, touches no file itself
apps/macroplan/        Next 16 App Router shell; sign-in and an empty dashboard, no entities yet
packages/contracts/    Zod schemas and the wire facts both sides need
packages/kernel/       roles, the access policy, ids, errors, ports
packages/microtask-domain/, packages/macroplan-domain/, packages/store/
packages/api-client/   the typed client the apps call the API through
packages/app-session/  the admin session both apps sign in through; the one reader of process.env
packages/ui/           shadcn/ui primitives, the shared shell, the one Tailwind v4 stylesheet
packages/eslint-config/, packages/typescript-config/
docs/adr/              every decision, with its reasoning — start at docs/adr/README.md
docs/parity/           the behavioural record of the app being replaced
```

The previous app (`apps/legacy`) is deleted. Its code is at the `legacy-prod` tag, which is also the
production rollback; its behaviour is recorded in
[`docs/parity/legacy-microtask.md`](docs/parity/legacy-microtask.md).

## Develop

```bash
pnpm install
pnpm build                  # every package and all three deployables
npx turbo run build typecheck lint test
```

To run it, start the API against a **throwaway** directory — never `./data`, which is production data
in a layout this API cannot read — then an app against the API:

```bash
# from the repository root, one shell each
mkdir -p /tmp/ccg-data
(cd apps/api && DATA_DIR=/tmp/ccg-data ADMIN_PASSWORD=dev-password \
  SESSION_SECRET=dev-session-secret-of-at-least-32-chars SERVICE_KEYS=microtask=dev-key,macroplan=dev-key-mp \
  node dist/server.js)                                          # http://localhost:4321/docs

(cd apps/microtask && API_BASE_URL=http://localhost:4321 API_KEY=dev-key \
  COOKIE_SECRET=dev-cookie-secret-of-at-least-32-bytes pnpm dev)   # http://localhost:3000

(cd apps/macroplan && API_BASE_URL=http://localhost:4321 API_KEY=dev-key-mp \
  COOKIE_SECRET=dev-macroplan-cookie-secret-32-bytes pnpm dev --port 3001) # http://localhost:3001
```

The two apps take **different** service keys and **different** cookie secrets on purpose: one key
per product is what lets the API record which one made a call, and two cookie names are what let
both be signed into from one browser without each clearing the other's session
([ADR 0014](docs/adr/0014-namespace-products-now.md), [ADR 0047](docs/adr/0047-one-admin-session-two-cookies.md)).

## Images and compose

One image per deployable, each built from the repository root with one `turbo prune`
([ADR 0026](docs/adr/0026-docker-turbo-prune-standalone.md)). There is no root `Dockerfile`.

```bash
docker build -f apps/api/Dockerfile -t ccg-api .
docker build -f apps/microtask/Dockerfile -t ccg-microtask .
docker build -f apps/macroplan/Dockerfile -t ccg-macroplan .
```

| Image | Runs | Healthcheck | Size (measured 2026-09-11) |
| --- | --- | --- | --- |
| `apps/api` | `node dist/server.js` as `node`, port 4321 | `GET /healthz` | 240 MB, of which 230 MB is `node:24-slim` |
| `apps/microtask` | Next standalone, `node apps/microtask/server.js` as `node`, port 3000 | `GET /login` | 272 MB |
| `apps/macroplan` | Next standalone, `node apps/macroplan/server.js` as `node`, port 3000 | `GET /login` | not measured |

[`docker-compose.yml`](docker-compose.yml) runs all three. Each app waits for `api` to report
healthy, and the API keeps its data in a **new, empty** named volume, `api-data` — never the legacy
volume. Macroplan gets a new hostname and never the production one
([ADR 0022](docs/adr/0022-hostname-continuity-gated-cutover.md)).

The API is **internal-only** ([ADR 0041](docs/adr/0041-api-internal-only.md)): no published port and
no domain. Both apps reach it as `http://api:4321`. Its OpenAPI document and reference page,
`/openapi.json` and `/docs`, answer without a credential to anything on the same network; every
`/v1` route still needs a service key and a principal token (ADR 0012). Neither service publishes a
port — Coolify routes by domain.

### Environment

Every secret comes from the environment and none has a default. `docker compose` refuses to start
while any of these is unset or empty, naming the one that is missing. [`.env.example`](.env.example)
lists them, empty.

| Variable | Used by | Meaning |
| --- | --- | --- |
| `ADMIN_PASSWORD` | api | The one admin password |
| `SESSION_SECRET` | api | Signs the admin bearer tokens; at least 32 characters |
| `MICROTASK_API_KEY` | api + microtask | The service key naming Microtask; compose passes it into the API's `SERVICE_KEYS` and as the app's `API_KEY` |
| `COOKIE_SECRET` | microtask | Seals the `mt_admin` cookie; at least 32 bytes, distinct from `SESSION_SECRET` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | microtask | Base64 of 32 random bytes; keep it the same across deploys |
| `MACROPLAN_API_KEY` | api + macroplan | The service key naming Macroplan. A **different** value from Microtask's: one key per product is what lets the API record which one made a call |
| `MACROPLAN_COOKIE_SECRET` | macroplan | Seals the `mp_admin` cookie; at least 32 bytes, and not `COOKIE_SECRET` — one secret for both would let each app open the other's bearer |
| `MACROPLAN_SERVER_ACTIONS_ENCRYPTION_KEY` | macroplan | Its own base64 AES-256 key; keep it the same across deploys |

## Deploy (Coolify)

Not yet — see the notice at the top. What is known about the target: a Docker Compose resource built
from this repository, each service naming its own `dockerfile`, the secrets above set as the
resource's environment variables, and Microtask given the existing production hostname **only at the
cutover step**, after the import. Everything Coolify-specific — above all whether it renames named
volumes — is unverified and is checked on a throwaway resource first (ADR 0026).

**Merging this branch to `main` is a deploy.** The production resource auto-deploys `main`
([ADR 0022](docs/adr/0022-hostname-continuity-gated-cutover.md)), and compose's `microtask`
service has the same name as the live app's service, the one the production domain is pointed at by
hand, so Coolify may carry that domain over to the new, empty stack. Disable auto-deploy on the
production resource **before** the merge (runbook step 2). Until then, the only thing expected to
stop such a deploy at `docker compose`, before it replaces the live app, is that the variables
this stack adds (every one above but `ADMIN_PASSWORD`, which the live app already needs) are unset
there, so set them only on a throwaway resource, never on the production one ahead of the cutover.
