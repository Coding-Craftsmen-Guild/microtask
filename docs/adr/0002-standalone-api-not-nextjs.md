# ADR 0002 — One standalone API, not Next.js route handlers

**Status:** Accepted · 2026-09-10

## Context

The requirement is "one API, two consumers", with every capability reachable over HTTP and
documented with Swagger. Next.js can host the data itself through route handlers, so the API could
have lived inside one of the two apps.

## Decision

A third deployable: `apps/api` — Hono on `@hono/node-server`, plain Node, reading and writing JSON
files. It owns the data volume. Both Next apps are HTTP clients and touch no data directly.

Hono rather than bare `node:http` because generated OpenAPI is a requirement, and a hand-maintained
spec drifts from the code the first time someone forgets to update it. Hono buys validation, spec
generation and Swagger UI from one schema declaration.

## Consequences

- The API service gains runtime dependencies. Today's runtime image carries no `node_modules` at
  all; that property is lost. Accepted as the price of a spec that cannot drift.
- Data has exactly **one** writer, so the in-process write lock stays valid — which it would not be
  if two Next apps wrote files independently.
- One more service to deploy, and an internal network hop on every read.
- The API is independently consumable by automation, which was the point of requirement 6.

## Alternatives considered

**Next.js route handlers inside one app.** One framework, one toolchain. Rejected: it makes one
product the other's backend and couples API availability to a UI deploy.

**NestJS.** The most conventional "SOLID services" structure and the richest Swagger output.
Rejected as disproportionate to a JSON-file-backed checklist app.

**Bare `node:http` with a hand-written OpenAPI document.** Keeps zero dependencies. Rejected: the
spec would drift from the code, which defeats the purpose of having one.
