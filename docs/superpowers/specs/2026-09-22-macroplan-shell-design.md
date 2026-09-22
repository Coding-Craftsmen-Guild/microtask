# Macroplan: the working shell, and the seam it proves

**Status:** built
**Date:** 2026-09-22
**Branch:** `feat/macroplan-shell`
**Decisions:** [ADR 0047](../../adr/0047-one-admin-session-two-cookies.md), amendments to
[0014](../../adr/0014-namespace-products-now.md), [0025](../../adr/0025-shadcn-tailwind-shared-package.md),
[0026](../../adr/0026-docker-turbo-prune-standalone.md), [0027](../../adr/0027-code-style-solid-enforced.md)

## 1. Why

`apps/macroplan` has been specified since the restructure began — §14 of the
[monorepo design](2026-09-10-monorepo-restructure-design.md) lists it, ADR 0014 explains why it is
namespaced from day one, ADR 0025 reserves a Tailwind scan root for it, ADR 0026 counts it as a
third image, and `packages/macroplan-domain` has held a single `PRODUCT` constant waiting for it.
Nothing was built. The app bar in `@repo/ui` carries a TSDoc line saying "this is the shell
Macroplan renders too", written for an app that did not exist.

The cost of leaving it unbuilt is not that a product is missing — Macroplan's feature set is
deliberately out of scope. It is that **the seam was never tested**. Every claim about what is
shared and what is per-product was a claim about a second consumer nobody had written.

## 2. Scope

**In:** a Next 16 App Router app an admin signs into and lands on an empty dashboard; the shared
admin session extracted into a package both apps use; the shell components both apps draw; a third
Docker image and compose service; the records.

**Out:** any Macroplan entity or screen; `/v1/macroplan/*` routes; anything in
`packages/macroplan-domain` beyond the `PRODUCT` constant; the share-link bridge from Macroplan to
Microtask's entities (§6); any change to the cutover.

## 3. What building it found

Three things, each of which is the reason this was worth doing before Macroplan had features.

**The admin session was 450 lines of Microtask.** The AES-256-GCM seal over a live admin bearer,
the cookie store, the environment reader, the sign-in refusal rules, the `?next=` sanitiser — all
of it sat in `apps/microtask/lib`, and none of it is about Microtask except the cookie name and the
sentences. The second app's only options under ADR 0027 as written were to copy it or to put
server-side crypto somewhere it must not go. ADR 0047 adds the fourth importable package instead.

**Two products cannot share one cookie name.** Both apps sign in with the same `ADMIN_PASSWORD`
through the same `/v1/auth/login`, and an admin may have both open. One name would mean each app's
sign-in overwriting the other's session, each app's sign-out ending it, and — since each app seals
under its own `COOKIE_SECRET` — one product's server opening a bearer minted for the other. So
`mt_admin` and `mp_admin`, and the name is a parameter of the shared code.

**A service key is not scoped to its product's routes.** `requirePrincipal` resolves `x-api-key` to
a service name and never compares it with the `/v1/<product>/` segment, so ADR 0014's "Macroplan
holds no credentials for Microtask's data" was a statement about configuration, not capability.
Recorded rather than fixed, and §6 says why.

## 4. Architecture

```
packages/app-session/      env · crypto · cookies · session · principal · api
                           next-path · login · refusal · admin-remedy
                           action-result · no-answer
                           No build step; per-file subpath exports, like @repo/ui.
packages/ui/shell/         + logo · login-form · sign-out-form
                           Each takes its Server Action as an already-guarded prop.
apps/macroplan/
  lib/                     principal (mp_admin) · session · api · login · problem · refusal
  actions/                 auth (signIn, signOut) · result (adminCall, adminRead)
  app/                     layout · login · (admin)/layout · (admin)/page · favicon.ico
  proxy.ts                 no session → /login?next=
  instrumentation.ts       boot-time env check; exits non-zero on a bad environment
```

The split rule throughout: **the mechanism is shared, the words are not.** `refusal.ts` in the
package maps a status to a field; the sentences that fill those fields live in each app, because
every sentence names a product. `refusalFor(error, unavailable)` takes the one sentence that names
the product it is shown in. `sessionCookies({ name, … })` takes the cookie.

What Macroplan does **not** have, and why each absence is a decision:

| Microtask has | Macroplan does not | Because |
| --- | --- | --- |
| `createLinkClient` in `lib/api` | one credential kind | a module that could mint a link client is a share token's way into a product that has no share links yet |
| a `'unavailable'` remedy | two outcomes, not three | there is no client holding a revoked link who must never see a password form |
| `/s/*` and `/api/*` proxy bypasses | everything but `/login` is gated | no surface here authenticates from its URL, so a later route handler must say so rather than be exempt by default |
| `LINK_SURFACE_HEADERS` in `next.config` | no header rules | a rule matching nothing reads as protection that is not there |

## 5. Deploy

A third image, built the same way as the other two (ADR 0026): one `turbo prune macroplan
--docker`, standalone output traced from the monorepo root, started from `apps/macroplan/server.js`,
running as `node`, probing `GET /login`.

Compose gains a `macroplan` service and three variables — `MACROPLAN_API_KEY`,
`MACROPLAN_COOKIE_SECRET`, `MACROPLAN_SERVER_ACTIONS_ENCRYPTION_KEY` — each with no default. The
API's `SERVICE_KEYS` becomes `microtask=…,macroplan=…` from those same variables, so neither side
can drift.

Macroplan gets a **new hostname**, never the production FQDN (ADR 0022). Nothing here changes the
cutover: the runbook in §15.1 of the monorepo design stands unedited, and three more required
variables make an accidental deploy onto the production resource slightly more likely to be
refused, not less.

## 6. The direction this leaves open

Macroplan is expected to touch Microtask's entities eventually — a plan or milestone in Macroplan
reflecting into Microtask. The intended mechanism is the **share-link system**: a token held the
way any client holds one, in a URL and never in a cookie (ADR 0040), carrying exactly the role and
scope that token names (ADR 0038). Not an admin credential for the other product's data.

That is why no guard refusing cross-product service keys was built, even though §3 found the hole:
such a guard would have to be taken back out to build the bridge. The exposure is bounded — the key
is server-side only, confers nothing without a bearer, and there is one admin — and it is recorded
in ADR 0014's amendment rather than left to be discovered.

**The shape of that bridge is not designed here.** It needs its own spec: which entity in Macroplan
holds which token, who mints it, what happens when it is revoked, and whether the reflection is a
read or a write.

## 7. Verification

| Suite | Result |
| --- | --- |
| `@repo/app-session` | 216 tests |
| `apps/macroplan` | 183 tests |
| `apps/microtask` | 1521 tests, unchanged across the extraction |
| `packages/ui` | 240 tests |
| `apps/api` | 985 tests, with `compose.test.ts` rewritten for three services |

Plus `typecheck`, `lint` and `build` green across the workspace, and
`apps/macroplan/dockerfile.test.ts`, `next.config.test.ts`, `environment.test.ts`,
`vitest.projects.test.ts` holding the new app to the same structural rules Microtask is held to.
