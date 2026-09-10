# ADR 0023 — TypeScript everywhere, one strict shared config

**Status:** Accepted · 2026-09-10

## Context

Moving from JavaScript to TypeScript was a stated requirement. The open decision is *how* — how
strict, where the config lives, and how much runtime validation TypeScript is allowed to replace.

The current app has a real habit worth preserving: `docdiff.js` is shared verbatim between the
server and the browser, and `isValidDoc` validates untrusted input at the boundary. That is a
runtime concern, and types cannot do it.

## Decision

TypeScript across every app and package. One `packages/typescript-config` holding a strict base,
extended by each workspace — `strict: true`, plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`.

**Types are not validation.** Every boundary — HTTP request bodies, imported bundles, files read off
disk — is validated at runtime with a schema, and the TypeScript type is *derived* from that schema
rather than declared alongside it. There is no hand-written interface that a payload is asserted to
match with `as`.

`any` is not used. Untrusted input enters as `unknown` and is narrowed by a schema.

## Consequences

- One place to change compiler strictness, and no package can quietly opt out of it.
- `noUncheckedIndexedAccess` will be irritating exactly where it should be — the current code indexes
  arrays freely (`project.tabs[0]`, `tabs[Math.max(0, index - 1)]`), and each of those becomes an
  explicit "what if it is missing?" decision. That is the point.
- Deriving types from schemas means the schema is the single source of truth for a shape, which is
  what makes the OpenAPI document trustworthy.
- A build step now exists between source and runtime for the API, which the current zero-dependency
  `node server.js` did not have.

## Alternatives considered

**JSDoc types with `checkJs`.** Keeps plain `.js` files and needs no build step. Rejected: the
requirement was TypeScript, and shared packages consumed by two apps benefit from real declaration
output.

**Per-package tsconfig with no shared base.** More flexible, and guarantees drift. Rejected.

**Non-strict mode to move faster.** Rejected — porting untyped JavaScript is exactly when strictness
pays, because it surfaces the implicit assumptions the original code was relying on.
