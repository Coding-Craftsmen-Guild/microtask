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

- `apps/microtask` and `apps/macroplan` each carry **two lists in one block**, and each list is that
  app's own. The **allowlist** is the rule: `apps/microtask` may import `@repo/api-client`,
  `@repo/app-session`, `@repo/contracts` and `@repo/ui` and **nothing else**; `apps/macroplan` may
  import those four plus `@repo/canvas` and `@repo/schedule` and **nothing else**. It is a single
  `no-restricted-imports` pattern group per app — `@repo/*` and `@repo/*/*` with a negated pair for
  each permitted package — so a new shared package is refused until somebody edits that file, which
  is where the decision to admit it becomes visible. The **denylist** stays underneath it:
  `@repo/store`, `@repo/kernel` and both `*-domain` packages, each banned by name with its own
  reason. Importing `packages/store` from a Next app would create a second writer to the data volume
  and break the single-writer assumption ADR 0002 depends on, and a domain barrel reaches `node:path`
  and `node:crypto`. Both lists exist because they carry different things: an allowlist refusal can
  only ever say *not on the list*, where a denylist entry says which invariant the import would
  break. Both groups match, so a banned import is reported twice — once with the count, once with
  the reason. This rule was written as an allowlist from the start and enforced as a denylist alone
  for thirteen days; the two amendments of 2026-09-23 below measure that gap and close it.
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

## Line endings are LF, enforced · 2026-09-11

Committing a file produced `warning: LF will be replaced by CRLF the next time Git touches it`,
which prompted a measurement: `core.autocrlf=true` with no `.gitattributes`, an index that was
already LF for all 366 tracked text files, and **15 working-tree files that had drifted to CRLF**.

The drift is invisible. `git status` normalises on comparison, so a CRLF working file shows no diff;
`git ls-files --eol` is the only thing that reveals it. A habit cannot enforce something nobody can
see, so it gets a rule at both levels:

- **`.gitattributes`** declares `* text=auto eol=lf`. `eol=lf` overrides `core.autocrlf`, so a
  machine that still has it set gets LF here anyway. This is the half that covers what ESLint never
  reads — Markdown, JSON, YAML, CSS — and the half that survives a fresh clone.
- **`linebreak-style: ['error', 'unix']`** in `base` fails the gate on a CRLF source file, so the
  drift cannot return through an editor.

Note for a future ESLint upgrade: `linebreak-style` is one of the formatting rules deprecated in
ESLint 8.53. It still functions in the pinned 9.39.5, and if a later major removes it the gate fails
loudly on an unknown rule rather than silently ceasing to check — which is the acceptable direction.
`.gitattributes` is the durable half.

## The one environment reader stays Edge-safe · 2026-09-11

`n/no-process-env` makes `apps/microtask/lib/env.ts` the only module that reads `process.env`, and
`instrumentation.ts` imports it so the environment is validated at boot. `next build` compiles
`register` for the Edge runtime as well as for Node, and `lib/env.ts` imported `node:process`,
which that bundle cannot load: a build warning on every build, measured on 16.3.4. Next's own
remedy — branch `register` on `process.env.NEXT_RUNTIME` — would put a second `process.env` read in
`instrumentation.ts` and break the single-reader rule this ADR enforces.

It needed neither. `process.env` is defined in the Edge runtime as a global, so `lib/env.ts` reads
the global `process` rather than importing it, and measures the secret with `TextEncoder` rather
than `Buffer`. The build is clean, and `lib/env.test.ts` fails if either module in that bundle
imports a Node built-in or calls `Buffer` again. The generalisation: **a module `instrumentation.ts`
reaches is compiled for two runtimes**, so it may use only what both provide.

## Amended · 2026-09-22 — a fourth package an app may import

The rule above read "`apps/microtask` and `apps/macroplan` may import `contracts`, `api-client`,
`ui` — **nothing else**". It is now `contracts`, `api-client`, `ui` and **`app-session`**. (That list
grew twice more in phase 2, for `apps/macroplan` alone, and the two amendments below settle the
larger problem: the list was never the thing being enforced, and now is. Read this section for why
`app-session` is admitted, not for what the rule is.)

`@repo/app-session` holds the admin session both apps sign in through — the environment reader, the
sealed cookie, the sign-in refusal rules, the `?next=` sanitiser and the shape a Server Action
answers with (ADR 0047). It exists because the alternative was a second copy of the code that seals
a live admin bearer.

The boundary it opens is closed on its own side: `packages/app-session/eslint.config.js` bans
`@repo/store`, `@repo/kernel` and every `*-domain` package by name. Both apps import this package,
so a reach into the store from here would be their way around the API — the single-writer
assumption ADR 0002 relies on — and the ban is what stops the new edge becoming a tunnel.

One consequence for this record's own rules: `process.env` is now read in exactly one file in the
workspace, `packages/app-session/src/env.ts`, and in no app at all. Each app carries an
`environment.test.ts` that fails if a file in it reads the environment, or if its lint config ever
lifts `n/no-process-env`.

## Amended · 2026-09-23 — the app import rule was enforced as a denylist, and nobody had noticed

This ADR wrote the app boundary as an allowlist and enforced it as a denylist for thirteen days.
Both halves were measured against the working tree before this amendment was written.

**This section's own resolution was then overturned the same day.** It settled on the denylist, and
the reason given was a scope restriction on the agent that wrote it rather than a cost — it was
forbidden from editing `apps/`. The measurements below stand; read the second 2026-09-23 amendment at
the end of this record for what is enforced now.

**The written rule was an allowlist.** "may import `contracts`, `api-client`, `ui` — **nothing
else**", amended once on 2026-09-22 to admit `app-session`.

**The enforcement is a denylist, and always was.** `apps/microtask/eslint.config.js` and
`apps/macroplan/eslint.config.js` are byte-identical in this respect: one `no-restricted-imports`
block over `**/*.ts` and `**/*.tsx` whose `patterns` are `...productImportPatterns` from the shared
config plus two groups of their own. The first bans `@repo/store` and `@repo/kernel` — "the app reads
and writes only through @repo/api-client, so the API stays the single writer (ADR 0002, ADR 0027)".
The second bans `@repo/microtask-domain` and `@repo/macroplan-domain` — "the domain barrel reaches
node:path and node:crypto, and the app must not bypass the API (ADR 0014, ADR 0027)". Nothing else
is named, so every other `@repo/*` package is permitted.

Phase 2 is the measurement that made the gap visible. `apps/macroplan` gained runtime dependencies on
**`@repo/canvas`** and **`@repo/schedule`** (ADR 0055) — two entries where ADR 0049 predicted one —
and **no lint config changed anywhere**, because neither package was on a denylist. Under the rule as
written, both imports were violations that CI was always going to pass.

### The allowlist is buildable, and it is not buildable from here

Measured rather than assumed, since this ADR's other amendment is about a rule that read as though it
were in force and was not. ESLint 9.39.5 builds each `no-restricted-imports` pattern group's matcher
with the `ignore` package and asks `matcher.ignores(importSource)`, so gitignore-style negation works
and one group expresses the whole allowlist. Checked against every specifier the two apps actually
use, deep subpaths included, a group of `@repo/*` and `@repo/*/*` with a `!` entry for each of
`contracts`, `api-client`, `ui`, `app-session`, `canvas` and `schedule` admits exactly those six and
refuses `@repo/kernel`, `@repo/store` and both `*-domain` packages. Six entries is the union of the
two apps: those are the only `@repo/*` packages either Next app imports, and
`apps/macroplan/package.json` depends on precisely them. (`apps/microtask` depends on four of the six,
which is why the enforced allowlists are **per app** rather than this union — see the second
2026-09-23 amendment.)

**What cannot be done is apply it from `packages/eslint-config`,** which is the place this ADR's own
generalisation — "a path-scoped rule is decided centrally and applied locally" — sends you first.
Two reasons, and the first is already written down in the shared config itself:

- **Rule options do not merge across flat-config objects.** `productImportPatterns`' own TSDoc says
  it: "the rule's options do not merge across flat-config objects, and a second matching block
  replaces the first outright." Each app's trailing block matches `**/*.ts` and `**/*.tsx`, so any
  `no-restricted-imports` added to `base` is replaced by it and silently does nothing.
- **The one shared export the apps do spread is spread by nine other packages.**
  `productImportPatterns` reaches `api-client`, `app-session`, `contracts`, `kernel` and `store`
  directly and `canvas`, `macroplan-domain`, `schedule` and `ui` through `noProductImports`. Their
  legitimate imports differ from an app's and from each other's — `@repo/store` imports
  `@repo/kernel`, `@repo/canvas` imports `@repo/schedule` — so an allowlist put there would have to be
  the union of nine different allowlists, which would permit `@repo/canvas` inside `@repo/kernel`. A
  union of allowlists is not an allowlist; it is a weaker denylist wearing the name.

A per-app allowlist therefore belongs in each app's own `eslint.config.js`, in the block that already
exists, as one more pattern group.

### What the denylist is for — which is not the same as what the rule is

**This subsection originally resolved on the denylist, and that resolution is withdrawn.** The
argument below is why the denylist is kept rather than replaced; it is not why the allowlist was
declined. The allowlist is enforced as of the second 2026-09-23 amendment, and the body's bullet
states both lists.

A denylist entry here carries a **reason**, and both of the ones in the config do: `store` and
`kernel` because the API is the single writer, the `*-domain` packages because their barrels reach
`node:path` and `node:crypto`. An allowlist entry can only ever carry a count, and its refusal
message can only say *not on the list*. The property this ADR actually wants is that **an app cannot
reach the disk, the store, or a product's storage layer** — which is what the denylist states, by
name, with the ADR numbers attached.

`@repo/schedule` and `@repo/canvas` are the test of that reading, and the denylist got them right. Both
are pure by enforcement rather than by intention: each carries a `purity.test.ts` that fails on any
`node:` specifier in any quote style or import form and pins its `dependencies` object exactly — empty
for `schedule`, exactly `{ "@repo/schedule": "workspace:*" }` for `canvas`. Neither can reach anything
an app is banned from, so admitting them was safe — and an allowlist would have failed the build in
`apps/macroplan`, the only app that imports either, and forced the config edit that records the
decision. That edit is what the second amendment makes, and the rationale is in the config and in
this record rather than only in a diff.

The cost the denylist alone carried is worth keeping on the page, because it is what the allowlist
buys: **any new `@repo/*` package was admitted into both apps by default.** Nothing would have
stopped an app importing a package nobody had thought about, and the failure was silent — `pnpm add`
and a green gate. What had to be true for that to stay safe was that every package an app may import
carries its own purity guarantee, which is not a property a lint rule could check. That requirement
has not gone away — anybody adding a shared package an app will import should still add the
`purity.test.ts` that `schedule` and `canvas` carry — but it is no longer the *only* thing standing
between an app and an arbitrary package.

One thing found while measuring and not fixed in this amendment, because it is in `apps/` and this
amendment was not: both apps' configs carried a leading comment claiming "The shared config applies
react-hooks to `**/*.tsx` only", and then re-enabled the two hook rules for `**/*.ts`. `base` applies
them to `['**/*.ts', '**/*.tsx']` already, so those blocks were redundant restatements rather than the
widening they said they were. Harmless — the rules were on either way — but the comment was false and
the next person to trust it would conclude a `.ts` hook is unchecked somewhere it is not. Fixed in the
second amendment below.

## Amended again · 2026-09-23 — the allowlist is enforced, and the denylist stays

The amendment above settled on the denylist. That resolution is withdrawn, and the reason it has to
be is that the blocker it named was not a cost: the agent that wrote it was forbidden from editing
`apps/`, which is the only place the allowlist can live. Priced honestly, the allowlist is **one
pattern group per app**, added to a `no-restricted-imports` block that already existed. So it is
enforced, and this ADR now says what the config does for the first time since it was written.

**Both lists stand, and they are not redundant.** Everything the previous amendment argues about
reasons is kept, because it is the reason the denylist is not deleted: a denylist entry names the
invariant an import would break — the API is the single writer, the barrel reaches `node:path` — where
an allowlist entry can only carry a count and refuse with *not on the list*. The allowlist is what
makes admitting a package a deliberate edit; the denylist is what keeps the reasons attached to the
four packages that must never be imported. ESLint evaluates every pattern group, so a banned import is
reported **twice**, once from each list — measured, not assumed (lint output, wrapped to fit):

```
apps/microtask/allowlist-probe.ts
  2:1  error  '@repo/store' import is restricted from being used by a pattern. the app reads and
              writes only through @repo/api-client, so the API stays the single writer (ADR 0002,
              ADR 0027)
  2:1  error  '@repo/store' import is restricted from being used by a pattern. this app may import
              only @repo/api-client, @repo/app-session, @repo/contracts and @repo/ui; anything else
              is a decision to record before it is a dependency (ADR 0027)
```

### Each app's allowlist is its own

The previous amendment's six-package list is the **union** of the two apps, and enforcing a union
would repeat, per app, the mistake it diagnoses in `packages/eslint-config`: a union of allowlists is
a weaker denylist wearing the name. So each app gets the set it actually imports, determined from its
`package.json` `dependencies` and confirmed by grepping every `@repo/*` specifier in its sources:

| App | May import | Refused by the allowlist alone |
| --- | --- | --- |
| `apps/microtask` | `api-client`, `app-session`, `contracts`, `ui` | `canvas`, `schedule`, `eslint-config`, `typescript-config`, and any future `@repo/*` |
| `apps/macroplan` | those four plus `canvas`, `schedule` | `eslint-config`, `typescript-config`, and any future `@repo/*` |

`@repo/schedule` in `apps/microtask` is the case that shows the two apps are now genuinely different,
and that the allowlist bites where no denylist entry exists:

```
apps/microtask/allowlist-probe.ts
  1:1  error  '@repo/schedule' import is restricted from being used by a pattern. this app may
              import only @repo/api-client, @repo/app-session, @repo/contracts and @repo/ui;
              anything else is a decision to record before it is a dependency (ADR 0027)
```

`@repo/eslint-config` and `@repo/typescript-config` are on neither allowlist and need no exception:
both are devDependencies reached from `eslint.config.js` and `tsconfig.json`, and the block is scoped
to `**/*.ts` and `**/*.tsx`, so no `.js` or `.json` file is matched by it.

### The negation behaviour, re-measured here

The mechanism the previous amendment records was verified again before relying on it, because a rule
that silently admits everything is the failure mode this ADR is most exposed to. In ESLint 9.39.5,
`no-restricted-imports` builds each group's matcher as
`ignore({ allowRelativePaths: true, ignorecase: !caseSensitive }).add(group)` and tests
`group.matcher.ignores(importSource)` (`lib/rules/no-restricted-imports.js`, lines 311 and 761),
against `ignore@5.3.2`. Driven through `Linter#verify` with each app's real group, over every
`@repo/*` specifier in both apps plus fabricated deeper ones, the group admits exactly the permitted
set including **every depth of subpath** — `@repo/ui/components/button`,
`@repo/ui/transfer/vocabulary.js`, `@repo/ui/components/ui/tabs`, `@repo/app-session/api` — and
refuses `@repo/kernel/ids`, `@repo/store/fs/node` and
`@repo/macroplan-domain/views/plan-view.js`. Two wildcards cover arbitrary
depth because gitignore semantics ignore a matched directory's whole subtree; `!@repo/ui` plus
`!@repo/ui/*` re-admits it, subpaths included. Relative and third-party specifiers are untouched.

Proved both ways by mutation rather than by reading: a real `@repo/store` import added to a scratch
file in each app fails `pnpm --filter <app> lint` with both messages above, and a scratch file
importing only permitted deep subpaths passes with no output. Both scratch files were then deleted.

### The redundant hook blocks are gone

The false comment the previous amendment reported is fixed by deletion rather than by rewording, since
what it described was the block's only justification. Both apps' `.ts` `react-hooks` blocks are removed;
`base` already applies `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` to
`['**/*.ts', '**/*.tsx']`, which is where the incident those comments remembered — a dropped dependency
in a `.ts` hook sending every save to the wrong tab with lint green — is actually paid for. Verified by
mutation in both apps: a `.ts` file with a conditional `useState` and a `useEffect` missing a
dependency still reports `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` with the app
blocks deleted. Removing them also removed each app's `base.find(...)` lookup for the plugin instance.
