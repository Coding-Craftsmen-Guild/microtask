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

- `packages/ui/src/primitives/**` — vendored shadcn/ui components. `shadcn add` regenerates them and
  several legitimately export a dozen subcomponents. Fighting the generator is pointless.
- `packages/contracts/**` — Zod schemas are declarative; splitting one to satisfy a line count
  scatters a single shape across files.
- `**/*.test.ts`, `**/*.test.tsx` — a thorough test file is long by definition.
- `*.config.{ts,mjs}` and generated output.

### SOLID, made concrete

Slogans do not constrain anything, so each letter gets a rule with a mechanism:

- **Single responsibility** — the size caps above are the proxy. One primary export per module in
  `packages/*`; types and private helpers may accompany it.
- **Open/closed** — a new role or action extends the `AccessPolicy` matrix (ADR 0008). Route handlers
  are never edited to add a permission case.
- **Liskov** — repository implementations are interchangeable. `packages/kernel` ships a shared
  contract test suite that every adapter must pass, so swapping the filesystem store for SQLite later
  (ADR 0003) is a package, not a rewrite.
- **Interface segregation** — narrow ports. `ProjectRepository`, `TaskRepository`, `Clock`,
  `IdGenerator`, `Lock` — never one store interface that everything depends on.
- **Dependency inversion** — `packages/kernel` defines ports; `packages/store` implements them.
  Services take their dependencies through the constructor. **No module-level singletons and no
  `process.env` reads inside a service** — enforced with `n/no-process-env` outside designated config
  modules, which also backs the single-`API_KEY`-reader rule in ADR 0012.

### Architectural boundaries, enforced

`import/no-restricted-paths` makes the dependency graph in the spec real:

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
