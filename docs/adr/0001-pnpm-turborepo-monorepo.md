# ADR 0001 — Restructure as a pnpm + Turborepo monorepo

**Status:** Accepted · 2026-09-10

## Context

Microtask is a single-package vanilla-JS app: `server.js`, two files in `lib/`, and browser scripts
in `public/js/`. A second product (Macroplan) is coming, and the parts worth sharing — roles, ids,
storage, the app shell (**not** the editor — see the amendment below) — are entangled with
Microtask's routes and markup. Copying them
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

## Amended · 2026-09-11 — the editor is not one of the shared parts

The context above lists "the editor" among the parts worth sharing. It is not, and the sentence is
corrected there rather than only here, because it is the kind of line someone acts on.

Tiptap is the Microtask checklist document editor, over a ProseMirror schema of task lists that
Macroplan has no use for. This ADR's own rule therefore puts it in `apps/microtask`. It is also the
one candidate for `packages/*` where sharing carries a standing hazard rather than a cost: `@tiptap/pm`
re-exports ProseMirror, `prosemirror-model` compares schemas and node types by `instanceof`, and two
apps consuming a shared editor package at different `@tiptap/*` versions fail at schema construction.

ADR 0039 records the decision and the measurements behind the Tiptap 3 configuration. The prediction
in the consequences above — that `packages/ui` growing into a full app shell is the test of whether
the "apps hold nothing shareable" rule is real — stands unchanged; this is the first thing the rule
kept out.
