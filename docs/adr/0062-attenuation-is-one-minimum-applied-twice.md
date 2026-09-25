# ADR 0062 — Attenuation is one minimum, applied twice, and a refused link reads as unlinked

**Status:** Accepted · 2026-09-25

## Context

Spec §7.3 is one function and one table:

```
effectiveBridgeRole(planRole, bindingRole) = the weaker of the two
```

| Effective role | The holder sees |
| --- | --- |
| `view` | the derived `{ done, total }` and a filled bar — **never** the linked task's name, and never that a link exists |
| `write` | that, plus the linked task's name and a way through to it in Microtask |
| `manage` | that, plus `manage` on the bound project |

It also names what contains the amplification: "the binding's own role is the ceiling, and only an admin
sets it."

The function as written takes two roles. The product has **three** facts to combine: what the admin
declared the binding at, what the token actually holds in Microtask right now, and what the person reading
the plan holds over the plan. A token can be downgraded in the other product after a rail is bound, and
nothing in Macroplan runs when that happens.

## Decision

**One function, applied twice.**

```
bindingRole = effectiveBridgeRole(declaredRole, liveTokenRole)     // in BridgeService
effective   = effectiveBridgeRole(planRoleOf(principal), bindingRole)  // in bridge-view
```

Sound because the minimum is **associative and idempotent**, which `bridge-role.test.ts` asserts as
properties rather than leaving to inference — so two applications agree with one three-way minimum however
they are grouped and in whatever order the two facts become known.

**An admin's plan role is `manage`.** It holds every action on every target, so that is both its floor and
its ceiling.

**A caller below effective `write` receives `linkedTaskId: null`, not an absent key.**

## Consequences

**A `view` holder never *receives* a linked task's name.** Not "is not shown" — the name is absent from the
payload, and `bridge-view.test.ts` asserts it against `JSON.stringify` of the value the route answers. A
renderer that chose not to draw a name it had been handed would satisfy the screen and not the sentence.

**The binding is the ceiling for everybody, the admin included.** `effectiveBridgeRole('manage', 'view')`
is `view`, so an admin reading a rail bound at `view` is refused the linked task's id and name too. That is
§7.3's own rule and it is pinned by test. An admin who needs more re-roles the binding, which is the only
lever the spec intends — and the one only an admin has.

**`null` rather than absent is a deliberate departure from ADR 0013**, and it departs because 0013's own
argument inverts here. That ADR refuses a present-but-empty value because an empty value states something
false. §7.3 requires an effective `view` holder to be unable to tell **that a link exists at all**, and
`linkedTaskId: null` is exactly what an unlinked item carries — the two are one sentence, which is what
§7.3 demands. An *absent* key would be the tell: it differs from the unlinked case, so a reader comparing
two items could read "this one is linked, and you were refused its name" straight off the shape.

**The `write` floor applies whether or not a rail is bound.** The tempting rule — an unbound rail has no
binding to attenuate by, so hand the stored id to everybody — makes *unbinding* widen what a reader is
told, because unbinding leaves every `linkedTaskId` in place (a binding is permitted no delete). Under that
rule a `view` seat refused an id while the rail was bound would receive it the moment an admin unbound the
rail. Reaching a task id is `item:link`'s business, which spec §7.1 grants to `write` and above, so the
floor holds in every state of the rail. A `write` seat still sees a stale id under an unbound rail, which
is right: linking is the thing it may do about one.

**A rail whose token no longer resolves reads as unlinked, and so do six other failures.** No binding, a
blob that will not open, a revoked seat, a deleted project, a token naming a different project, a
task-scoped token, an admin bearer — all one answer, because a reader cannot act on the difference and
§7.2 requires a stated state rather than an error. The admin's own panel is the one place that says
"bound, but its token no longer works", because it is the one reader who can fix it.

**The stored binding role and the live one are two different shapes, and collapsing them would force one
to lie.** A binding is *declared* at `view` or `manage` (§7.2 defines only those two), so
`EpicBindingView.role` is two-valued. An *attenuated* role is three-valued: a rail declared `manage` whose
token is a `write` seat is worth `write`, which means names visible and nothing creatable. `BridgeBinding`
therefore carries the kernel's full `Role`. The compiler is what found this — a handler could not return
the attenuated role through the two-valued schema — which is the sort of thing a type system is for.

**An admin token pasted as a binding is refused explicitly, not by luck.** `resolve` answers
`{kind: 'admin'}` for an admin bearer and `can()` clears an admin on everything, so without a check an
admin token would sail through and confer the lot. `BindEpicPayload` validating `ShareToken` is a format
check on the way in, not a check on what a stored blob turns out to hold. §7.2 opens by ruling this out and
`BridgeService` refuses any principal that is not a link.
