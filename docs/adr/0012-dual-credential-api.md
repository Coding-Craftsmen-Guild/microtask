# ADR 0012 — The API requires a service key *and* a principal token

**Status:** Accepted · 2026-09-10

## Context

The original design had the Next apps authenticate to the API with a single `x-api-key`, which the
API would read as "this is the admin". Session verification would happen in the Next app, which would
then call the API with the service key.

An adversarial review found this is a confused deputy, and it is the most serious defect the design
had. Next.js Server Actions are, in Next's own words, to be treated as public endpoints — they are
reachable independently of the UI that renders them. So a visitor on a read-only `/s/<token>` page
could invoke a Server Action, and that action's outbound call would carry the service key. The API
would see "admin". `AccessPolicy` would never see a link principal at all, and every role rule in
ADR 0008 would be decoration.

## Decision

**Both** credentials are required on every non-public route:

```
x-api-key: <service key>          service identity — which app is calling
Authorization: Bearer <token>     principal identity — an admin token, or a share token
```

`x-api-key` alone resolves to **no principal and returns 401.**

`POST /v1/auth/login` verifies `ADMIN_PASSWORD` and returns a short-lived signed admin token. The
API therefore always has a real principal, and `AccessPolicy` is genuinely the only gate.

Supporting rules:

- The Next session cookie carries a **principal**, not a boolean: `{kind:'admin', token}` wrapping
  the bearer a password login returned, or `{kind:'link', token}` set when `/s/<token>` bootstraps
  — in two cookies, not one (first amendment below). *(Since ADR 0040 there is no link cookie: a
  link principal is read from the `/s/<token>` URL on every request, and the cookie carries only
  `{kind:'admin', token}`.)*
- **Exactly one file per app** may read `process.env.API_KEY` (`lib/env.ts` in Microtask). The
  client comes from `apiForSession(audience)`, which takes the route's audience and reads only that
  audience's cookie: `'link'` on `/s/*` yields a link client from `mt_link` or nothing, `'admin'`
  everywhere else yields an admin client from `mt_admin` or nothing. A bare
  `apiForSession()` cannot work once there are two cookies — second amendment below. *(Since
  ADR 0040 the audience admits `'admin'` alone; a `/s/*` route builds its client with
  `apiForLink(token)` from its own URL and reads no cookie — third amendment below.)*
- `packages/api-client` exports two non-interchangeable constructors with distinct branded types, has
  no default export, and reads no environment variable — so a component cannot accidentally obtain
  admin authority.
- An ESLint boundary rule enforces the single reader.

## Consequences

- Authority is a function of the session, in one place, instead of a module constant.
- `SESSION_SECRET` no longer needs to exist in two apps, since the API mints the admin token.
- Every Next server call must resolve a session first; there is no "just call the API" path.
- An SSRF or template bug in either Next app no longer yields admin authority on its own.

## Alternatives considered

**Service key alone, with the Next app trusted to check the session.** The original design. Rejected
for the reason above.

**Browser calls the API directly with the share token.** Removes the deputy entirely, but requires
publishing the API and putting CORS and token handling in the browser. Rejected in favour of keeping
the API internal-only.

## Amended · 2026-09-11 — the Next app does need a secret of its own

The consequence above — "`SESSION_SECRET` no longer needs to exist in two apps, since the API mints
the admin token" — is true of the **bearer** and false of the **cookie**.

The API mints and verifies the admin bearer, so no Next app needs `SESSION_SECRET`. But this ADR
also has the Next cookie carry `{kind:'link', token}`, and the API never mints that value: it is
assembled by the app from the URL. So the app holds a payload that **is** a live credential, on a
`Path=/` cookie, and has to protect it itself.

ADR 0032 resolves it: two cookies, `mt_admin` and `mt_link`, both AES-256-GCM encrypted and
authenticated under a `COOKIE_SECRET` required at boot and distinct from the API's `SESSION_SECRET`.
Signing would have been enough for an assertion about a credential and is not enough for the
credential itself. `COOKIE_SECRET` is read by the same single module this ADR designates as the only
reader of `API_KEY`, so the single-reader rule and its ESLint boundary cover both.

There is also deliberately **no** `POST /v1/auth/logout`, which the spec listed. The bearer is a
self-contained HMAC the API cannot revoke without a store, and rotating `SESSION_SECRET` would sign
out every admin at once. Logout clears the cookie; a stolen bearer stays valid until it expires.
ADR 0032 records that limit rather than implying it by an absent route.

## Amended · 2026-09-11 — `apiForSession` takes the audience

The decision above read "It exports `apiForSession()`, which returns a link client for link
sessions and an admin client only for admin sessions." With one cookie that holds either principal,
a bare call can read the cookie and let its `kind` choose. ADR 0032 replaced that cookie with two
disjoint ones, `mt_admin` and `mt_link`, and an admin checking a client's link holds **both** at
once. A bare call then has no way to know which cookie to read, and any rule it picked — prefer the
admin, prefer the link — would be the session kind decided by whichever cookie happened to be
present, which is the clobbering ADR 0032 exists to prevent.

So it is `apiForSession(audience: 'admin' | 'link')`. The audience is not a guess and not the
caller's choice: it is fixed by the route, `'link'` for every `/s/*` route and `'admin'` for every
other one, and the function reads exactly that audience's cookie and never consults the other. A
cookie that is absent or will not open yields `null` rather than a client, and what to do about it
is decided per audience in `lib/problem.ts` — an admin is sent to `/login?next=`, a client to the
terminal page, never to a password form.

The single-reader rule is unchanged in substance and more precise in the code: `lib/env.ts` is the
one file that reads `process.env`, the ESLint boundary is `n/no-process-env` lifted for that file
alone, and `lib/api.ts` is the one place a client is built.

The same list gave the admin cookie's payload as `{kind:'admin'}`. It cannot be only that: the app
presents the admin's bearer as `Authorization: Bearer` on every call, and the cookie is the only
place the app keeps it, so the payload is `{kind:'admin', token}`: a live credential in its own
right, sealed under ADR 0032 for the same reason the share token is.

## Amended · 2026-09-11 — the link principal comes from the URL (ADR 0040)

Two sentences above describe a link cookie that no longer exists. The rule this ADR is about is
unchanged and, if anything, sharper: every call still carries **both** credentials, the service key
and a principal's bearer, and `lib/api.ts` is still the one place a principal becomes a client.
What changed is where a link principal comes from. [ADR 0040](0040-link-surface-url-token-authority.md)
removed `mt_link`, because sealing it from the URL was a state-changing `GET` that let a hostile page
replace the link a visitor held, and because every `/s/*` URL already carries its token.

So `apiForSession` takes `'admin'` alone, and `apiForLink(token)` builds the link client from the
token a page takes from its `params`, a Server Action from its first argument, or the link document
route from its path. The confused deputy this ADR closes stays closed for the same reason as before:
a share token builds a link client and nothing else, so an action called with one has exactly that
token's power — which is what holding the URL already gave. `COOKIE_SECRET` is still required,
because `mt_admin`'s payload is the admin bearer (second amendment above).
