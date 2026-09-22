# ADR 0047 — One admin session package, one cookie name per product

**Status:** Accepted · 2026-09-22

## Context

Macroplan ships as a working shell (ADR 0014), and a shell an admin can actually sign into needs
everything Microtask's sign-in needs: a validated environment, an AES-256-GCM sealed cookie holding
a live admin bearer, the "a cookie that will not open is absent" rule (ADR 0032), the refusal rules
that keep the login form from becoming a password oracle, and the `?next=` sanitiser that keeps it
from becoming an open redirect.

All of that existed, in `apps/microtask/lib`, and none of it is about Microtask. What is about
Microtask is two things: the cookie is called `mt_admin`, and the sentences say "Microtask".

ADR 0027 lets a Next app import `contracts`, `api-client` and `ui`, and nothing else. Under that
rule as written, the second app's only options were to copy roughly 450 lines — including the code
that seals a live admin bearer — or to put server-side crypto into a package that must not have it:
`@repo/api-client` is deliberately environment-free and framework-free (ADR 0012), and `@repo/ui`
depends on React and nothing else.

## Decision

A fourth package an app may import: **`@repo/app-session`**. It holds what a Next app in this
workspace needs before it can talk to the API as an admin, and the two product-specific values are
parameters rather than constants.

```
packages/app-session/src/
  env.ts            the ONE reader of process.env in this workspace
  crypto.ts         seal / open, AES-256-GCM, base64url
  cookies.ts        sessionCookies({ jar, name, secret, secure })   ← name is the caller's
  session.ts        adminSession(name), bound to Next's cookie store
  principal.ts      the admin principal only
  api.ts            apiOptions(), adminClientFor(), loginWith()
  next-path.ts      LOGIN_PATH, safeNextPath(), loginPathFor()
  login.ts          refusalFor(error, unavailable)                  ← sentence is the caller's
  refusal.ts        RefusalCopy and plainRefusal — the mapping, not the sentences
  admin-remedy.ts   what an admin surface does about a failed call
  action-result.ts  ActionFailure, ActionResult, rejected, missingIsNotFound
  no-answer.ts      orNoAnswer — a Server Action call that gets no answer
```

It ships **no build step**: per-file subpath exports point at raw source and Turbopack transpiles
it, exactly as `@repo/ui` does (ADR 0025). Nothing outside a Next app imports it, so nothing needs
`dist/`.

**Microtask seals `mt_admin`; Macroplan seals `mp_admin`.** One name would be wrong rather than
merely untidy: both apps are signed into with the same `ADMIN_PASSWORD` through the same
`/v1/auth/login`, and an admin may have both open in one browser. Sharing a cookie name would mean
each app's sign-in overwriting the other's session and each app's sign-out ending it — and, because
one `COOKIE_SECRET` per app seals its own cookie, would mean one product's server opening a bearer
minted for the other.

**Each product owns its own sentences.** `refusal.ts` holds the mapping from a status to a field;
the tables that fill those fields live in each app, because every sentence names a product.

**The shell components move too**, to `@repo/ui/shell`: `Logo`, `LoginForm` and `SignOutForm`, each
taking its Server Action as an already-guarded prop. That is what keeps `@repo/ui` free of Next:
`orNoAnswer` needs Next's redirect error to let a successful sign-in's navigation through, so the
guard stays in the app and only the markup is shared.

## Consequences

- **`process.env` has exactly one reader in the whole workspace**, and it is no longer in an app.
  `n/no-process-env` is lifted for `packages/app-session/src/env.ts` and for nothing else; each
  app's `environment.test.ts` fails if a file in that app ever reads the environment again, and if
  its own lint config ever lifts the rule.
- **ADR 0027's import list gains one entry.** An app may import `contracts`, `api-client`, `ui` and
  `app-session`. The package itself is banned by lint from reaching `@repo/store`, `@repo/kernel`
  or any `*-domain`: both apps depend on it, so a reach into the store here would be their way
  around the API (ADR 0002).
- **`SignInState` is spelled twice**, in `@repo/ui/shell/login-form` and in
  `@repo/app-session/login`. A UI package importing a server package to borrow a two-field
  interface is the worse trade. The two are structurally identical, so a drift is a compile error
  at the call site rather than a runtime surprise.
- A change to how a session is sealed is one change. Before this, it would have been two, and the
  second would have been the one nobody made.
- Microtask's `lib` keeps only what is genuinely its own: the link principal, the `/s/*` audience's
  remedy, and its copy tables. Its suite is unchanged — 1521 tests, green across the move.

## Alternatives considered

**Copy the admin half into `apps/macroplan/lib`.** No new package, no ADR 0027 amendment, and the
two apps free to diverge. Rejected: two copies of the code that seals a live admin bearer, where a
fix to one silently leaves the other wrong. The whole premise of this restructure is that a second
product was coming and nothing could be shared as it stood.

**Fold it into `@repo/api-client`.** Cheapest in package count. Rejected: ADR 0012 keeps that
client environment-free and framework-free on purpose — it takes `baseUrl` and `serviceKey` as
arguments precisely so it can never be usable from a browser bundle — and this code imports
`next/headers` and `node:crypto`.

**One cookie for both products.** One name, one secret, one session across both apps. Rejected
above: it makes each app able to end and to open the other's session, which is the opposite of the
seam ADR 0014 exists to hold.
