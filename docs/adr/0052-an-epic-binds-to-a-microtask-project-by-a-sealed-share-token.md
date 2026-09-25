# ADR 0052 — An epic binds to a Microtask project by a sealed share token, pasted by hand

**Status:** Accepted · 2026-09-25

## Context

Spec §7.2 fixes what the bridge is: "An **epic binds to one Microtask project** by holding a share-link
token. Not an admin credential: the service key already fails to distinguish products (shell design §3),
and the bridge must not rest on that hole." It also fixes three bounds on it — the token is sealed at
rest with the same AES-256-GCM the session cookie uses, it never leaves the server, and the write path
permits exactly one operation.

Spec §12 left one question open, and this ADR is the one phase 1 reserved for it:

> **Who mints the epic's token.** Pasted by hand from Microtask's share manager, or minted through a
> Microtask admin call from Macroplan. Phase 4 decides it and ADR 0052 records it.

Phase 1 also declined to write this ADR early, and was right to: "an ADR recording a decision nobody has
taken is worse than an absent one."

There is a second, smaller question the phase had to answer to build any of it. `seal`/`open` already
existed, in `packages/app-session/src/crypto.ts`, and `apps/api` cannot reach it: `@repo/app-session`
carries a `next` peer dependency and the API does not depend on it.

## Decision

**The token is pasted by hand, minted in Microtask's own share manager.** `BindEpicPayload` carries a
token and a role; the admin creates the seat over there and pastes what it gave them.

**The project is derived from the token and never supplied beside it.** A token resolves to exactly one
project through the index that already owns it, so the stored `projectId` comes from resolving it.

**The token's live role is checked against the declared role at bind time.** Binding at `manage` with a
`view` seat's token is refused with a 422 naming that specifically.

**Sealing lives in `@repo/kernel/sealing`, a second implementation, and `@repo/app-session/crypto.ts` is
untouched.** It is keyed by a new required `BRIDGE_SECRET`, held to the same 32-character floor every
signing and sealing secret in this repository has.

## Consequences

**Minting from Macroplan is refused because of what it would need.** A call that created a share link in
Microtask needs authority over that product's share-link management — `share:create` at minimum, and in
practice an admin credential, since a Macroplan admin holds no Microtask seat. That is a far larger
exposure than the one sealed token §7.2 bounds: this product would be able to *manufacture* credentials
in the client-facing one. Pasting means Macroplan holds a bearer it could never have created, which is
the property that makes the rest of §7.2's bounds worth stating.

It also keeps revocation where it already works. A seat minted in Microtask's share manager is listed,
re-rollable and revocable there, by the same machinery ADR 0010's revocation cascade already covers, and
`PrincipalResolver` re-reads its live role on every bridge read — so a revocation takes effect on the next
plan render rather than whenever a cache expires.

**The cost is two products in one task.** An admin binds a rail by going to Microtask, minting a seat,
copying a token, and coming back. There is no picker and cannot be: nothing in Macroplan can list
Microtask's share links, for exactly the reason above. `bind-fields.tsx` says so where the paste happens.

**A derived project cannot disagree with its token.** A payload naming both would leave the route to pick
a side, and either choice is wrong — trusting the caller lets a rail claim a project whose token it does
not hold, and trusting the token makes the supplied field decoration. With one field there is nothing to
disagree with.

**Refusing a too-weak token at bind time makes the stored role a fact.** Every read attenuates — the
bridge takes the weaker of the declared role and the token's live role (ADR 0062) — so a `manage`
declaration over a `view` token would have *worked*, silently, and read as `view` for ever: the admin's
screen would say `manage` and the product would behave as `view`. The check does not make the role
permanent, and must not: a token downgraded *after* binding still attenuates on read, because nothing
runs again when somebody re-roles a seat in the other product.

**The cipher is duplicated on purpose, and the alternative is recorded so nobody re-proposes it blind.**
Sharing one module would mean `@repo/app-session` depending on `@repo/kernel`, which puts the
authorization kernel — `can()` included — into both Next apps' `node_modules`, one import away from an app
rendering a permission gate locally instead of asking the API. That is the class of mistake ADR 0027's
import allowlist exists to prevent, and phase 3 already fought it when `planCapabilities` was built on
`@repo/contracts`' separately declared `capabilities()` rather than on `can()`.

So the duplication is paid for in tests rather than hidden. The kernel module carries forward both
findings the app-session file records, deliberately: the key is `sha256(secret)` so any secret collapses
to exactly the 32 bytes AES-256 takes, and `authTagLength` is **load-bearing** — without it Node's GCM
decipher accepts any tag from 4 to 16 bytes, which app-session *measured*: an 8-byte tag computed under
the right key opened. `sealing.test.ts` pins that with a short-tag blob, and the test was verified by
removing the option and watching it go red.

**The day an app may depend on `@repo/kernel`, merging the two is the right move.** Until then, two
implementations is the cheaper mistake.

**`BRIDGE_SECRET` is a new required variable and the API refuses to start without it.** There is no
default, because a shipped sealing key would make every stored binding readable by anyone holding the
repository. It is held to 32 characters for a reason specific to this key: `seal` derives its AES key as
`sha256(secret)`, so a four-character secret is not a short key — it is a full-length key carrying four
characters of entropy, and nothing downstream can tell the difference.

**A deployment upgrading to this branch must set it before starting.** That is the one operational
consequence of this phase.

## What this does not decide

Whether a *seat* may ever bind. `epic:bind` is in `ADMIN_ONLY_ACTIONS` and spec §7.3 gives the reason —
a holder who could re-role a binding could raise its own ceiling — so this is settled for as long as that
argument holds. What is left open is the narrower question of an epic-scoped seat, which spec §7.1 defers
rather than forecloses; `Scope` is a discriminated union and an epic variant is additive.
