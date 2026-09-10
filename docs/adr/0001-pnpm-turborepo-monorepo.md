# ADR 0001 — Restructure as a pnpm + Turborepo monorepo

**Status:** Accepted · 2026-09-10

## Context

Microtask is a single-package vanilla-JS app: `server.js`, two files in `lib/`, and browser scripts
in `public/js/`. A second product (Macroplan) is coming, and the parts worth sharing — roles, ids,
storage, the app shell, the editor — are entangled with Microtask's routes and markup. Copying them
into a second repository would fork them permanently on day one.

## Decision

One repository, pnpm workspaces, Turborepo as the task runner. `apps/*` hold only code that cannot
be shared; everything reusable is a package under `packages/*`.

pnpm because it is Turborepo's documented default, and because its strict linking surfaces
accidental cross-imports instead of silently resolving them through a hoisted `node_modules`.

## Consequences

- Every command changes: `pnpm --filter`, `pnpm -w`, `turbo run`. The current two-command workflow
  (`npm run build && node server.js`) is gone.
- Docker builds get more complex — three images out of one workspace.
- The "apps hold nothing shareable" rule needs enforcement, not just intent. `packages/ui` growing
  into a full app shell is the test of whether the rule is real.
- A shared dependency drifting between packages becomes a class of bug that did not exist before, so
  shared versions are pinned centrally rather than per-package.

## Alternatives considered

**Two independent repositories.** Simplest tooling, but shared code would be copy-paste and would
diverge. Rejected: reuse across products was an explicit goal.

**npm workspaces.** Keeps the current toolchain and lockfile. Rejected in favour of pnpm's stricter
resolution, which is worth more here than familiarity.
