# ADR 0022 — Microtask keeps the live hostname; the merge is not the cutover

**Status:** Accepted · 2026-09-10

## Context

The app being replaced is live, with client share links in circulation. The original plan said
`/share/<token>` would redirect to `/s/<token>` so those links keep working.

That is necessary but not sufficient. A **path** redirect only helps if the request reaches this app
— and a circulated link embeds the **host**. If Microtask moves to a new hostname, every link in
circulation resolves to whatever answers on the old one.

Separately: the Coolify resource auto-deploys from this repository. So merging this branch to `main`
*is* the deploy. Nothing in the plan gated that, which means the merge itself could replace a live
app with an empty one at a moment nobody chose.

## Decision

**Microtask takes over the exact production FQDN.** Macroplan gets a new hostname. `/share/<token>`
301s to `/s/<token>` for links already sent.

**The merge must not trigger the cutover.** Deploying to the live domain is a separate, deliberate
step: either auto-deploy is disabled on the resource for the cutover, or the new stack is brought up
on a temporary hostname, verified, imported, and only then given the production domain.

**The write gap is acknowledged, not eliminated.** The sequence is backup → convert locally →
deploy → import. Any client edit between the backup and the import is lost. Closing that window
entirely would require adding a read-only mode to the app being replaced; that is not being done.
Instead the runbook keeps the window to minutes and says to run it while clients are idle.

**There is no automated path back from v2 data to the legacy shape.** Cutover is one-way. The
rollback is "redeploy the old image against the untouched backup", which is why the backup is taken
before anything else and is not written to.

## Consequences

- Macroplan cannot have the nicer hostname, whatever it is. Fine.
- The old app's data volume must be preserved read-only until the new stack is verified, not reused
  in place.
- Verification before handing over the domain has to include actually opening a real share link
  against imported data, since that is the thing that silently breaks.
- The "no downtime" goal is met in the sense that matters — clients never see an error page — while
  being explicit that a small write gap is the trade.

## Alternatives considered

**New hostname, keep the old app deployed purely as a redirector.** Links survive and the
infrastructure is cleaner. Rejected: it means running a legacy container indefinitely, forever.

**New hostname, reissue all links.** Cleanest infrastructure. Rejected: it needs a known, complete
list of who holds every link.

**Add a read-only mode to the current app first**, for a genuinely zero-gap cutover. Rejected as
work on an app being deleted, for a window measured in minutes.

## Amended · 2026-09-11 — the redirect is a 308, and it has two destinations

`/share/<token>` redirects with **308**, not the 301 recorded above. Next's permanent redirect emits
308 — both `permanent: true` in `next.config.js` and `permanentRedirect()` — so a 301 was describing
a response this app would have to hand-write a route handler to produce. 308 also preserves the
method, which costs nothing for the GETs that actually arrive from a bookmark and removes a question
about what an intermediary may rewrite. Step 8 of the runbook checks for a 308.

The destination is the token's canonical `/s/` form, which ADR 0037 splits by scope: a task-scoped
token lands on its task, a project-scoped token lands on its task list. Verification at step 7 must
therefore open a real link of **each** scope against imported data, not one link of either — a
project-scoped client landing on a list is the case the old app had no equivalent of, so it is the
case with nothing to compare against and the one most likely to be wrong.

Everything else in this ADR is unchanged: the FQDN moves to Microtask, the merge is still not the
cutover, the write gap is still accepted, and rollback is still redeploying the old image against
the untouched backup.
