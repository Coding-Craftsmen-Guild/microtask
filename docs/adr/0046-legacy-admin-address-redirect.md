# ADR 0046 — The legacy admin address redirects, and a stale `?tab=` degrades instead of 404ing

**Status:** Accepted · 2026-09-17

## Context

[ADR 0022](0022-hostname-continuity-gated-cutover.md) bought continuity for one address only:
`/share/<token>`, the URL already in clients' hands, which [ADR 0037](0037-share-url-shape.md)
settled as a `308` to `/s/<token>`. The **admin** addresses got no record at all, and the parity
audit has carried route R3 as a gap with an explicit blocker ever since:

> A redirect to `/p/:projectId` is safe if the importer preserves project ids, as spec §7.6 says it
> will; mapping a legacy `?tab=` needs the importer's tab-to-task id rule, which does not exist yet.

Both halves of that blocker are now resolved by code rather than by intent.

**The project id survives import.** `convertLegacyProject` takes the legacy file's `id` verbatim as
the manifest id, so `/admin/projects/<id>` and `/p/<id>` name the same project with no lookup
(`legacy.test` "preserves the project id and both project stamps", and end to end through the API in
`import-confirm.test` "lands a legacy file as a project whose tasks keep the file's own ids and
stamps").

**A legacy tab id is now a task id.** Each legacy tab becomes a **task** carrying the tab's own id
verbatim; the one id the converter mints is for the single inner `General` tab. So a legacy
`?tab=<tabId>` names what is now a *task*, and its address is `/p/:projectId/t/<tabId>` — not a tab
parameter on anything. The converter is the authority here: an earlier TSDoc claimed the opposite
and was corrected in plan Task 9.

Three facts shaped the rest of the decision.

- **A real bookmark almost always carries `?tab=`.** The legacy page rewrote its own URL with
  `history.replaceState` on every tab switch (parity feature 39), so the parameterless form is the
  rare one, not the common one.
- **Redirecting a stale `?tab=` straight through is a 404.** `read-task.ts` reads through
  `adminRead`, whose contract is that a task the API does not hold is `notFound()`. A tab deleted
  since the bookmark was taken would therefore land on the app's not-found page — the dead end the
  continuity exists to prevent.
- **The app cannot see the converter.** `apps/microtask/eslint.config.js` bans
  `@repo/microtask-domain` outright, with its reason stated in the config (ADR 0014, ADR 0027): the
  app reads and writes only through `@repo/api-client`. No app-side test can convert a legacy file
  to assert the redirect against it.

## Decision

**One route handler, `app/admin/projects/[projectId]/route.ts`.** Not `proxy.ts`, which reads a
cookie, writes nothing and makes no API call — putting a project read in the gate would put a
network round trip in front of every navigation. Not a `page.tsx` calling `permanentRedirect()`
either, which fixes the status at 308 and leaves no place to set `Cache-Control`. This is the shape
ADR 0037 already settled for `/share/`, reused.

**With no `?tab=`, a `308` to `/p/:projectId`, and no read.** §7.6 makes the mapping total and
permanent: the id in the old address *is* the id of the project it becomes, so there is nothing to
look up and no later state that could change the answer. A blank `?tab=` is treated as no tab.

**With a `?tab=<tabId>`, a `307`, after one `projects.read`** — to `/p/:projectId/t/<tabId>` when
the project holds a task with that id, and to `/p/:projectId` when it does not. The status is the
honest one: a target chosen from data cannot claim to be permanent, because deleting the task
changes it.

**Both answers carry `Cache-Control: private, no-store`.** The status states whether the *mapping*
is stable; the header states who may keep a *copy*. An admin-gated response naming a project id
belongs in no shared cache, and nothing is bought by letting a browser skip a redirect that costs no
API read.

**Every failure of that read is the project page too**, and none of them is answered here: no admin
client, a 401 on a bearer the API no longer accepts, a project that does not exist, an unreachable
API. The redirect's only job is to choose the better of two targets; the page it hands off to
already has a considered answer for each — `/login?next=/p/<id>` through `lib/problem.ts`, or its
own not-found.

**The query string is dropped, the `?tab=` included.** It has been consumed into the path, and
carrying it onto the task page would name an inner tab no import ever creates, so the task page
would silently fall back to its first tab while the address claimed something untrue.

**Leniency is the legacy contract's alone.** `/p/:projectId/t/:taskId` still 404s for a task the API
does not hold, unchanged. A live link to a task that does not exist is information; a bookmark taken
before the data it names is not, which is the whole difference.

**The id rule is pinned on both sides of one shared fixture.** `legacy.test` "keeps the project id
and every tab id of a real legacy file, which is what the R3 redirect maps" converts both derived
production files and asserts the converter preserves exactly those ids; `route.test` "maps every tab
of fixture %i onto the task page of its own id" reads the same two files and asserts the redirect
targets those same ids. No id in either test is written by hand.

## Consequences

- **One extra API read per legacy hit that carries a `?tab=`**, and none for the parameterless form.
  It is paid once per bookmark follow, on an address that only pre-cutover browsers hold.
- **Two statuses from one route**, which is unusual enough to be worth the TSDoc it carries.
- A legacy bookmark opened from a signed-out browser reaches
  `/login?next=/admin/projects/<id>?tab=<id>` through `proxy.ts` rule 3 and redirects after the
  form — which is what the legacy app did, serving its login page at that same URL.
- **A changed import id rule degrades rather than breaks.** If a future importer stopped preserving
  tab ids, every legacy `?tab=` would fall back to the project page instead of 404ing, and
  `legacy.test` would be red. That is the design answer to the drift the plan asked about, and it is
  the reason the cross-check can live in two files without being a hazard.
- **Importing a legacy project as a *copy* breaks its old address on purpose.** `remint.ts` mints a
  fresh project id and fresh task ids for a copy (ADR 0019), so `/admin/projects/<oldId>` then names
  nothing and lands on not-found. A copy is a new project; the cutover's own import creates or
  replaces, and only that path keeps the address.
- **This is a fourth route handler outside ADR 0015's three.** ADR 0015 counts handlers under
  `/api`, and `handlers.test` now also pins the set *outside* `/api` and `/s` — the two legacy
  redirects and the favicon — so a fifth cannot appear without a decision.
- `/admin/projects` and `/admin/projects/a/b` stay 404s, as they were in the legacy app, which
  matched exactly three segments and let anything else fall through.
- **One criterion of plan Task 13 is met by two tests rather than one.** The plan asked for a test
  that asserts the importer preserves the id *and* that the redirect uses it, so the two cannot
  drift apart silently. The lint rule above makes a single test impossible without giving the app a
  dependency on the domain, so the assertion is split across the fixture both sides read. The drift
  cannot be silent — it reddens `legacy.test` — but no one test observes both halves.

## Alternatives considered

**`308` straight to `/p/:id/t/:tab`, with no read.** Cheapest, and permanent in the honest sense.
Rejected because a tab deleted since the bookmark was written is then a 404 at an address a client
may have had for months, which is what this redirect exists to prevent. Measured, not assumed: the
task page's read goes through `adminRead`, and `notFound()` is its documented answer for a task the
API does not hold.

**Make `/p/:id/t/:taskId` lenient, redirecting an unknown task to its project.** Would remove the
read and the 307 entirely. Rejected: it changes behaviour that is pinned for a *current* address to
serve a legacy one, and it would hide a real broken link in the live app behind a silent redirect.

**Do it in `proxy.ts`.** Rejected: the gate reads a cookie and nothing else, by design (ADR 0032),
and an API call there would run inside every admin navigation's critical path. A rewrite in the
proxy would also have to answer with one status for both shapes.

**Add `@repo/microtask-domain` to `apps/microtask` as a dev-only dependency, so one test does both
halves.** Rejected: the app's own lint config forbids it with a reason that outlives this task — the
domain barrel reaches `node:path` and `node:crypto`, and the app must not bypass the API. A
test-only exception is still the first crack in that rule, and the rule is load-bearing for ADR 0002
and ADR 0041.

**Move the tab-to-task id rule into `@repo/contracts`, which both sides may import.** Rejected: the
rule is one expression inside the converter, and contracts would then hold a URL-shaped fact about
one app while the app's own `components/projects/paths.ts` stayed the second place the `/p/:id/t/:id`
shape is written down. Two spellings of a path is a worse drift risk than the one being closed.

**Import the converter from the app test by relative source path**, bypassing `package.json`.
Rejected: it hides a real dependency from the manifest, from `scripts/check-exports.mjs` and from
the lint rule that exists to forbid exactly it.
