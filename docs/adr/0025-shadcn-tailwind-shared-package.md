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

@source "../**/*.{ts,tsx}";                              /* the package itself */
@source "../../../../apps/microtask/**/*.{ts,tsx}";       /* four ../ to reach apps/ */
@source "../../../../apps/macroplan/**/*.{ts,tsx}";
@source "../../../microtask-domain/src/**/*.{ts,tsx}";
@source "../../../macroplan-domain/src/**/*.{ts,tsx}";
```

Every workspace package that can emit a class string needs a line. **No `tailwind.config.js`** — v4
does not auto-detect one, and `safelist`, `corePlugins` and `separator` are unsupported in v4 even
via `@config`. A safelist becomes `@source inline(...)`.

**`shadcn add` runs from `apps/microtask`, never from `packages/ui`.** The app's `components.json` is
what routes primitives into the package and blocks into the app. Both `components.json` files must
agree on `style`, `iconLibrary` and `baseColor` — and since the docs and the shipped template
disagree on the `style` value, we do not hand-author it: run `shadcn init --monorepo`, let the CLI
write both, then assert they match. `"tailwind": { "config": "" }` (empty string) is required for v4.

**`packages/ui` ships no build step.** Per-file subpath exports point at raw source
(`"./components/*": "./src/components/*.tsx"`, plus `./lib/*`, `./hooks/*`, `./globals.css`), and
Turbopack transpiles workspace source directly. **No barrel file, ever** — a barrel would mix client
and server modules and drag every component into any consumer.

`'use client'` goes at the top of each individual component file that needs it, above all imports.
shadcn primitives are a **mix**: `button`, `card`, `badge`, `input` are server-safe; `dialog`, `tabs`,
`dropdown-menu`, `tooltip` are not. Compound pieces are exposed as named exports (`DialogContent`,
`TabsList`) — never as static properties, because `Menu.Item` is `undefined` across the RSC boundary.

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
