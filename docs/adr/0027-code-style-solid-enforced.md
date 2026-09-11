# ADR 0027 — Code style: SOLID, small files, TSDoc only, enforced by ESLint

**Status:** Accepted · 2026-09-10

## Context

The app being replaced is four large files doing many things each: `server.js` is 473 lines holding
routing, auth, validation and every endpoint; `public/js/project.js` is 467 lines holding rendering,
autosave, tab operations and the share manager. Nothing is wrong with any individual line — the
problem is that no unit of it can be understood, tested or reused on its own, which is exactly why
none of it can be shared with a second product.

Style conventions that live in someone's head do not survive a codebase this size. If a rule matters
it has to fail CI.

## Decision

### Size limits, enforced

| Rule | `.tsx` | `.ts` |
| --- | --- | --- |
| `max-lines` (`skipBlankLines`, `skipComments`) | **80** | **150** |
| `max-lines-per-function` | 50 | 50 |
| `complexity` | 10 | 10 |
| `max-depth` | 3 | 3 |
| `max-params` | 4 | 4 |
| `max-nested-callbacks` | 3 | 3 |

All **errors**, not warnings. A warning in a monorepo is a comment with extra steps.

`.tsx` gets 80 rather than 150 deliberately: a component that will not fit in 80 lines is almost
always two components, and the tight cap is what forces the composition instead of leaving it
optional.

Overrides, because a cap applied where it does not belong produces worse code, not better:

- `packages/ui/src/components/**` — vendored shadcn/ui components. `shadcn add` regenerates them and
  several legitimately export a dozen subcomponents. Fighting the generator is pointless. **This
  override was written as `src/primitives/**` in the shared config, and both halves of that were
  wrong** — the path and the place. It is corrected in ADR 0031 and in the amendment below.
- `packages/contracts/**` — Zod schemas are declarative; splitting one to satisfy a line count
  scatters a single shape across files.
- `**/*.test.ts`, `**/*.test.tsx` — a thorough test file is long by definition.
- `**/testing/**` — **size caps only.** A shared contract test suite is one exported function of
  `it()` blocks, so it breaks `max-lines-per-function` by construction: `describeProjectStore`
  is 115 lines against a cap of 50, and splitting it would scatter one adapter contract across
  files for no reader's benefit. The TSDoc rules stay **on** here, because `./testing` is a
  published `exports` subpath and therefore public surface. Four exports were found escaping an
  earlier, wider version of this override.
- `*.config.{ts,mjs}` and generated output.

### SOLID, made concrete

Slogans do not constrain anything, so each letter gets a rule with a mechanism:

- **Single responsibility** — the size caps above are the proxy. One primary export per module in
  `packages/*`; types and private helpers may accompany it.
- **Open/closed** — a new role or action extends the `AccessPolicy` matrix (ADR 0008). Route handlers
  are never edited to add a permission case.
- **Liskov** — repository implementations are interchangeable. The package that owns a port ships the
  contract test suite every adapter must pass — `@repo/microtask-domain/testing` for `ProjectStore` —
  so swapping the filesystem store for SQLite later (ADR 0003) is a package, not a rewrite.
- **Interface segregation** — narrow ports. `ProjectRepository`, `TaskRepository`, `Clock`,
  `IdGenerator`, `Lock` — never one store interface that everything depends on.
- **Dependency inversion** — a port is declared by the package that owns its types and implemented
  elsewhere: `FileSystem` in `packages/kernel` and `NodeFileSystem` in `packages/store`;
  `ProjectStore` and `FsProjectStore` both in `packages/microtask-domain`, the adapter reaching the
  disk only through the injected `FileSystem` (ADR 0014). Services take their dependencies through
  the constructor. **No module-level singletons and no
  `process.env` reads inside a service** — enforced with `n/no-process-env` outside designated config
  modules, which also backs the single-`API_KEY`-reader rule in ADR 0012.

### Architectural boundaries, enforced

`no-restricted-imports`, matching on **package names**, makes the dependency graph in the spec real.
The path-based `import/no-restricted-paths` is deliberately not used: its `files:` globs resolve
relative to the config file's own directory, so a rule written once in the shared config is silently
inert in every package that consumes it. Each package therefore carries its own block:

- `apps/microtask` and `apps/macroplan` may import `contracts`, `api-client`, `ui` — **nothing else**.
  Importing `packages/store` from a Next app would create a second writer to the data volume and
  break the single-writer assumption ADR 0002 depends on.
- `packages/kernel` imports no adapter and no framework.
- `packages/contracts` imports no server framework.
- Package internals are reachable only through each package's `exports`, so no deep-path imports.

### Hooks and components

- `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` are both **errors**.
- `'use client'` sits at the leaf. A client boundary wraps the smallest thing that needs
  interactivity, never a page or a layout.
- Client components hold no data fetching. Reads happen in Server Components through
  `packages/api-client`; mutations are Server Actions, except the three byte-moving route handlers in
  ADR 0015.
- All state and effects for a behaviour live in a custom hook, one per file, so the component is
  markup plus a hook call.
- `packages/ui` exports primitives and composed components separately; a barrel file never mixes
  client and server code.

### Comments: TSDoc only

- **TSDoc (`/** … */`) is required on every exported member of `packages/*`** — enforced with
  `jsdoc/require-jsdoc`.
- **No other comments anywhere.** No section banners, no narration, no commented-out code, no
  inline trailing comments. ESLint core cannot express this, so `packages/eslint-config` carries a
  small local rule that walks `sourceCode.getAllComments()` and reports any comment that is not a
  doc comment attached to an exported declaration.

**This is stricter than the codebase it replaces, and it costs something real.** The current code
carries genuine rationale in comments — why `timingSafeEqual` is safe on those two values, why the
role is re-checked inside the lock, why `TaskItem` deliberately has no `onReadOnlyChecked`, why
`fill()` exists at all. That knowledge cannot simply be deleted, so it gets two homes instead of one,
and this is a requirement rather than a hope:

- **Design-level rationale goes in an ADR.** If a decision needs explaining, it is a decision, and it
  belongs in `docs/adr/`.
- **Behavioural rationale goes in the test name.** Not `it('checks permission')` but
  `it('re-checks the role inside the lock, because a link can be downgraded between read and write')`.
  The invariant then fails loudly when broken, which a comment never does.

A non-obvious workaround with nowhere to point is a signal the code needs restructuring or the
decision needs recording — not a comment.

### Mechanics

Flat config (`eslint.config.mjs`) with a shared `packages/eslint-config`. Next.js 16 removed
`next lint`, so linting runs through the ESLint CLI in `turbo run lint`, and CI fails on any error.
Formatting is delegated to a formatter, not argued about in review.

## Consequences

- Many more, much smaller files. Navigation depends on good naming and the `exports` map rather than
  on scrolling.
- The caps will occasionally be wrong. When splitting a module genuinely produces worse code, the fix
  is an override in `packages/eslint-config` **with an ADR-worthy reason** — not a file-level
  `eslint-disable`, which is banned.
- Writing an ADR becomes part of ordinary work, since it is now the only place design rationale can
  live. That is the intended trade: this document exists because of it.
- Test names get long. Accepted — they are the documentation now.
- The initial port is slower. Moving `server.js` into services under a 150-line cap is real work,
  and it is the work that makes the code shareable with Macroplan at all.
- `jsdoc/require-jsdoc` on every exported member of every shared package is a lot of TSDoc. Its
  payoff is editor hover documentation across package boundaries, where hovering is the only way to
  see a signature's intent.

## Alternatives considered

**Ban narration but keep short "why" comments**, requiring TSDoc only on shared public surfaces. My
recommendation; rejected in favour of the stricter rule so there is exactly one place rationale can
live and no judgement call at the point of writing. The cost is recorded above.

**Warn at 150, error at 250.** Gentler, and warnings get ignored. Rejected.

**One cap for every file type.** Simpler to state, but 150 lets a `.tsx` grow into a page-sized
component while 80 would shred a legitimate service module. The split is the point.

**Rely on code review.** Rejected: unenforced conventions decay, and this codebase is the evidence.

## Amended by measurement · 2026-09-11

This ADR's own rule about flat config caught it out. It records, correctly, that
`import/no-restricted-paths` is unusable in a shared config because its `files:` globs resolve
relative to the **consuming** config's base path — and then it writes the vendored-components
override as a repo-rooted glob in that same shared config. Measured against the real tree:
`files: ['packages/ui/src/components/**/*.tsx']` in `packages/eslint-config` leaves all **112**
problems standing, because the glob matches nothing. The same rule block written as
`files: ['src/components/**/*.tsx']` inside `packages/ui/eslint.config.js` gives **0**.

The override also named `src/primitives/**`, a directory the shadcn CLI never writes to and, given
ADR 0025's exports map, never can.

**Resolution: `packages/eslint-config` exports a named override factory** — `vendoredComponents()` —
which `packages/ui/eslint.config.js` spreads. The rule set stays decided in one shared place, which
is what this ADR wants; the glob is applied where it resolves, which is what flat config requires. A
literal `rules` block copied into the package is not the fix. ADR 0031 carries the full reasoning,
including what the 112 problems actually are: `jsdoc/require-jsdoc` 103 times and `max-lines` 9
times, and **nothing else** — `local/tsdoc-comments-only` costs zero, because shadcn 4.21.0 emits no
comments at all.

The generalisation is worth stating plainly, because it applies to every rule this ADR scopes by
path: **a path-scoped rule is decided centrally and applied locally.** Any `files:` glob in
`packages/eslint-config` that begins with `apps/` or `packages/` is inert, and inertness here is
invisible — the config reads as though the rule is in force. That is the mirror image of the
file-level `eslint-disable` this ADR bans: visible intent, no effect.
