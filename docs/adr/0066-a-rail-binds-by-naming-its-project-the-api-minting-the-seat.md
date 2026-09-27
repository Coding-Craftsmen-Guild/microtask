# ADR 0066 — A rail binds by naming its project, the API minting the seat

**Status:** Accepted · 2026-09-27

**Corrects a premise in:** [ADR 0052](0052-an-epic-binds-to-a-microtask-project-by-a-sealed-share-token.md), which stands otherwise.

## Context

ADR 0052 settled who mints an epic's token: **pasted by hand**, minted in Microtask's own share
manager. Its consequences section explains the refusal:

> Minting from Macroplan is refused because of what it would need. A call that created a share link in
> Microtask needs authority over that product's share-link management — `share:create` at minimum, and
> in practice an admin credential, **since a Macroplan admin holds no Microtask seat**. That is a far
> larger exposure than the one sealed token §7.2 bounds: this product would be able to *manufacture*
> credentials in the client-facing one.

Everything in that paragraph is right except the clause in bold, and the clause in bold is what the
conclusion rests on. A Macroplan admin holds no Microtask **seat** — true, and beside the point,
because they need none. `.env.example` states it where `ADMIN_PASSWORD` is declared:

> The one admin password (ADR 0012). The API refuses to start without it. Both apps sign in against
> it, through the product-agnostic `/v1/auth/login`: **one admin, two sessions** (ADR 0014).

There is one admin across both products. That is not a loophole; it is the reason ADR 0052's own flow
works at all — an admin who could not mint a share link in Microtask could not have followed the
instruction to go and mint one.

So the question 0052 answered was "may Macroplan hold an authority it does not have", and the answer
was rightly no. The question it did not ask is "may the API spend the authority the **caller** already
has, on the caller's behalf, without that credential ever crossing into a browser". That one has a
different answer.

The cost of the pasted flow is not theoretical. It is two products in one task for every rail, a token
in a clipboard, and — measured against the thing this revision set out to fix — the single most
fiddly step on a page a reader had already failed to find their way around.

## Decision

**`POST /v1/macroplan/plans/{planId}/epics/{epicId}/binding/project` binds a rail by naming the
project.** The body is `{ projectId, role }` and carries no token. The API mints a project-scoped seat
over that project, seals it with the same `BRIDGE_SECRET` a pasted token is sealed with, and stores it
against the rail.

**It asks two authorities, in this order, and neither is decoration.**

```
authorize(c, 'epic:bind',    { kind: 'epic', planId })   // may this caller bind this rail
authorize(c, 'share:create', scope)                      // may it mint a seat over that project
```

Both are calls that already existed — `bindEpic` makes the first, `createShareLink` one product over
makes the second — unchanged and in that order. **The route therefore adds no authority at all.** What
it removes is the clipboard.

**`epic:bind` first**, because a caller with no authority over this plan must not be able to make the
API go and *write* to the other product on the strength of a string it supplied. ADR 0052 gave that
reason for gating before *resolving* a pasted token; it applies one step more strongly to creating.

**`share:create` second, on the scope that is then minted** — the same value, not a second derivation
of it. That is the property `createShareLink` states for itself: "the question the policy answered and
the scope that gets stored are the same value". `epic:bind` is in `ADMIN_ONLY_ACTIONS`, so in practice
only admins reach the second line and they always clear it. It is written because it is the check that
refuses the day that stops being true — ADR 0052's own closing section leaves an epic-scoped seat open
as an additive change.

**The seat is scoped to the whole project and never to a task.** A rail binds to a project (spec §7.2)
and an item then names a task inside it, so a task-scoped seat would be a binding that reached exactly
one of the tasks the rail is meant to span.

**The minted token goes back through `prepare`**, the same path a pasted one takes. That is not
ceremony: the stored `projectId` is **derived** by resolving the token rather than echoed from the
payload, so a binding cannot claim a project its token does not reach even here; and the seat is
*confirmed* to have landed at the role asked for rather than assumed to have.

**`PUT` for the pasted route, `POST` for this one.** That route replaces a binding with the one the body
describes and is idempotent. This one creates a credential in another product on every call — two calls
leave two seats, of which the rail holds the later — and the method says so.

**The pasted route stays.** It serves the case this cannot: binding a project in a Microtask the caller
holds no session for. The rail drawer offers this one first and labels the other for what it is.

## Consequences

**No credential reaches a browser on the common path.** ADR 0052's real objection was a bearer token
crossing into a paste buffer, and on this path it never exists outside one server request. The
Macroplan Server Action carries a **project id**, which is in the URL of every page of that project in
Microtask and is not a secret — so the "exists in the clear for exactly one request" window that
`actions/bridge.ts` documents for `bindEpic` has no analogue here.

**A minted seat is an ordinary Microtask share link, and that is what keeps it honest.** It is listed,
re-rollable and revocable in that product's own share manager under ADR 0010's cascade, and
`PrincipalResolver` re-reads its live role on every bridge read — so revoking it shows as `unlinked` on
the next plan render, exactly as revoking a hand-pasted one does. `bind-project.test.ts` asserts both:
that the stored binding is byte-shape-identical to a pasted one, and that revoking the minted seat
makes the rail read `unlinked` rather than error.

**Seats named `Macroplan bridge` will accumulate.** Rebinding mints another and leaves the previous one
live, because the API is not permitted to delete in the other product (spec §7.2, ADR 0063). An admin
tidying a project's seats will find one per bind. The name is fixed and names the *product* rather than
the rail, so whoever is looking at that list knows what will stop working if they revoke it — a rail's
name would be more precise and is the wrong precision, being a name in a product where no rail exists.

Not cleaning up is deliberate rather than unfinished: a route that revoked the seat it replaced would
need `share:revoke` as well, which is a third authority for a convenience, and it would revoke a
credential a person may have since re-roled by hand.

**There is no project picker, and a form asks for an id.** A list of the projects this admin could bind
needs a read from Macroplan into Microtask scoped to *projects the caller may share*. The bridge today
reads a **bound** project's tasks and nothing wider (`BoundTaskList`), and widening it to "every project
you could bind" is its own decision about what this product may learn about the other one — not one to
make as a side effect of a form. Until then the id is typed, and it is a value an admin can read off
the Microtask URL they are already looking at.

**The API's two refusals are two sentences, as they are on the pasted route.** `MINT_REFUSALS` words them
separately from `BIND_REFUSALS`, because nobody pasted anything here: "paste the token of a project share
link" would be advice about a field that is not on screen. Both are close to unreachable on this path — a
project that does not exist answers 404 before a seat is minted, and a seat minted at a role cannot hold
less than that role — and they are worded rather than collapsed so that a reader meeting either knows
which happened.

**One handler asks two questions about two products, and that is a first.** `surface.test.ts` counts
`authorize(` calls and its `EXTRA_GATES` went from nine to ten; `agreement.test.ts` names the handlers
that gate more than once and this is the fifth, and the only one whose second question is not about the
shape of its body. Both records say so where the number is.

## Alternatives considered

**Leave ADR 0052 alone and keep pasting.** The status quo, and it costs nothing to keep. Rejected
because the premise the refusal rests on is false, and a decision held up by a false premise is worse
than either answer: the next person to read 0052 would conclude the authority does not exist, when it
does and is the caller's own.

**Create the Microtask project too, so one button makes both.** The strongest reading of "auto creation
when a button is clicked", and it was weighed. Rejected for now because it needs `project:create` as a
third authority and, more to the point, it guesses: a rail named `Platform` does not tell you whether a
project called `Platform` should exist, or whether the one that already does is the one meant. Binding
to a project the admin names is a decision they have made; creating one is a decision made for them.

**Mint with a service credential rather than the caller's.** Simpler to wire — the API already holds
both products' stores — and it is exactly what ADR 0052 refused, correctly. A service-credentialled
mint means Macroplan can manufacture credentials in the client-facing product regardless of who asked,
which is an authority this product must not hold. The whole reason this route is admissible is that it
spends the caller's own.

**Revoke the previous seat when rebinding.** Tidier, and rejected above: a third authority for a
convenience, over a credential the admin may have re-roled by hand since.

**A `PUT` at the same path as the pasted route, discriminating on the body.** One route, two payload
shapes. Rejected because the two differ in idempotence — one replaces, one creates — and a single method
would have to lie about one of them. `BindEpicPayload`'s own note is the model: each payload names one
thing, so neither can disagree with itself, and here each route means one thing.
