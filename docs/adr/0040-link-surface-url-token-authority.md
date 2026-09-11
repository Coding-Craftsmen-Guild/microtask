# ADR 0040 — The link surface authenticates from its URL, and holds no cookie

**Status:** Accepted · 2026-09-11 · supersedes the link half of ADR 0032

## Context

ADR 0032 gave the client surface a cookie of its own, `mt_link`, sealed from the URL when a visitor
opens `/s/<token>` and kept for thirty days, so that "the token survives the next navigation". Its
amendment (e) then recorded two facts that undercut it: a page render cannot write a cookie, so the
reseal needed a Server Action, a Route Handler or the proxy; and ADR 0037, decided after it, put the
token in every client URL. It left the unit that built `/s/*` to establish whether any route still
needed to read `mt_link` before building the reseal at all. None does, and building the reseal
anywhere would have been a defect rather than a missing feature.

**Sealing `mt_link` from the URL is a cookie write on a plain `GET`.** Unit R removed every such
write from `proxy.ts`, because a `GET` that changes session state fires on a Next `<Link>` prefetch
and on any link from any other site. Here the consequence is worse than the sign-out that change was
about. A hostile page that links a victim to `/s/<attacker-token>` — an image, an iframe, a
top-level link — would silently **replace** the link the victim holds. Every route that read the
cookie rather than its URL would then act as the attacker's link: the victim is shown the
attacker's project and types into it, and the attacker reads what they typed. That is login CSRF,
or session fixation, and it follows from the design rather than from a bug in it.

**And the cookie is redundant.** ADR 0037 gives every client route the token in its path —
`/s/<token>`, `/s/<token>/t/<taskId>`, `?tab=` for the tab — so the continuation ADR 0032 rejected
the URL-only alternative for is already carried by the URL. The cookie only restated a credential
the visitor already held, and kept it live in the browser for thirty days after the tab was closed.

## Decision

**Every `/s/*` route authenticates from the token in its own URL, on every request, and reads no
cookie at all.**

- A page takes the token from its route `params` and builds its client with
  `apiForLink(token)` — `clientFor({kind:'link', token})` behind a shape check.
- A Server Action for the link surface takes the token as its **first argument**, which the page
  binds in from its own URL (`components/link/link-actions.ts`), and builds the same client.
  A Server Action is a public endpoint, and that argument is whatever the browser sent — which is
  safe here and nowhere else in the app, because the token *is* the credential, not a claim about
  one. An action called with a token has exactly that token's power, decided by the API from the
  link's own role and scope on every call, and that is no more than holding the URL already gives.
- The link document route lives under the token,
  `/s/[token]/api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document`, and mirrors the
  admin one step for step: `Origin` checked against the host before anything else, `If-Match`
  forwarded verbatim, and the API's 409, 401 and 413 handed back unchanged in kind.
- `mt_admin` is never read on `/s/*`. An admin signed in on the same browser who opens a client's
  link sees exactly what the client sees, and a client's save goes out under the client's token.
  Tests drive each surface — pages, actions, the document route — with a live `mt_admin` in the
  cookie jar and assert that no cookie is opened and that every API request carries the URL token.

**`mt_link` is removed, entirely.** `LINK_COOKIE`, `LINK_MAX_AGE_SECONDS`, `linkFrom`, the link half
of the session store and `apiForSession('link')` are gone, because dead authority code is a hazard
rather than a convenience: the next change to a link route would have found a cookie reader waiting
for it. `apiForSession` keeps its audience parameter, typed to `'admin'` alone, so every call site
still names the surface it serves and a link route asking for a session is a compile error rather
than a `null`. `mt_admin` is exactly as it was.

**A segment that cannot be a share token is refused before any request is built.** `apiForLink`
checks it against `ShareToken` from `@repo/contracts`, the shape the API mints and validates. A
value no token can hold — a newline above all, which would split the `Authorization` header — must
not reach `fetch`, where it fails as an unreachable API ("Microtask could not reach its API") rather
than as the dead link it is.

**A link that no longer resolves redirects to `/s/unavailable`**, which calls nothing, reads nothing
and clears nothing, because there is nothing to clear. It never reaches `/login`. A 401 does it,
a segment that cannot be a token does it, and so does a 404 from `shares/current`, which the API
answers when a link is revoked between resolving its token and reading it back.

**The URL credential is hardened where the URL goes.** Moving the credential wholly into the URL
raises two exposures, and both are closed rather than noted:

- **Referrer.** A page at `/s/<token>` that loads or links anything off this origin would send its
  full URL, token included, in the `Referer`. Every `/s/*` and `/share/*` response carries
  `Referrer-Policy: no-referrer`, the `/s/` layout adds `<meta name="referrer"
  content="no-referrer">`, and link marks in documents keep `rel="noopener noreferrer nofollow"`.
- **Caching.** A shared cache that stored `/s/<token>` would hand one client's document to whoever
  asked next. Every `/s/*` and `/share/*` response carries `Cache-Control: private, no-store`.
- **Indexing.** `X-Robots-Tag: noindex, nofollow` on the same responses, beside the `robots` meta the
  `/s/` layout renders (ADR 0037), because a header reaches what a `<meta>` cannot: route handlers,
  redirects, and a 404 rendered outside the `/s/` layout.

The three headers are set in `next.config.ts` `headers()`, not in `proxy.ts`. The proxy's contract
is narrow and tested as such — it reads `mt_admin`, gates admin navigations, and writes nothing —
and a header list is not authority. `headers()` is declarative, applied by Next to every response it
serves on the path, and testable from the config itself.

**Measured, rather than inferred from "dynamic rendering", on `next start` of the standalone build**
with an API double behind it:

| Response | Next's own `Cache-Control` | Sent, with the config header |
| --- | --- | --- |
| `/s/<token>`, 200, rendered per request | `private, no-cache, no-store, max-age=0, must-revalidate` | `private, no-store` |
| `/s/unavailable`, 200, **prerendered** (`x-nextjs-cache: HIT`) | `s-maxage=31536000` | `private, no-store` |
| `/s/<dead-token>`, 307 to `/s/unavailable` | `private, no-cache, no-store, max-age=0, must-revalidate` | `private, no-store` |
| `/s`, `/share/a/b`, 404 | `private, no-cache, no-store, max-age=0, must-revalidate` | Next's value is kept |

So the header is load-bearing: without it the terminal page — a static page, as ADR 0032 (c) says it
is — would be shared-cacheable for a year. It names no token, but "every `/s/*` response is private"
is the rule, and the next static page under `/s/` might name one. Where Next keeps its own value on a
404 it is private and uncacheable already.

**The dead-link redirect and the task-scoped 404 are real statuses.** A `loading.tsx` under
`/s/[token]` wraps the page in a Suspense boundary, so the response starts streaming before the page
decides, and Next then answers `redirect()` with a **200** carrying
`<meta http-equiv="refresh" content="1;url=/s/unavailable">` and `notFound()` with a 200 as well —
measured. The link surface has no `loading.tsx`, so a dead link is a `307` with a `Location` and a
task-scoped token at `/s/<token>/t/<taskId>` is a `404`, as ADR 0037 requires. The app being
replaced drew a literal `…` while its share page loaded and no skeleton anywhere, so nothing a
visitor relied on is lost.

**`/share/<token>` is a Route Handler answering `308`** to `/s/<token>` with the query string, as a
path rather than an absolute URL so it names no host the proxy did not, and with the same three
headers, since its own URL holds the token too.

## Consequences

- The client surface has nothing to seal, clear, expire or rotate. `COOKIE_SECRET` protects
  `mt_admin` alone, whose payload is the admin bearer (ADR 0012), and rotating it no longer touches
  any client.
- No build ever set `mt_link`: the store could seal it, but nothing called that. A browser holding
  one from a development build keeps an inert cookie that no route reads, until its own `Max-Age`.
- The token is in the address bar, the history, and the path an access log records — which is what a
  share link is (ADR 0013). What changed is that it is **only** there: not in a cookie that outlives
  the tab, and not in any `Referer` this app's pages send.
- The page's Flight payload carries the visitor's own token, because the page binds it into the
  actions it hands the tab strip and the share manager. It is the token already in the address bar,
  and it is the only one: `ShareView` carries none by construction (ADR 0017), and the links a
  project-scoped `manage` holder may list load when its share dialog opens, never with the page
  (ADR 0033). The rendered HTML of every `/s/*` page was checked for any other token.
- A request with a token reaches the API even when the token is dead, and the API's 401 is what
  sends the visitor to the terminal page. There is no local notion of "a link this browser holds",
  so there is no local notion of a stale one either.
- The admin surface keeps its `loading.tsx` boundaries and so still answers its own `redirect()` and
  `notFound()` with a 200 and a meta refresh — measured on `/p/<id>` with a refused bearer. That is
  outside this decision; it is recorded because the same measurement found it.

## Alternatives considered

**Keep `mt_link`, sealed by a Server Action on arrival instead of a `GET`.** Closes the prefetch
hazard, and a cross-site `POST` to a Server Action is refused by Next's `Origin` check, which makes
fixation harder. It still keeps a thirty-day credential in the browser to restate one the URL
already carries, and it still leaves two sources of authority on one surface where one would do.

**Seal it in `proxy.ts` on the `GET`.** The design ADR 0032 amendment (e) named as the one place a
navigation could write it, and exactly the state-changing `GET` unit R removed. Rejected for the
fixation above.

**A cookie per token, `Path=/s/<token>`.** Removes the replacement, since each link's cookie lives
under its own path, and is still a second copy of a credential the path already names.

**Headers in `proxy.ts`.** Works, and the proxy runs on every `/s/*` request. Rejected to keep the
proxy to one job; `next.config.ts` states the rule where a reader looks for response headers.
