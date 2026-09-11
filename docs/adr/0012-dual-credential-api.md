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

- The Next session cookie carries a **principal**, not a boolean: `{kind:'admin'}` after password
  login, or `{kind:'link', token}` set when `/s/<token>` bootstraps.
- **Exactly one file per app** may read `process.env.API_KEY`. It exports `apiForSession()`, which
  returns a link client for link sessions and an admin client only for admin sessions.
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
