# ADR 0036 — The wire facts a browser needs live in `@repo/contracts`

**Status:** Accepted · 2026-09-11

## Context

ADR 0027 lets a Next app import `contracts`, `api-client` and `ui`, and nothing else. Importing
`@repo/microtask-domain` from an app is a lint error, because the domain reaches storage.

Several facts the browser genuinely needs are on the wrong side of that line. `LIMITS` holds the
name length and the per-collection caps the forms must enforce before a request is worth sending;
`MAX_DOCUMENT_BYTES` and `MAX_DOCUMENT_DEPTH` are what a 413 and a rejected paste mean;
`SAFE_HREF_SCHEMES` is what the link dialog may accept; `emptyDocument()` is what a new tab starts
as; and `countTasks()` is the walk that turns a document into a progress pair.

With the boundary as it stands and those symbols where they are, an app that wants to behave has
exactly two options: hard-code `40` and `80` and `2 MB` and hope they stay in step with the API, or
re-implement the `taskItem` tree walk so a checkbox can update its badge before the save returns.
Both are the duplication ADR 0009 refuses for security predicates, applied to the numbers a user
sees.

The error path has the same shape. `apps/api/src/http/problem.ts` defines its code set privately, so
the closed set of failures the API can report is not a published fact. `errorFrom` in
`@repo/api-client` then reads `status`, `code`, `detail` and `instance` and **discards** the rest of
the problem document — which is where the interesting parts live: `in` and `errors[]` say which
field a 422 was about, and `maxBytes` says which cap a 413 hit.

## Decision

**The wire facts move to `@repo/contracts`, and `@repo/microtask-domain` imports them from there.**
`LIMITS`, `MAX_DOCUMENT_BYTES`, `MAX_DOCUMENT_DEPTH`, `SAFE_HREF_SCHEMES`, `emptyDocument()` and
`countTasks()` are defined once, in the package both sides may depend on. The domain keeps the
helpers that *enforce* them — `cleanName()` and `assertWithin()` throw `Invalid` from
`@repo/kernel`, so they stay where a server error belongs; `contracts` keeps its rule of depending
on `zod` and nothing else.

**The problem shapes are published.** `ProblemCode` — the closed set — plus `Problem` and
`ValidationProblem` live in `contracts`, and `apps/api/src/http/problem.ts` imports the code set
instead of defining it. A code the app can switch on is now the same list the API can emit, checked
by the compiler rather than by grep.

**`@repo/api-client` stops discarding the useful half of an error.** `errorFrom` preserves `in`,
`errors[]` and `maxBytes`. `paths.ts` joins the barrel, because a caller that wants to build a URL
should not reach past the exports map to do it. And `Call` gains an optional `signal`, so a
debounced search or a superseded read can be cancelled.

## Consequences

- One definition per fact, and the OpenAPI document, the server's enforcement and the app's form
  validation all read it. A cap change is a one-line change in `contracts` that fails the compile
  everywhere it matters.
- `countTasks()` in `contracts` means the browser can compute a progress badge optimistically from
  the document it is editing, and the number it shows is arithmetically the same one the manifest
  cache will hold (ADR 0007). Two copies of that walk could disagree; one cannot.
- `contracts` grows beyond Zod schemas into a small amount of pure logic. The line drawn is
  deliberate and narrow: a value or a pure function over a document may live here, anything that
  throws a domain error or touches a port may not.
- A 422 can be rendered against the field that caused it and a 413 can name the cap it hit, which is
  the difference between "something went wrong" and a form that points at the problem.
- `signal` on `Call` is optional, so nothing existing changes shape; the cost is that every
  transport implementation has to forward it or cancellation silently does nothing.

## Alternatives considered

**Let the app import `@repo/microtask-domain` for these.** Rejected: it is the boundary that keeps a
Next app from becoming a second writer to the data volume (ADR 0002), and it is not worth punching a
hole in for six symbols.

**Re-export the domain's symbols from `contracts`.** Keeps one definition and drags the whole
domain package — and therefore `@repo/store`'s sibling types — into the app's module graph. Rejected;
the definitions move rather than being forwarded.

**Duplicate the constants in the app with a test asserting they match.** The pattern ADR 0038 uses
for `capabilities()`, and it is warranted there because the two forms answer genuinely different
questions. Here they are the same literal numbers, so a second copy buys nothing but a test.

**Keep `errorFrom` narrow and have callers re-parse the response body.** Rejected: the body is
consumed once, so a caller cannot re-read it. Discarding those fields in the client is what makes
them unavailable, not the API.
