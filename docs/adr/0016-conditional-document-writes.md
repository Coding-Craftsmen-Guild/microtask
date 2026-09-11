# ADR 0016 — Document writes are conditional

**Status:** Accepted · 2026-09-10

## Context

Autosave debounces 700 ms and also flushes on tab switch, on `Ctrl/Cmd+S`, on
`visibilitychange → hidden`, and on `beforeunload` — the last two with `keepalive`, so the request
outlives the page. `PUT …/document` currently replaces the tab's document unconditionally.

Today that is nearly safe, because one project is one file and one admin edits it. It stops being
safe here for two reasons: a `write` or `manage` share-link holder can now be editing the same task
concurrently with the admin, and the keepalive flush is by construction the request most likely to
arrive **late** — it is queued as the page goes away and can land after someone else has saved.

The failure is silent. Last write wins, and the newer content is simply gone.

## Decision

`PUT …/document` requires a precondition carrying the tab's last known `updatedAt`. A mismatch
returns **409** and the client stops writing rather than overwriting, and offers a reload it does
not perform unasked (corrected — see the amendment below).

The client surfaces it: *"Someone else saved this tab. Reloading discards your unsaved edits."*,
with a **Reload this tab** button. The local edits are preserved in the editor, and the user is
told before anything is discarded. (This first read *"This tab changed elsewhere. Reloading the
latest version."*, an automatic reload; the amendment below says why that could not stand.)

## Consequences

- Concurrent editing between an admin and a share-link holder degrades to a detectable conflict
  instead of silent loss.
- The keepalive flush can now legitimately fail. That is correct — a late write *should* lose — and
  the retry logic must not treat 409 as retryable, or it will loop. Nor any other refusal a retry
  cannot change: only a transport failure, 408, 429 and 5xx are retried on a timer (corrected
  2026-09-11 — see "a refusal no retry can change stops the loop" below).
- Every document write carries the version it is based on, so the editor must track the last
  `updatedAt` it received, including after a 409 reload.
- **The client never has two writes in flight on one tab** (recorded 2026-09-11 — see the
  amendment below). Each write presents the stamp the previous answer returned, so a second write
  sent before the first is answered carries the same `If-Match`, and whichever lands second is a
  409: autosave in conflict with itself, caused by nothing more than a save slower than the 700 ms
  debounce while the user keeps typing. A flush that arrives while a write is in flight waits for
  its answer and then decides afresh, on the stamp that answer carried.
- **The precondition is only as fine-grained as the clock.** `updatedAt` is an ISO millisecond
  stamp, so two writes landing inside one millisecond carry the same value and the later one is
  accepted as though it were based on the earlier — a lost update the check cannot see. Narrow in
  production, where a save is debounced 700 ms, but total under a clock that never advances: a
  fixed test clock makes every stale write look current. A domain test that means to measure the
  precondition rather than the seed stamp therefore drives it with a clock that moves. Closing the
  gap entirely would mean a revision counter instead of a timestamp, which the manifest would have
  to keep and every client carry.
- This is not real collaborative editing. Two people typing in one tab still fight; they just no
  longer lose work without being told.

## Alternatives considered

**Leave writes unconditional.** Matches today's behaviour. Rejected: today's behaviour is only safe
because there is one writer, and roles change that.

**Operational transform or CRDT for true concurrent editing.** Tiptap/ProseMirror supports it. Far
out of scope, and unnecessary for the actual use — a client ticking checkboxes while an admin edits
elsewhere.

**Last-write-wins with a visible "someone else saved" toast.** Cheaper, but it announces the data
loss rather than preventing it.

## Amended · 2026-09-11 — writes are serialised, and the reload is the user's

Building the editor's autosave found one thing this ADR implied without saying, and one it said
wrongly.

**Serialisation is a consequence of the precondition, not a detail of the editor.** Without
`If-Match`, two overlapping writes from one tab are merely redundant. With it, the second is refused,
because both were based on the same stamp and only one of them can be current. Nothing about a
second writer is needed to produce that 409 — one user typing through a slow save is enough — so
the client must hold at most one write in flight per tab, queue the next behind it, and build the
queued one from the stamp the first answer returned. `components/editor/autosave.ts` does this in
`flush()`, and it is recorded above as a consequence. It has a cost on the way out of the page: a
`beforeunload` flush queued behind a write in flight cannot start until that write is answered, so
the page asks for the browser's unsaved-changes prompt whenever a write is pending, not only while
the document is dirty, and that prompt is the guard on that path (ADR 0028).

**The client does not reload on its own.** The decision first said "the client reloads rather than
overwriting", with the message *"Reloading the latest version."*, and in the next sentence required
that unsaved edits be preserved and the user told before anything is discarded. At the moment of a
409 the local document **always** holds unsaved edits — the write that was refused carried them —
so the second sentence is the only branch that ever applies, and an automatic reload would break it
every time. What is built: the loop stops writing and does not retry, the edits stay in the editor
and are still recorded if the user keeps typing, and the indicator says *"Someone else saved this
tab. Reloading discards your unsaved edits."* beside a **Reload this tab** button, and a reload
happens only when that button is chosen.

**Nor may anything else on the page reload it by the back door** (found running the app against a
real API, 2026-09-11). The editor island is keyed on its tab and remounts on that tab's stored
document whenever the task page switches tab, creates one, deletes another (the page then lands on a
neighbour) or renames the open one (the rename moves its stamp). Each of those awaited the island's
flush first, but a flush settles whether or not its write landed. Measured: in the conflict state a
rename of the open tab reloaded it with nobody asking — the edits vanished, the editor showed the
other writer's document, and no alert remained — and a save waiting to retry was dropped the same
way on a switch. The island's `flush()` now answers whether edits are still held (a conflict, a
refusal the loop has stopped on, or a failure waiting on its retry), and those four operations
stay on the tab and say so when they are.
A move and a rename of another tab remount nothing and go ahead. Leaving the page by a link was the
gap that remained, because a Next navigation cannot be refused once it has started; an in-app link
now asks first, and Back and Forward are what is left — see the next amendment.

## Amended · 2026-09-11 — an in-app link asks before it leaves held edits

Reproduced running the app, 2026-09-11: with a tab in conflict, or with a failed save waiting
on its retry, *← Back to project* unmounted the island after its one unmount write, and the edits
went with it. A Next `<Link>` is a soft navigation, so the browser fires no `beforeunload` and its
unsaved-changes prompt never appears; and the App Router has no navigation-blocking API to ask
instead. The app being replaced had no such path — every navigation in it was a page load, so
`beforeunload` covered leaving by a link (parity feature 37).

**Decision.** While its loop has anything pending — the same condition the `beforeunload` prompt
uses (ADR 0028) — the island listens for `click` on `window` in the **capture** phase, which runs
before React dispatches the click to any `<Link>`, and asks `window.confirm`. It asks only about a
click that would take the page to another page of this app: a plain left-click not already
cancelled, on a link that opens in this browser tab, to this origin, at a different path
(`components/editor/leave-guard.ts`). *Stay* cancels the click and stops it propagating, so Next
never sees it and the browser never follows the `href`: the edits, the conflict alert and the
retry timer are all where they were. *Leave* lets the same click through untouched, so the
navigation that happens is exactly the one the link describes; the unmount write still runs once,
and this island's own `beforeunload` stays quiet afterwards, because a plain same-origin `<a>` —
the brand bar's lockup is one — is a hard navigation that fires it, and would ask a second time.

**Why a synchronous prompt on a capture listener.** The click has to be cancelled or allowed
inside its own dispatch, before Next's handler runs; after that the navigation is Next's. A
listener that belongs to the island guards every link on the page — the ones the island never
sees, in the page, the layout, `packages/ui` and whatever the `/s/*` pages render — with no link
knowing about it.

- `onNavigate` on `<Link>`, which Next 16 adds, can cancel, but it is per link: every link on
  every page that can hold an island would need wiring, and a plain `<a>` has no such prop.
- An in-app confirm dialog cannot answer inside the dispatch. It would cancel every click and
  replay the choice with `router.push(href)`, which re-implements what a link means — `replace`,
  `scroll`, a hard navigation — and gets it subtly wrong.
- The Navigation API's `navigate` event, and wrapping `history.pushState`, both hear about Next's
  navigation after Next has committed the new route: too late to refuse it.
- Asking only while edits are *held* (conflict or retrying) would stay silent inside the debounce
  window, where the unmount write usually lands but is lost unseen when it does not. One condition
  for both ways of leaving is also the one a user can predict.

**What it costs, and what is still open.**

- `window.confirm` is the browser's dialog, unstyled, and it blocks the page while open. It is the
  same kind of question the user already gets from `beforeunload` for a hard navigation.
- **Back and Forward are not asked about**, and after the evaluation recorded at the end of this
  ADR they stay that way: no approach under the App Router is reliable enough to build. So Back
  from a tab in conflict, or stopped on a refusal, still leaves after one write attempt — a
  regression from the app being replaced, where Back was a page load and `beforeunload` asked.
- A navigation the **server** starts is not a click on a link and is not asked about: a Server
  Action's redirect, such as a 401 answered with `/login`, or *Sign out*, which is a form posting an
  action. The tab writes that would remount the island are refused while it holds edits (the
  amendment above), but a move, a rename of another tab and every share-manager call still go
  ahead, and any of them can come back as that redirect.
- `components/editor/leaving-by-link.test.tsx` drives the real island into a conflict and a retry,
  and clicks a real `next/link` `<Link>` whose click unmounts the page as Next's navigation does:
  declined, the island is still mounted with the typed edit and its alert; clean, nothing asks.

## Amended · 2026-09-11 — a refusal no retry can change stops the loop, and says so

Found running the app, 2026-09-11: a link page left open after its link was revoked retried its
save every four seconds for as long as it stayed open — a hundred console 401s in a few minutes —
while its indicator read *"Not saved — retrying…"* beside *"… cannot be saved through this link"*.
Both halves were true, and together they were a lie. The loop retried every refusal that was not
a 409, and a 401 for a revoked token, like a 403 for a link downgraded to view, is refused again
every time it is sent. The app being replaced did the same (parity feature 34, non-obvious UX row U34); it is
not reproduced.

**Decision.** A save's answer is sorted by status into what a retry can outlast and what it cannot.

- **Retried on the 4-second timer:** a request that never arrived (the `fetch` rejects), 408, 429
  and any 5xx — including the 503 a document route answers when it cannot reach the API. The same
  write can land once the server recovers, and nothing about it needs the user.
- **Never retried:** 409, as before — only a reload resolves it.
- **Stopped, and retried only when asked:** every other refusal — 400, 401, 403, 404, 413, 422.
  The loop enters a state of its own, `refused` (`components/editor/autosave.ts`). It records
  further edits and writes none of them: not on the timer, on `visibilitychange`, on
  `Ctrl/Cmd+S` or on unload. The indicator says *"Not saved"*, never *"retrying"*, and an alert
  beside it gives the reason and where the edits are — *"Your edits stay in this tab until you
  leave the page, so copy out anything you need."* — with a **Try again** button, the only thing
  that sends the held edits again. A retry that is refused again stops again; one that lands says
  *Saved*.

**Why an explicit retry, rather than none.** A 401 on the **admin** surface is recoverable: the
session lapsed, and signing in again in another browser tab restores `mt_admin`. The loop cannot
know that happened, and retrying blind to find out is exactly the loop being removed; the user
knows, so they are told to sign in again and then choose *Try again*. The same holds for a 413
(shorten the tab, then retry) and for a link an admin upgrades back. A revoked link never
recovers, and there the button costs one refused request per press, which the user chose.

**A refused write is held like a conflict**, so everything the amendments above built for held
edits applies. The island's `flush()` answers `false`, so a tab switch, a create, a delete or a
rename of the open tab stays put and says why; an in-app link asks before it leaves;
`beforeunload` asks for the browser's prompt (ADR 0028). Back and Forward are still not asked
about — see the evaluation below.

**The reason is the surface's plain sentence, never the API's** (found in the same run). An admin
downgrading a write link to view under an open page left the visitor reading *"Not permitted:
tab:write"* under the editor: the API's `detail`, forwarded verbatim by the document route. Both
document routes, and every Server Action on both surfaces, now pick the sentence from the status
and the surface (`lib/refusal.ts`) and keep the status and code for the island and for a log. A
downgraded link reads *"This link is read-only now, so this tab cannot be saved through it."*,
which is what legacy's *"This link is read-only"* said; a revoked one reads that the share link is
no longer available; an admin whose session lapsed is told to sign in again in another browser tab
and then choose *Try again*. The API's sentence stays in its problem document, for whoever reads
the API. Strictly this is a decision about every refusal the app shows, not only a document
write's, and it would sit better in an ADR of its own; it is recorded here because the save
indicator is where it was found and where most of it shows.

**What it costs.** Legacy toasted the API's domain sentences — *"Too many tabs"*, *"A task must
keep at least one tab"* — and those were plain. They now read as one sentence per status — for a
422, *"Microtask did not accept that. A name may be empty, or a limit reached."* — because the API
gives a domain refusal and a malformed request the same status and code, and telling them apart by
the API's wording would be the coupling this removes. The controls that can hit a limit already
stop at it where the page knows the count (`+` at `LIMITS.tabsPerTask`, *Delete tab* on the last
tab), so the generic sentence is what a race or a stale page shows.

`components/tabs/save-tab.test.tsx` pins the sort by status. `components/editor/autosave.test.tsx`
pins that `refused` sends nothing more for ten minutes, keeps every edit, and writes only on
`retry()`. `app/s/[token]/refused-save.test.tsx` drives the real link document route, the real
`saveTabDocument` and the real island through a revoked link, a downgraded one and an API outage.

## Evaluated · 2026-09-11 — Back and Forward, and why they are still not asked about

Parity feature 37 asked before any navigation left unsaved edits, because every navigation in the
app being replaced was a page load and `beforeunload` covered it. Under the App Router, Back and
Forward are soft navigations: Next listens for `popstate` on `window` and restores the route. Three
approaches were evaluated against Next 16.3.4's router (`next/dist/client/components/app-router.js`).

1. **Refuse the `popstate`.** It cannot be refused: by the time it fires the browser has already
   moved to the other entry. Undoing that means stopping Next's listener — a capture listener on
   `window` does run before it at the target — and then traversing back the other way, which needs
   the direction and the distance. A `popstate` carries neither, and a long press on Back can jump
   several entries at once.
2. **A guard entry.** Push a duplicate of the current entry while edits are held, so that Back
   lands on the same URL, where the page can ask and then either push the guard again (stay) or
   step back once more (leave). Next 16 does integrate a user `pushState` — it copies its own
   `__NA` and route tree into the new entry's state — so the router would not reload. But the guard
   is a history entry, and a history entry cannot be removed: it truncates any Forward history the
   user had, and it outlives the edits and the island, leaving a Back press that visibly does
   nothing once the edits are saved or the page has been left by a link. The task page's `?tab=`
   `replaceState` rewrites whichever entry is current, so the guard and the entry under it drift
   apart; and a multi-entry jump passes it by. It trades a rare loss for a common, visible oddity in
   everyone's history, and it depends on Next keeping a private state shape.
3. **The Navigation API's `navigate` event.** For a traversal the browser starts, this fires before
   the entry changes, so it is not too late the way it is for Next's own pushes (the in-app link
   amendment above). Cancelling a traversal from it, though, is a recent addition to the HTML
   standard, shipped first in Chromium and gated on user activation — a page may cancel one
   traversal per interaction, which is what stops back-button trapping — so a second Back with no
   click in between leaves unasked even where it works. Whether it holds in every browser a client
   uses could not be established here, and it cannot be tested in this repository at all: happy-dom
   has no Navigation API, and the gate runs no browser.

None is reliable enough to reproduce feature 37, so none is built, and the regression stands as
recorded above. What limits the loss: leaving by Back or Forward unmounts the island, whose unmount
write sends a dirty edit once — none in a conflict or a refusal, which would only be refused
again — so what is lost is only what was **held**: a conflict, a refusal, or a failure whose last
attempt also fails. In each of those the page had already said, in red, that the edits were not
saved, and a refusal had said to copy them out. Option 3 is the one to revisit if cancelable traversals reach every supported
browser without the activation gate; it would sit in `use-autosave.ts` beside the click guard,
asking on the same `pending` condition.
