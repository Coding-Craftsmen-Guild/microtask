# ADR 0043 — The client head names no visitor: `Signed in as` is dropped, and the badge stays two-state

**Status:** Accepted · 2026-09-12

## Context

Legacy's share page drew, under the access badge, a muted `Signed in as <link name>`. The parity
inventory calls it "the only sense in which anyone is ever 'signed in' as a person" on that surface,
and it appeared only when the admin had named the link.

The replacement does not draw it, and cannot: `ShareView` — the bootstrap answer to
`GET /v1/microtask/shares/current` — carries `role`, `scope`, `project {id, name}`, `folders` and
`tasks`, and no name. `LinkHead`'s TSDoc says the line is "not drawn rather than drawn wrong", and
`link-head.test` asserts the rendered page does not contain "Signed in as". So the behaviour is
built and pinned, and nothing decides it. The parity audit marks feature 51 a **GAP** for exactly
that reason: either contracts and the API add the name, or a record drops the line.

Spec §10.3 promises a third access badge on the same surface — "You manage this", for a `manage`
link at either scope. `components/link/access-badge.tsx` draws two strings and nothing else. Same
surface, same class of debt, so both are settled here.

## Decision

### The line is dropped. `ShareView` does not gain the name

Five things decide it, and none of them is "it would be work".

**The name is not the visitor's.** Legacy's own field asked "Who is this link for? e.g. Jane at
ACME". It is a label an admin writes into an admin's list for an admin's bookkeeping. Rendering it
back to the recipient shows them how they are filed. It can be stale — Jane has left ACME — or
simply wrong, because ADR 0035 made renaming cheap precisely so the label may lag the reality; and
it can carry something the admin never meant a client to read: a rate, an internal note, the name of
a different client the link was first cut for.

**It identified nobody even when it was there.** A share link is a bearer credential: whoever holds
the URL is the principal, and the URL is the whole of the authentication (ADR 0040). The name says
what the admin called the credential, not who is holding it. A forwarded link renders the same line
to a stranger, and tells them they are Jane.

**It was already absent for half the links we have.** It rendered only for a named link, and
production data holds one blank name in two share links. A page element that appears for some
visitors and not others, carrying no authority either way, is not identity; it is decoration that
sometimes fires — and ADR 0042 has just recorded that blank names cannot be minted away.

**The useful half is already drawn.** A visitor arriving at a `/s/` URL has two questions: what is
this, and what may I do to it. The heading answers the first with the task's or the project's own
name, which is the client's name for the work rather than the admin's name for the link; the access
badge answers the second. Nothing in `Signed in as` is load-bearing for either.

**Adding it is not free on this surface.** Every `/s/*` URL is a live credential, which is why every
response there carries `no-referrer`, `private, no-store` and `noindex` (ADR 0040). `ShareView` is
the response whose entire design is "the caller learns what its own token reaches, and nothing
else" — no token, its own included (ADR 0017), and a count rather than a list wherever the same
question is asked of a project (ADR 0033). Putting an admin-authored free-text string into it would
put admin-authored text on the one surface where nothing the admin wrote is otherwise visible.

**What is given up, stated rather than smoothed over.** A client holding two links has lost the one
cue that told them apart at a glance. The headings tell them apart instead, and only fail when two
tasks or two projects share a name — which the admin can fix by renaming the work, in a field the
client already sees, rather than by labelling the credential.

### The badge stays two-state

"You can edit" or "View only", chosen by `capabilities(role, scope)['tab:write']` and never by the
role's name (ADR 0038). §10.3's third string is corrected away rather than built:

- **It was never legacy copy.** Legacy had two permissions and two badges. "You manage this" is a
  spec invention that outran the build, so dropping it is not a parity loss at all.
- **It would be wrong at task scope.** A task-scoped `manage` holder is shown no share list, because
  listing and revoking authorize against the project it cannot name (ADR 0038 and its amendment: it
  gets a create-only manager). Telling that holder "You manage this" names an authority the page
  does not hand it.
- **The extra authority is already visible where it is exercised** — a share manager, an Export, a
  tab menu with Delete. A badge that restates the presence of controls is a second place for one
  fact to go wrong, and the first place is the one the user acts on.

## Consequences

- Parity feature 51 stops being a gap and becomes a recorded change; spec §10.3's badge row is
  corrected in place and dated (index amendments, 2026-09-12).
- `ShareView` stays free of any admin-authored string, so ADR 0017's "never anything but what this
  token reaches" holds by construction rather than by filtering. This ADR is now the reason the
  field is absent, so a future reader who finds `ShareView` thin has the argument rather than a
  shrug.
- The absence is a tested property: `link-head.test` asserts the page does not contain "Signed in
  as". Reversing this decision means deleting that assertion, deliberately, which is the point of
  having it.
- No code changes, in this unit or any other. The decision matches what is built.
- A visitor is never told anything about who they are. On a surface whose credential is a URL that
  can be forwarded, that is the accurate position, and it is now the recorded one.

**What reversing it would take**, costed here so the option stays open without being re-derived:

- `packages/contracts/src/views.ts` — `ShareView` gains `name: EntityName.or(z.literal(''))`, not
  `EntityName`, because the blank name in production data has to parse. That is the same asymmetry
  ADR 0042 records for `UpdateShareLinkPayload`, arriving in a second schema.
- `packages/microtask-domain/src/views/share-view.ts` — `shareView()` projects `link.name`, and its
  `ShareView` interface gains the field.
- `apps/api/src/routes/microtask/shares/routes.ts` — the response schema already *is* `ShareView`,
  so the route does not change, but the generated OpenAPI document does, and the unique-`.meta({id})`
  rule ADR 0024 leans on still applies.
- `apps/microtask/components/link/link-head.tsx` — draws a muted line when the name is non-empty,
  and `link-head.test`'s absence assertion inverts.
- And one decision this ADR would then owe: what a blank name renders **on the client surface**.
  "Unnamed link" is an admin's word for an admin's list; it is not a sentence to show a client about
  themselves. There is no free answer, which is part of why the line is dropped.

## Alternatives considered

**Add the name to `ShareView` and draw the line, for parity.** Rejected on the five grounds above.
Parity is the default and this is one of the places it loses: the behaviour reproduced faithfully
would show a client the admin's filing label, and the inventory's own description of it — identity
"purely by what the token's link record says" — is the argument against it once written down.

**Draw a server-controlled line instead, such as "You are viewing a project shared with you".**
Rejected: it says nothing the heading and the badge do not, and a line whose only job is to fill the
space legacy's line occupied is worse than the space.

**Draw the line only when the name is non-empty, exactly as legacy did, and treat the blank as the
edge case it always was.** This is what legacy did and it is the strongest version of the reversal;
rejected because it makes the surface's behaviour depend on a field the visitor cannot see the
provenance of, and because the blank is not an edge case in the data we have — it is one link in
two.

**Build "You manage this" as a third badge.** Rejected above. A narrower variant was considered:
draw it at project scope only, so the task-scope objection lapses. Rejected too — it makes the
badge's wording depend on a scope the visitor is never told about, so two `manage` holders read
different words for the same role with no visible reason for the difference.
