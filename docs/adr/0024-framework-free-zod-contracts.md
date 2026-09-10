# ADR 0024 — Zod contracts stay framework-free; the API assembles the OpenAPI document

**Status:** Accepted · 2026-09-10

## Context

`packages/contracts` is meant to be one source of truth: runtime validation, the OpenAPI document,
and the TypeScript types both Next apps import. The obvious implementation is the one every
`@hono/zod-openapi` example shows — import `z` from `@hono/zod-openapi` and tag schemas with
`.openapi('Task')`.

That does not work for a package a **browser** app imports, and it fails in a way that passes CI:

- `.openapi()` is not a Zod method. It is installed onto `zod.ZodType.prototype` by
  `extendZodWithOpenApi(z)`, which `@hono/zod-openapi` runs as a top-level side effect.
- In `apps/api` the patch is present, so plain-Zod schemas appear to have `.openapi()` too. Contracts
  compiles, the API works, and the **Next apps throw `schema.openapi is not a function` at runtime**.
- `hono`, `@hono/zod-openapi` and `@asteasolutions/zod-to-openapi` all leave `sideEffects` undefined,
  and the entry point runs the patch at module scope — so the module body cannot be tree-shaken even
  in principle. One stray import puts the whole Hono graph in both browser bundles.

Verified today: `@hono/zod-openapi@1.6.3` peers on `zod ^4.0.0` (Zod 3 unsupported), and current Zod
is `4.6.1`.

## Decision

**`packages/contracts` depends on `zod` and nothing else.** Schemas are annotated with plain Zod's
`.meta()`, never `.openapi()`:

```ts
// packages/contracts — always this
import { z } from 'zod'

export const Task = z.object({ /* … */ })
  .meta({ id: 'Task', description: 'A single checklist task' })
```

Enforced, not merely intended — `packages/contracts/eslint.config.js`:

```js
'no-restricted-imports': ['error', { paths: [
  { name: '@hono/zod-openapi', message: 'contracts must stay framework-free; use z.meta({ id }) from zod' },
  { name: 'hono', message: 'contracts must stay framework-free' },
  { name: '@asteasolutions/zod-to-openapi', message: 'contracts must stay framework-free' },
]}]
```

**One physical Zod.** Two copies is a partial, confusing failure: the prototype patch lands on
whichever copy Hono resolved, but the generator's type guards are structural, so *some* things keep
working. Pinned centrally:

```yaml
# pnpm-workspace.yaml
catalog:
  zod: 4.6.1
overrides:
  zod: 'catalog:'
```

Pinned **exactly**, not as `^4.6.1`: with `overrides` in play a range still lets transitive
dependencies float within `^4`, which is the thing being prevented. `strict-peer-dependencies` is
set in `.npmrc` rather than here, because `auto-install-peers` is also on — and that pairing is
what makes this override load-bearing rather than belt-and-braces, since auto-installing peers is
the most likely route to a second physical copy.

Every `package.json` uses `"zod": "catalog:"`. Verified after install with `pnpm why zod -r`
(exactly one version) and `ls node_modules/.pnpm | grep -c '^zod@'` (exactly `1`). That assertion
runs in the plan at the first task that depends on Zod, and again at the end.

**`apps/api` owns the OpenAPI document.** It emits it from a build script that calls the generator
directly:

```ts
// apps/api/scripts/emit-openapi.ts
import { app } from '../src/app'
writeFileSync('openapi.json', JSON.stringify(app.getOpenAPI31Document({ /* … */ }), null, 2))
```

Never by curling the running container: `app.doc()` generates per request and turns a generation
error into a 200-shaped 500 JSON body, which a codegen step would happily consume.

If a genuinely `.openapi()`-only feature is ever needed, it goes behind a second subpath export
(`@repo/contracts/openapi`) that the Next apps never import. The main entry stays framework-free.

## Consequences

- The Next apps get validation and types with no server framework in their bundles.
- `packages/contracts` must be **compiled** (`tsc` to `dist`, `exports` pointing at `dist` with
  types), because `apps/api` is plain Node and cannot import `.ts`. Node's type stripping is not
  usable here: it ignores tsconfig `paths`, requires explicit import extensions, and rejects `.tsx`.
- Two Zod annotation styles now exist in the ecosystem's examples and ours is the less common one.
  The lint rule and this ADR are what stop someone "fixing" it back.
- **Duplicate `.meta({ id })` fails silently — it does not throw.** Verified: two different schemas
  tagged `'Dup'` produced a document with **one** `Dup` component and both `$ref`s pointing at
  whichever won. The second schema's shape is lost with no error at registration *or* at conversion.
  This is worse than the documentation implies, and it means the unique-id test in
  `packages/contracts` is the **only** line of defence, not a belt-and-braces extra. CI also
  smoke-tests that `GET /openapi.json` returns 200.

## Verified by spike · 2026-09-10

Executed against `zod@4.6.1`, `hono@4.13.7`, `@hono/zod-openapi@1.6.3` — a contracts module
importing only plain Zod, consumed by an `OpenAPIHono` app.

**The decision holds.** `.meta({ id })` on a plain-Zod schema emits `components.schemas.Task` and the
response references it as `$ref: '#/components/schemas/Task'`. Nested schemas (`Tab`) are extracted
too, the `description` carries through, untagged schemas inline as expected, path parameters work,
and nothing emits an invalid `#/definitions/…` ref. The `z.toJSONSchema` fallback is not needed.

**The trap is real, and confirmed in both directions.** `Task.openapi` is `typeof 'function'` when
the module graph includes `@hono/zod-openapi`, and `undefined` when contracts is imported alone. So
calling `.openapi()` in contracts genuinely would compile, pass tests in the API, and throw only in
the browser. The lint rule is load-bearing.

Three further silent failures confirmed, all of which the implementation must avoid:

- **A plain `Hono` subapp mounted into an `OpenAPIHono` tree vanishes from the document.** A tree
  with one plain child and one `OpenAPIHono` child produced exactly one path — the plain branch
  served traffic while being invisible to the spec. Every level must be `OpenAPIHono`.
- **Mount-path syntax is the nastiest of the set.** `app.route('/projects/{projectId}', child)`
  returns **HTTP 404** for every child route, while the OpenAPI document renders the path
  *correctly either way*. So the document looks right and the API is broken. Use `:param` in
  `app.route()` and `{param}` in `createRoute()`.

## Alternatives considered

**Import `z` from `@hono/zod-openapi` in contracts**, the documented happy path. Rejected: runtime
`TypeError` in the browser, plus the entire Hono graph in both client bundles.

**Two packages** — `contracts` for the browser, `contracts-openapi` for the API. Rejected as
premature; the subpath export achieves it if it ever becomes necessary.

**Hand-assemble the document from `z.toJSONSchema`.** The fallback above. Rejected as the default
because it means maintaining ref rewriting and input/output passes by hand.

**A note on enforcement:** aliasing `hono` to `false` in a `webpack()` config to prove it never
reaches the client bundle is a tempting CI check, but the mere presence of a `webpack()` key fails
`next build` under Turbopack in Next 16. The ESLint rule is the enforcement.
