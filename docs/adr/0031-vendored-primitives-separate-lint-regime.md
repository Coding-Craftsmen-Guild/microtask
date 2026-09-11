# ADR 0031 — Vendored primitives are a separate lint regime, applied where its glob resolves

**Status:** Accepted · 2026-09-11

## Context

ADR 0027 anticipated that generated components would not fit an 80-line cap and wrote an override
for `packages/ui/src/primitives/**`. Vendoring the 22 primitives showed that directory does not
exist and never will: the CLI writes to `src/components/`, because ADR 0025's exports map is
`"./components/*": "./src/components/*.tsx"` and `components.json`'s `ui` alias has to agree with
it. Pointing the override at `primitives/**` would mean diverging the alias from the exports map so
that consumers import from one path and the generator writes to another.

That left the real question unanswered, so it was measured rather than guessed: what does vendored
shadcn output actually violate?

**112 problems, across exactly two rules.** `jsdoc/require-jsdoc` 103 times and `max-lines` 9
times, over 22 files. Nothing else fires. `local/tsdoc-comments-only` costs **zero**, because
shadcn 4.21.0 emits no comments at all; so do `max-lines-per-function`, `complexity`, `max-depth`,
`max-params`, `max-nested-callbacks`, `no-explicit-any`, `consistent-type-imports`, both
`react-hooks` rules, and the whole `typescript-eslint` strict set.

And the override, written the way ADR 0027 wrote it, does nothing at all. A flat-config `files:`
glob resolves against the **consuming** config's base path, which is the trap ADR 0027 documents
for `import/no-restricted-paths` and then walks into itself. Measured against the real tree:
`files: ['packages/ui/src/components/**/*.tsx']` in the shared config left all 112 problems
standing — the glob matches nothing — while `files: ['src/components/**/*.tsx']` in
`packages/ui/eslint.config.js` gave 0.

## Decision

**Two regimes inside one package.** `packages/ui/src/components/**` is vendored output and gets an
exemption. `packages/ui/src/shell/**`, `src/lib/**` and `src/hooks/**` are our own shared React and
keep every ADR 0027 rule with no exemption at all.

**The exemption turns off `max-lines` and `jsdoc/require-jsdoc`, and nothing else.** That is the
measurement above read literally. In particular `local/tsdoc-comments-only` stays **on**: it costs
nothing today, and switching it off while we are here would only buy the right for a future
`shadcn add` to land narration in the package without CI noticing.

**`packages/eslint-config` exports a named override factory** — `vendoredComponents()` — and
`packages/ui/eslint.config.js` spreads it. The rule set is still decided in one shared place, which
is the property ADR 0027 wants, while the glob is applied where it resolves, which is the property
flat config demands. A literal `rules` block copied into the package satisfies the second and
abandons the first; that is not the fix.

**The two type errors are patched at the call site.** Typechecking the vendored set produced exactly
2 errors, both `TS2375` from `exactOptionalPropertyTypes`, both one expression:
`dropdown-menu.tsx:93` passes a possibly-`undefined` `checked` straight back, and `sonner.tsx:11`
widens an indexed access through an `as` assertion. `noUncheckedIndexedAccess` — the flag ADR 0023
predicted would be the irritating one — costs **zero** here.

**No build step is added to `packages/ui`, and no tsconfig flag is relaxed for the app.** Both were
considered as alternatives to two mechanical lines and both were measured to solve nothing: the
errors are *inside* `packages/ui`, so its own `tsc` reports them either way; Turbopack transpiled
the raw `.tsx` without complaint; and `check-exports` exits 0 against raw source. A build step would
buy nothing and break ADR 0025's no-build-step rule. Relaxing `exactOptionalPropertyTypes` for the
app would disable the flag for every component the app will ever have, to avoid editing two lines.

## Consequences

- `packages/ui` carries an `eslint.config.js` of its own that is not merely `export default
  sharedConfig`. That is now true of any package needing a path-scoped rule, and it is the honest
  shape given how flat config resolves globs.
- Re-running `shadcn add` can reintroduce the two `TS2375` expressions, so they are patches, not
  fixes upstream. `tsc` catches them on the next run, which is the intended cost of not disabling
  the flag.
- Our own shared components are held to the full rule set, including TSDoc on every export, so the
  package's public surface stays documented even though most of its files are generated.
- The exemption is auditable as a number: 112 problems suppressed, and any growth in that count is
  a new generator behaviour rather than a new opinion.

## Alternatives considered

**Move the vendored output to `src/primitives/` so ADR 0027's glob becomes true.** Rejected: it
requires `components.json`'s `ui` alias to disagree with the exports map, which makes the generator
write somewhere consumers do not import from — a much worse trap than a wrong glob in an ADR.

**Disable `local/tsdoc-comments-only` for vendored files while the override is being written
anyway.** Rejected on the measurement: it fires zero times, so the only thing it could ever suppress
is a comment a future generator version starts emitting, which is exactly when we would want to see
it.

**Keep the override in the shared config and accept that it is inert.** This is the state the
measurement found, and it is the worst of the options, because the config *reads* as though the
exemption exists. ADR 0027 bans file-level `eslint-disable` precisely so that suppression is
visible; an inert glob is invisible suppression's mirror image — visible intent with no effect.
