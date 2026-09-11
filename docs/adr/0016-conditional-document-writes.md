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
  the retry logic must not treat 409 as retryable, or it will loop.
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
way on a switch. The island's `flush()` now answers whether edits are still held (a conflict, or a
failure waiting on its retry), and those four operations stay on the tab and say so when they are.
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
- **Back and Forward are not asked about.** Next answers `popstate` with a soft navigation, and a
  `popstate` cannot be refused: the address has already changed. Refusing it would mean swallowing
  Next's own handler and replaying the traversal the other way, which needs a direction the event
  does not carry. So Back from a tab in conflict still leaves after one write attempt — a
  regression from the app being replaced, where Back was a page load and `beforeunload` asked.
- A navigation the **server** starts is not a click on a link and is not asked about: a Server
  Action's redirect, such as a 401 answered with `/login`, or *Sign out*, which is a form posting an
  action. The tab writes that would remount the island are refused while it holds edits (the
  amendment above), but a move, a rename of another tab and every share-manager call still go
  ahead, and any of them can come back as that redirect.
- `components/editor/leaving-by-link.test.tsx` drives the real island into a conflict and a retry,
  and clicks a real `next/link` `<Link>` whose click unmounts the page as Next's navigation does:
  declined, the island is still mounted with the typed edit and its alert; clean, nothing asks.
