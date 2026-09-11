# ADR 0025 — shadcn/ui and Tailwind v4 live in `packages/ui`, with explicit `@source` paths

**Status:** Accepted · 2026-09-10

## Context

The rule from ADR 0001 is that apps hold only what cannot be shared, so the component library and
the app shell belong in `packages/ui`. shadcn/ui's CLI, however, installs into an *app* by default,
and Tailwind v4 discovers class names by scanning files — which raises the question of whether it
scans a sibling workspace package at all.

Verification found it does not, and found the official template is wrong about it.

Tailwind v4's automatic content detection **hard-codes `node_modules` as an ignored directory** in
its Rust scanner, independent of `.gitignore`. pnpm's workspace links live under `node_modules`
(`apps/microtask/node_modules/@repo/ui → ../../../packages/ui`), so automatic detection never
traverses them. Worse, the **base** for automatic detection is `process.cwd()`, not the stylesheet's
directory — so the official shadcn monorepo template appears to work only by accident of `next dev`
running with the app as cwd, which is not a property to depend on inside Docker.

And the template's own `packages/ui/src/styles/globals.css` is **confirmed broken**. It ships:

```css
@source "../../../apps/**/*.{ts,tsx}";        /* → <repo>/packages/apps/**   does not exist */
@source "../../../components/**/*.{ts,tsx}";  /* → <repo>/packages/components/** does not exist */
@source "../**/*.{ts,tsx}";                   /* correct */
```

`@source` resolves relative to **the stylesheet containing it**. From `packages/ui/src/styles/`,
reaching `<repo>/apps` needs **four** `../`, not three. Two of the three lines point at directories
that do not exist, and Tailwind gives no diagnostic for a glob that matches nothing.

## Decision

**One stylesheet**, in the package, imported by both apps' root layouts through the package exports
map. Both apps therefore share one theme.

**Automatic detection is switched off** and every scan root is explicit, so the result does not
depend on the working directory:

```css
/* packages/ui/src/styles/globals.css */
@import "tailwindcss" source(none);
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@source "../**/*.{ts,tsx}";                              /* the package itself */
@source "../../../../apps/microtask/**/*.{ts,tsx}";       /* four ../ to reach apps/ */
```

A line is added for `apps/macroplan` when that app exists. Every workspace package that can emit a
class string **and is reachable from an app** needs one — which, measured, is fewer packages than
this ADR first listed; see the amendment below for the two lines that were dropped. **No
`tailwind.config.js`** — v4 does not auto-detect one, and `safelist`, `corePlugins` and `separator`
are unsupported in v4 even via `@config`. A safelist becomes `@source inline(...)`.

**`shadcn add` runs against `apps/microtask`, never against `packages/ui`.** The app's
`components.json` is what routes primitives into the package and blocks into the app. Both
`components.json` files must agree on `style`, `iconLibrary` and `baseColor` — and since the docs
and the shipped template disagree on the `style` value, we do not hand-author it: run
`shadcn init --monorepo`, let the CLI author the **app's** file, derive the package's from it, then
assert they match. `"tailwind": { "config": "" }` (empty string) is required for v4. The CLI cannot
be invoked with `pnpm dlx` here, and `add` runs from outside the workspace — both measured, and both
in the amendment below.

**`packages/ui` ships no build step.** Per-file subpath exports point at raw source
(`"./components/*": "./src/components/*.tsx"`, plus `./lib/*`, `./hooks/*`, `./globals.css`), and
Turbopack transpiles workspace source directly. **No barrel file, ever** — a barrel would mix client
and server modules and drag every component into any consumer.

`'use client'` goes at the top of each individual component file that needs it, above all imports.
shadcn primitives are a **mix**, and the mix is far more client-heavy than this ADR first guessed:
measured over the 22 vendored primitives, **6 are server-safe** — `badge`, `button`, `card`, `input`,
`skeleton`, `textarea` — and the other 16 carry the directive. `label`, `separator` and `progress` are
client components too. Compound pieces are exposed as named exports (`DialogContent`, `TabsList`) —
never as static properties, because `Menu.Item` is `undefined` across the RSC boundary.

`transpilePackages` is **not** required: Turbopack transpiles workspace packages automatically under
both routers, and webpack does the same for the App Router. It is not written into the config as a
requirement.

## Consequences

- Adding a workspace package that renders classes means adding an `@source` line. Forgetting it
  produces silently unstyled components with no error, so it goes in the ADR and in the package
  template.
- The four-`../` arithmetic is fragile against moving the stylesheet. It is written here with the
  reasoning so a move is a deliberate recount.
- `source(none)` means a genuinely new top-level directory is invisible until listed. That is the
  trade for Docker-deterministic builds.
- No barrel file makes imports more verbose (`@repo/ui/components/button`). It is also what keeps a
  Server Component from pulling in a client-only dialog.
- Class names must never be built by interpolation — props map to complete class strings — because
  the scanner reads source as plain text and cannot see a composed name.

## Alternatives considered

**Copy the official template's `globals.css`.** Rejected: two of its three `@source` lines are
broken, confirmed verbatim from the shipped file.

**Rely on automatic content detection.** Rejected twice over: `node_modules` is on the documented
skip list so pnpm links are never traversed, and the scan base is `process.cwd()`.

**Point `@source` into `node_modules/@repo/ui`.** This does work — source bases are canonicalized, so
the pnpm symlink resolves to the real directory, and the bare-directory form is what the docs show.
Rejected in favour of the direct relative path, which is clearer about what is being scanned.

**Components in each app, sharing only primitives.** Less coupling, but it violates the rule in
ADR 0001 and would duplicate the app shell.

## Amended by the vendoring spike · 2026-09-11

The decision holds — one stylesheet in the package, explicit `@source`, no build step, no barrel —
and the arithmetic it turns on is now proven rather than reasoned. **Double ablation:** deleting the
package scan root collapses the built CSS from 70,519 to 10,806 bytes and every `packages/ui` class
vanishes; deleting the app root drops the app's class and keeps the package's. Note for anyone
repeating it: grepping built CSS for a bracket value returns 0 even when the class **is** emitted,
because the selector is escaped and the declaration minified. Match on the declaration, not the
class.

Six of this ADR's instructions could not be executed as written. They are corrected above where the
instruction lives; the evidence is here.

**`pnpm dlx shadcn@4.21.0` cannot run in this repo.** It dies with `TypeError: o.deepPartial is not
a function`, because pnpm applies this repo's `overrides: { zod: 'catalog:' }` (4.6.1) to the `dlx`
install while shadcn declares `zod ^3.24.1`, and `deepPartial` was removed in Zod 4. The ADR's
literal instruction is unrunnable, and the failure names neither zod nor the override. `npx --yes
shadcn@4.21.0` works — npm ignores pnpm's overrides — and once `shadcn` is a workspace dependency,
`add` must be run **from outside the workspace** with `-c <app dir>`, for the same reason.

**`init --monorepo` does not write two `components.json` files.** On 4.21.0 it wrote **one**,
app-local, with `ui: "@/components/ui"`; it also created `apps/microtask/lib/utils.ts` and put the
theme in the app's `globals.css`. "Let the CLI write both, then assert they match" is not
achievable. The achievable form is the one now in the Decision: let the CLI author the app's file,
derive the package's from it, assert they agree.

**`init` is blocked without an app-local stylesheet.** It refuses with "No Tailwind CSS
configuration found" even with `tailwindcss` and `@tailwindcss/postcss` installed. "One stylesheet,
in the package" is unreachable by the CLI's own path, so a throwaway app stylesheet exists during
`init` and is removed afterwards. The end state is the one this ADR specifies; the route to it is
not.

**The two `@repo/*-domain` `@source` lines were provably dead, and are omitted.** The shared ESLint
config bans importing `@repo/*-domain` from apps and from shared UI code (ADR 0027), so no class
string authored in a domain package can reach a rendered tree, and therefore none can reach the
stylesheet. Keeping them would encode two scan roots that can never contribute — in a file whose
entire design premise is that an unlisted root fails **silently**, which makes a decorative root the
most expensive kind of line to leave behind.

**The stylesheet makes the CLI a runtime dependency.** The generated `globals.css` imports
`shadcn/tailwind.css`, so `shadcn@4.21.0` is a genuine runtime dependency of `packages/ui` and not a
tool. `turbo prune` must keep it for the Next builder stage (ADR 0026); dropping it from the
dependency list because "the CLI is a dev tool" breaks the build with a missing import, not a
missing command.

**Vendored code does not import a local `cn`.** All 21 generated files import `cn` from the published
npm package `cn@0.2.6`, and setting `aliases.utils` changed nothing; the CLI's own generated
`lib/utils.ts` was literally a re-export of it. That briefly gave `packages/ui` **two** `cn`
implementations — the npm one the components use, and a `clsx` + `tailwind-merge` one in
`src/lib/utils.ts` for our own code. Resolved the way round that survives regeneration:
`src/lib/utils.ts` re-exports `cn` from the package, and `clsx` and `tailwind-merge` are dropped as
direct dependencies. Rewriting 21 generated import lines instead would be undone by the next
`shadcn add`.

**The CLI installed dependencies into the wrong package.** Component files went to `packages/ui`
while `cmdk`, `cn`, `next-themes`, `sonner`, `class-variance-authority`, `lucide-react`, `radix-ui`,
`tw-animate-css` and `shadcn` were all added to `apps/microtask`, with carets. Under pnpm's isolated
layout `packages/ui` could not have resolved any of them. They are relocated to `packages/ui` and
pinned exact. Any future `add` needs the same check.

**One latent gap, recorded rather than fixed.** `packages/ui/src/hooks/` is empty, so the declared
`./hooks/*` subpath has no backing directory in git. `check-exports` reports it as an unresolved
wildcard and exits 0 — so it is latent, not a failure, and it resolves itself the first time a
shared hook is written.
