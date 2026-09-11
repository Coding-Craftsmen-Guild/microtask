# ADR 0032 — Two cookies, encrypted, and the URL always wins

**Status:** Accepted · 2026-09-11

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
client link therefore holds both at once and neither shadows the other.

**Visiting `/s/<token>` overwrites `mt_link` unconditionally.** The URL is the authority; the cookie
is only how the token survives the next navigation. There is no path where a stale cookie decides
what a client sees, which also means a client who is sent a second link is never shown the first
one's task.

**Both cookies are encrypted and authenticated, not signed** — AES-256-GCM via `node:crypto`.
`COOKIE_SECRET` (32 bytes or more) is required at boot, is read by the same single module that reads
`API_KEY` under ADR 0012, and is **distinct from the API's `SESSION_SECRET`**. This is the second
secret ADR 0012 said would not be needed; the reason it is needed is that the payload is a
credential rather than an assertion about one.

**Each cookie's lifetime matches the credential behind it.** `mt_admin` takes its `Max-Age` from the
bearer's own `expiresInSeconds`, so the cookie cannot outlive the token it wraps — the app being
replaced paired a 30-day cookie with a one-hour bearer, and that mismatch is the defect being fixed,
not a precedent to preserve. `mt_link` gets 30 days, because a share token has no expiry and lives
until it is revoked.

**401 handling is per-cookie.** The spec's blanket "any 401 sends the browser to `/login`" is wrong
for a client: it would show a password form to someone who has no password and never will. So an
admin 401 clears `mt_admin` and redirects to `/login?next=<pathname>`, which also fixes the legacy
deep-link loss recorded in the parity inventory; a link 401 clears `mt_link` and renders a terminal
"this link is no longer available" page. A client is never shown a password form.

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
- Because `mt_admin`'s lifetime follows the bearer, an admin is signed out when the token expires
  rather than seeing a 401 on the next action. With no refresh route (the password is needed to mint
  a token at all) the clean re-login *is* the refresh story.
- A revoked share link produces a terminal page rather than a loop: the cookie is cleared, so a
  reload does not re-attempt the dead token.

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
the URL still overrides it whenever one is present.
