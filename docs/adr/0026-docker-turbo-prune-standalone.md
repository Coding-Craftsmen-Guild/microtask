# ADR 0026 — Three images via one `turbo prune` per image and Next standalone output

**Status:** Accepted · 2026-09-10

## Context

One workspace has to produce three images — a Hono API and two Next apps — deployed by Coolify from a
single `docker-compose.yml`, with the API owning the existing production data volume.

Naive approaches fail at container start rather than at build time, which is the worst place to find
out. Verification pinned down the mechanics.

## Decision

### Base image

**`node:24` for all three.** Node 20 reached end of life on 2026-04-30; v24 is Active LTS until
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
Tailwind. They are stripped only from the API's runtime tree; the Next runtime stages install
nothing at all.

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
flag. `@hono/node-server` likewise takes `hostname: '0.0.0.0'` in `serve()`.

`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is set in the environment and kept **stable across rebuilds**.

### Compose

Three services. The existing production volume is referenced as `external: true` with an explicit
`name:` read off the server first, and mounted on `api` only. No `networks:` block and no `ports:` on
any service — Coolify supplies the network and routes by domain.

Healthchecks use `node -e` with `node:http`, not `curl` or `wget`: `node:*-slim` images contain
neither. The API gets a real `/healthz` route; each Next app gets a dynamic health route.

## Consequences

- Three Dockerfiles with near-identical prune/install stages. Duplication is accepted in exchange for
  independent cache invalidation per image.
- Shared root config cannot be relied on inside a pruned build, which pushes config into packages —
  the same direction ADR 0023 pushes tsconfig.
- Local dev and the built image now differ meaningfully (raw workspace vs pruned standalone), so a
  "does it build in Docker" check belongs in CI rather than being discovered at deploy.
- **Everything Coolify-specific is unverified and must be checked on the server before cutover** —
  above all whether Coolify renames or prefixes named volumes for compose resources. That is the
  single highest-risk unknown for taking over the live production volume, and it is checked on a
  throwaway resource first. Also unconfirmed: whether its compose build pack supports three
  per-service `build.dockerfile` entries from one monorepo, whether it can assign the existing
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
