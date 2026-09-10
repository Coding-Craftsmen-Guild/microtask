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
  zod: ^4.6.1
overrides:
  zod: 'catalog:'
strictPeerDependencies: true
```

Every `package.json` uses `"zod": "catalog:"`. Verified after install with `pnpm why zod -r`, which
must print exactly one line.

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
- `.meta()` does **not** validate ids on registration — it overwrites silently. The duplicate-id error
  is thrown later, during conversion. So `packages/contracts` carries a unique-id test, and CI smoke-
  tests that `GET /openapi.json` returns 200.
- **Highest-value open risk:** that a plain-Zod schema carrying only `.meta({ id: 'Task' })` — with no
  `extendZodWithOpenApi` and no explicit registry call — actually emits `components.schemas.Task` and
  a `$ref` to it through `OpenAPIHono`'s 3.1 document. Both halves are documented (the peer on Zod 4,
  and zod-to-openapi's statement that the `.meta`-with-`id` and `.openapi()` forms "produce exactly
  the same results"), but the end-to-end path was not executed. **This is a ten-minute spike to run
  before implementation starts.** If it fails, the fallback is hand-assembling components with
  `z.toJSONSchema(…, { target: 'openapi-3.0', io: 'input', uri: id => '#/components/schemas/' + id })`,
  stripping `$id`/`$schema` — because the default output emits `#/definitions/…` refs, which are
  invalid in an OpenAPI document.

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
