# ADR 0032 — Two cookies, encrypted, and the URL always wins

**Status:** Accepted · 2026-09-11 · link half superseded by [ADR 0040](0040-link-surface-url-token-authority.md)

## Context

ADR 0012 settled what the session cookie *carries* — a principal, `{kind:'admin'}` or
`{kind:'link', token}` — and the spec then wrote one cookie holding either. Building the shell made
three problems with that visible.

An admin opening a client's link to check it would overwrite their own session, because both values
live in one cookie. The app being replaced had no such collision only because a share visitor had no
cookie at all.

The value is not a boolean. `{kind:'link', token}` **is** a live credential: it is the share token,
the thing that grants access to the task. Signing proves integrity, not confidentiality, and
`Path=/` sends the cookie on every request to the app. A signed-but-readable cookie publishes the
token to anything that can read a request — a proxy log, an error reporter, a browser extension.

And ADR 0012 says `SESSION_SECRET` "no longer needs to exist in two apps, since the API mints the
admin token". That is true of the *bearer* and false of the cookie: the API never mints a
`{kind:'link'}` value, so the Next app has to protect one itself.

## Decision

**Two cookies, read by disjoint route sets.** `mt_admin` and `mt_link`. Every `/s/*` route reads
`mt_link` and nothing else; every other route reads `mt_admin` and nothing else. An admin holding a
client link therefore holds both at once and neither shadows the other. *(Superseded by ADR 0040:
there is one cookie, `mt_admin`, and no `/s/*` route reads any cookie. The need this met — an admin
who opens a client's link keeps their own session — is met by the link surface having no session.)*

**Visiting `/s/<token>` overwrites `mt_link` unconditionally.** The URL is the authority; the cookie
is only how the token survives the next navigation. There is no path where a stale cookie decides
what a client sees, which also means a client who is sent a second link is never shown the first
one's task. *(Superseded by ADR 0040: nothing is sealed on a visit. A cookie written from the URL on a
`GET` let a hostile page replace the link a visitor held, and every `/s/*` URL already carries its
token.)*

**Both cookies are encrypted and authenticated, not signed** — AES-256-GCM via `node:crypto`.
`COOKIE_SECRET` (32 bytes or more) is required at boot — checked by `register()` in
`instrumentation.ts`, not at module load (see the amendment below) — is read by the same single
module that reads `API_KEY` under ADR 0012, and is **distinct from the API's `SESSION_SECRET`**.
This is the second secret ADR 0012 said would not be needed; the reason it is needed is that the
payload is a credential rather than an assertion about one. *(Since ADR 0040 there is one cookie;
`mt_admin`'s payload is the admin bearer, which is still a credential, so the secret stays.)*

**Each cookie's lifetime matches the credential behind it.** `mt_admin` takes its `Max-Age` from the
bearer's own `expiresInSeconds`, so the cookie cannot outlive the token it wraps — the app being
replaced paired a 30-day cookie with a one-hour bearer, and that mismatch is the defect being fixed,
not a precedent to preserve. `mt_link` gets 30 days, because a share token has no expiry and lives
until it is revoked. *(Superseded by ADR 0040: there is no `mt_link`, so no thirty-day copy of a
share token is kept in any browser.)*

**401 handling is per-cookie.** The spec's blanket "any 401 sends the browser to `/login`" is wrong
for a client: it would show a password form to someone who has no password and never will. So an
admin 401 redirects to `/login?next=<pathname>`, which also fixes the legacy deep-link loss recorded
in the parity inventory; a link 401 redirects to the terminal "this link is no longer available"
page at `/s/unavailable`. A client is never shown a password form. **Neither 401 clears a cookie.**
This first read "an admin 401 clears `mt_admin`" and "a link 401 clears `mt_link`"; a page render
cannot write a cookie, and the one place that could — the proxy, on arrival — made sign-out a `GET`.
The amendment below says why no clear is needed.

**Logout clears the cookie, and there is deliberately no API logout route.** The admin bearer is a
self-contained HMAC, so the API cannot revoke one without adding a store, and rotating
`SESSION_SECRET` would sign out every admin at once. Clearing the cookie ends the session in the
only browser that had it, and a stolen bearer stays valid until it expires. That is a real limit and
it is recorded here rather than implied by the absence of a route.

## Consequences

- The app holds a secret the API does not, which is one more thing to set in compose and one more
  boot check. It is the price of the cookie carrying a token rather than a flag.
- Two cookies mean two `Set-Cookie` paths and two clear paths, and a test per cookie asserting the
  other is untouched. Cheap, and it is the whole reason an admin can safely open a client link.
  *(Superseded by ADR 0040: one cookie, one seal, one clear; an admin opens a client link safely
  because nothing on `/s/*` reads or writes a cookie.)*
- Because `mt_admin`'s lifetime follows the bearer, an admin is signed out when the token expires
  rather than seeing a 401 on the next action. With no refresh route (the password is needed to mint
  a token at all) the clean re-login *is* the refresh story.
- A revoked share link produces a terminal page rather than a loop: the redirect takes the dead
  token out of the address bar and the terminal page calls nothing, so a reload does not re-attempt
  it. (This first said "the cookie is cleared, so a reload does not re-attempt the dead token";
  nothing clears it, and nothing needs to — see the amendment below.)

## Alternatives considered

**One cookie holding either principal**, as the spec had it. Rejected on the clobbering above: the
one operation an admin performs most often while testing — opening the link they just minted — would
end their own session.

**Sign the cookie rather than encrypt it**, which is what most session helpers do. Correct when the
payload is an assertion the server can re-derive, wrong here: the payload is the credential, and
`Path=/` means it rides along on every request.

**Reuse `SESSION_SECRET` for the cookie.** Rejected: it gives one secret two jobs with different
blast radii, and rotating it to end admin sessions would also make every `mt_link` cookie
undecryptable.

**Keep the token out of the cookie entirely and re-read it from the URL on every request.** Tempting,
and it is what makes "the URL always wins" true. Rejected only because a client following an
in-app link to another tab would drop the token from the path; the cookie is the continuation, and
the URL still overrides it whenever one is present. *(ADR 0037 put the token in every client URL,
which removed that reason, and ADR 0040 adopts this alternative.)*

## Amended · 2026-09-11 — where the code had to put things, and the clear that was removed

Building Group C and then verifying it found five places where this ADR, or the plan that executed
it, describes something that could not be built as written or should not have been. The code is
right in each; this records why.

**(a) The gate is `proxy.ts`, not `middleware.ts`.** Next 16.3.4 deprecates the `middleware` file
convention: `next build` warns `The "middleware" file convention is deprecated. Please use "proxy"
instead` and names the `middleware-to-proxy` codemod, and a proxy runs on the Node runtime. Same
role, current name.

**(b) No cookie is cleared on a navigation.** The first build cleared `mt_admin` on every `GET` of
`/login` and `mt_link` on every `GET` of `/s/unavailable`, because (e) left the proxy as the only
place a navigation could clear one. That made both pages state-changing `GET`s. Next prefetches
every `<Link>` it renders, so a link to `/login` anywhere on screen would sign the admin out merely
by being drawn, and so would a top-level link from any other site — logout by `GET`. The clear
also bought nothing:

- `mt_admin`'s `Max-Age` is the bearer's own `expiresInSeconds` (`sealAdmin` in
  `lib/session-store.ts`), so the **browser** retires the cookie when the bearer expires. A cookie
  that still opens but holds a bearer the API refuses exists only after a `SESSION_SECRET`
  rotation, after the API host's clock jumps forward, or in the sliver by which `Max-Age` — counted
  from when the browser received the cookie — outlasts the bearer's expiry, counted from when the
  API minted it and floored to the second. That cookie meets its 401 in the page, is sent to
  `/login?next=`, and is overwritten by the next sign-in. `/login` calls nothing, so there is no loop.
- A stale `mt_link` decides nothing, because the URL always wins: the token a client sees is the one
  in the address bar, never the one in the cookie.

So `/login` and `/s/unavailable` are pass-throughs that clear nothing, and `proxy.ts` writes no
cookie on any request — `proxy.test.ts` asserts it across paths, cookies, methods and a plain,
prefetched and cross-site arrival. Both stay outside the admin gate: gating `/login` would redirect
it to `/login?next=/login`, which is itself, and a test follows the redirect chain from a gated page
to prove it ends after one hop. Sign-out stays a `POST` to the `signOut` Server Action, which clears
`mt_admin` in its own response; that is where a clear belongs. It also restores what the app being
replaced did: a signed-in admin who opens `/login` keeps their session.

**(c) `/s/unavailable` is a static route inside the `/s/` tree.** A static segment beats the dynamic
`/s/[token]` segment in the App Router, so the terminal page takes precedence without a special
case, and `noindex` stays a property of one subtree (ADR 0037) instead of needing a second. It cannot
shadow a real link: `unavailable` is eleven characters and a share token is sixteen or more.

**(d) The boot check runs in `instrumentation.ts` `register()`.** Next calls `register()` when the
server starts and skips it during `next build` (`registerInstrumentation` returns early in
`phase-production-build`). Validating the environment at module load instead makes the **build**
require production secrets, because `next build` imports every route's module graph to collect its
configuration — measured as `Failed to collect configuration for /login`, which
`export const dynamic = 'force-dynamic'` does not avoid. `lib/env.ts` therefore exports `appEnv()`,
a memoised function, and `register()` calls it once. Next does not exit on a failed `register()`, so
`register()` exits the process itself — see the 2026-09-12 amendment below. It used to let the
refusal throw, and boot then logged the error and answered every request with a 500, which left a
health check as the only thing that could turn a bad environment into a failed deploy.

**(e) A Server Component cannot write a cookie.** Next permits a cookie write only while the request
store's phase is `'action'`; a render that tries throws `ReadonlyRequestCookiesError`
(`next/dist/server/web/spec-extension/adapters/request-cookies.js`). The 401 is discovered by the
page that made the call, which is a render, so "an admin 401 clears `mt_admin`" was never
implementable where this ADR put it. A 401 found during a render **redirects**, which a render may
do, and (b) is why nothing downstream of the redirect clears either.

The same constraint binds the reseal this ADR decides — "visiting `/s/<token>` overwrites `mt_link`
unconditionally". The page that renders `/s/<token>` cannot do it; it needs a Server Action, a Route
Handler, or the proxy. The proxy is now tested to write no cookie at all, so putting the reseal
there is a deliberate change to that invariant rather than an addition to it. And ADR 0037, decided
after this one, puts the token in every client URL — `/s/<token>`, `/s/<token>/t/<taskId>`, with
`?tab=` for the tab — which removes the reason the last alternative above was rejected: no in-app
link drops the token from the path. The unit that builds `/s/*` should establish whether any route
still needs to read `mt_link` before building the reseal at all.

## Amended · 2026-09-11 — the link half is superseded by ADR 0040

The unit that built `/s/*` answered the question amendment (e) left it: **no route needs to read
`mt_link`**, because every client URL carries its token (ADR 0037), and building the reseal would
have been a defect. Sealing a cookie from the URL on arrival is a state-changing `GET` — the thing
amendment (b) removed from the proxy — and here it is also session fixation: a hostile page linking a
visitor to `/s/<attacker-token>` would replace the link they held, and any route reading the cookie
would then act as the attacker's link.

[ADR 0040](0040-link-surface-url-token-authority.md) records the replacement. Every `/s/*` page,
Server Action and route handler authenticates from the token in its own URL and reads no cookie;
`mt_link`, its lifetime, its reader and `apiForSession('link')` are removed from the code. Everything
this ADR decides about `mt_admin` stands unchanged: encrypted under `COOKIE_SECRET`, its lifetime the
bearer's, a 401 sent to `/login?next=`, and no clear on any navigation. "The URL always wins" is now
true without a contest — on `/s/*` the URL is the only thing consulted. The sentences above that
describe the link cookie are marked where they stand.

## Amended · 2026-09-12 — a refused environment kills the process

Amendment (d) above left `register()` throwing, and measured what that does: Next logs `An error
occurred while loading instrumentation hook`, keeps the process up, and answers every request with
a 500. The deploy consequence was not measured, and it is worse than the sentence implied. **Docker
restarts a container on exit and never on unhealthy**, so `restart: unless-stopped` in
`docker-compose.yml` never fired: a deploy with a missing or short `COOKIE_SECRET` came up, passed
for running, and served errors until a human read the health status. The probe choice recorded in
ADR 0026 — `GET /login` rather than a static file, so a failed boot cannot look healthy — made the
failure *visible*, but nothing acted on it.

`register()` now catches the refusal, logs `Refusing to serve: <the variable at fault>`, and calls
`process.exit(1)`. The orchestrator then sees a crash, which is the one signal it acts on, and
`restart: unless-stopped` becomes a restart loop on a bad environment rather than a lie. The
message survives the exit because `process.stderr` is synchronous on a pipe on both Windows and
POSIX, and a container's captured stderr is a pipe.

Two constraints shaped the code. `process` is reached through `globalThis`, never imported, because
`next build` compiles `register` for the Edge runtime as well as for Node and a Node built-in there
is a build warning (ADR 0027); and where a runtime has no `exit` to call, the refusal is rethrown
rather than swallowed, which is the old behaviour rather than a silent boot. No `process.env` is
read in `instrumentation.ts`, so `lib/env.ts` is still the single reader (ADR 0012).
