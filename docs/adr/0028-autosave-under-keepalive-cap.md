# ADR 0028 — Autosave does not rely on flush-on-unload for large documents

**Status:** Accepted · 2026-09-10

## Context

The current app flushes pending edits on `beforeunload` and on `visibilitychange → hidden` using
`fetch(..., { keepalive: true })`, so the request outlives the page. ADR 0015 keeps autosave as a
route handler partly for that reason — a Server Action cannot be dispatched during unload at all.

That mechanism has a limit the current code does not respect. MDN states it flatly: **"The body size
for `keepalive` requests is limited to 64 kibibytes."** The stricter reading — that the 64 KiB is a
budget *shared* across all in-flight keepalive requests in the same fetch group, and that exceeding
it produces a network error rather than a truncated send — is the one to design against.

Documents here are capped at 2 MB. So for any document beyond a page or two of checklist, the
flush-on-unload path **already fails silently today**. `navigator.sendBeacon` is no escape hatch: it
draws on the same budget.

This was nearly written into the spec as working, because an earlier review claimed the cap did not
exist and a verifier agreed. The cap is real; both were wrong.

## Decision

Flush-on-unload becomes a **best-effort optimisation for small documents**, never the safety net.

1. **The debounce stays short (700 ms).** This is the actual protection: the worst case is losing
   under a second of typing, not a session.
2. **`visibilitychange → hidden` sends a normal, non-keepalive request.** It fires while the page is
   usually still alive, and it carries no size limit. This is the primary flush.
3. **`beforeunload` attempts a keepalive flush only when the serialized body is under 50 KB** —
   headroom under 64 KiB, because the budget is shared. Above that, no request is attempted, because
   an over-budget keepalive request fails as a network error, which is exactly the silent loss being
   avoided.
4. **The browser's unsaved-changes prompt remains, and is the real guard on unload.** It already
   exists in the current code and stops being a formality.
5. **A rejected or failed unload flush must not be retried into a stale write.** Combined with the
   preconditions in ADR 0016, a late flush that would clobber newer content gets a 409 rather than
   winning.

## Consequences

- Autosave's guarantee is stated honestly: edits are durable within ~700 ms of typing, plus a normal
  flush when the tab is hidden. It is not "everything is saved on close regardless".
- The 50 KB threshold is a real branch in the client and needs a test at the boundary, or it will rot
  into an unconditional keepalive call.
- Measuring the body means serializing before deciding, on the unload path. Acceptable — it is one
  `JSON.stringify` of a document already in memory.
- ADR 0015's conclusion is unchanged: autosave is still a route handler, because an action cannot be
  dispatched on unload at all. Only what that handler can be *relied on* to carry has changed.
- The same 64 KiB reasoning applies to any future "log this on the way out" telemetry. There is none
  planned, and this ADR is the reason not to add it casually.

## Alternatives considered

**Keep the unconditional keepalive flush**, matching today's code. Rejected: it is already broken for
real documents and fails invisibly.

**Send ProseMirror steps instead of whole documents**, so an unload payload is tiny. Genuinely the
right long-term answer, and it makes real collaborative editing possible later. Rejected as far out
of scope for this restructure; ADR-able on its own if concurrent editing becomes a requirement.

**`navigator.sendBeacon`.** Purpose-built for unload, and subject to the same 64 KiB budget. No help.

**Shorten the debounce to ~150 ms and drop unload flushing entirely.** Simpler and more honest, at
the cost of roughly five times the write traffic per keystroke burst. Rejected, but it is the fallback
if the size branch proves troublesome.
