# ADR 0042 — Three departures from the app being replaced: a disabled checkbox, a named link, Sign out everywhere

**Status:** Accepted · 2026-09-12

## Context

Three behaviours were built, tested and shipped without a decision record. The parity audit marks
each of them `CHANGED†`: deliberate, pinned by a test, and recorded nowhere but the code's TSDoc and
the audit's own mark sheet.

That is the one gap ADR 0027 cannot tolerate. Code carries TSDoc and no other comments, so a
departure whose reasoning lives in a doc comment has its argument in the one place the style rules
say arguments do not go, and a reader who disagrees with it has no document to disagree with. An
audit is a mark sheet taken at a moment, not a decision; it can say *what* differs and cannot say
*why it should*.

Each of the three is small enough to have slipped past a record, and each is large enough that a
daily user of the app being replaced would notice it on their first afternoon. They are unrelated
except in that, which is why they are one ADR rather than three.

## Decision

### A read-only viewer's checkboxes are `disabled`, not left to snap back

**Legacy** omitted `onReadOnlyChecked` and dressed the result in CSS —
`pointer-events: none; opacity: .7` (parity inventory, Non-obvious behaviours). The
`<input type="checkbox">` itself stayed enabled: it was announced as a checkbox that could be
ticked, keyboard focus could reach it and flip it, and ProseMirror's refusal to apply the
transaction was what put it back.

**We** wrap Tiptap's own task-item node view in a read-only editor and set `disabled` on the one
checkbox that view owns — `ReadOnlyTaskItem` in `apps/microtask/components/editor/extensions.ts`.
`onReadOnlyChecked` is still omitted, so the snap-back survives as the floor under anything that
gets past the attribute rather than as the mechanism.

**Why it is an improvement.** `disabled` is the state assistive technology reads, and it stops the
pointer and the key at the same place, where `pointer-events` stops only one of them. A control that
looks live, is announced live, and then silently undoes itself is a worse answer to "may I tick
this?" than a control that says no before it is touched. The cost is that legacy's `opacity: .7`
affordance is now the browser's own disabled rendering, which differs between browsers; what it buys
is a viewer who is told the truth by every route they could ask along. Pinned by
`document-editor.test` "marks every checkbox disabled, so assistive technology says it cannot be
ticked, and a click sends nothing".

### A new share link must be named; a blank name is still read, still rendered, still saveable

**Legacy** made the name optional — the field asked "Who is this link for? e.g. Jane at ACME" —
rendered a blank one as the literal "Unnamed link", and let a rename clear it back to blank
(`allowEmpty: true`).

**We** require a name to mint one, and nowhere else. `CreateShareLinkPayload.name` is `EntityName`,
which refuses `''`; `UpdateShareLinkPayload.name` is `EntityName.or(z.literal(''))`. The create form
sends no request without one, `linkName()` still renders a blank as "Unnamed link", and a rename may
still clear it.

**Why it is an improvement.** The name is the admin's only way to tell two live credentials apart. A
project may carry 50 of them, and a list of "Unnamed link" rows distinguished by nothing but a role
badge and an opaque URL is a set of credentials nobody can revoke with confidence — which is the
operation that matters most, and the one whose blast radius ADR 0010 deliberately widens through the
lineage cascade. Minting is the only moment at which the admin reliably knows who the link is for,
so it is the only moment worth asking.

**The asymmetry is the decision, not an oversight.** Production data already holds one of its two
share links with no name. A read that refused `''` could not list that link and a rename that
refused it could not save a link it had just loaded, so the rule binds minting alone — the only path
that creates new blanks. This is not an invariant the renderer may assume away: a rename can still
produce a blank name, so "Unnamed link" stays. What the rule removes is a credential nobody ever
named. Pinned by `packages/contracts/src/index.test.ts` "accepts an empty name, which production
data already contains" and "still refuses an empty name when a link is being minted, the two rules
differing"; `share-link-service.test` "rejects an empty name" and "accepts an empty name, which
production data already contains"; `create-link-form.test` "makes no request without a name, and
says so"; `labels.test` "renders a blank name as "Unnamed link", which production data already
holds".

### Sign out is on every admin page

**Legacy** put the Sign out link on the projects list alone; from a project page an admin navigated
back to `/` to sign out. It was an anchor — a `GET` that ended a session, which ADR 0032 has already
replaced with a form posting the `signOut` action.

**We** put `SignOutForm` in the admin layout's brand bar (`app/(admin)/layout.tsx`), so it is on
every page of the admin surface.

**Why it is an improvement.** The placement was an artifact of a two-page admin surface rather than a
decision: legacy had a list and a project page, and the list was where you already were. The
replacement's surface is three levels deep — index, project, task — so "walk back to the index"
costs two navigations, and one of them can raise the unsaved-changes prompt on a task page that is
holding edits (ADR 0016). Putting the control in the layout also means there is exactly one of it,
so the guard against a sign-out the server never answers is written once rather than per page.
Pinned by `(admin)/layout.test` "signs out with a form post, never a link", "says the server did not
answer when the sign-out gets no answer, rather than falling to an error boundary" and "renders no
link to /login anywhere".

## Consequences

- The parity audit's three `CHANGED†` marks become `CHANGED`, and its list of changes built without
  a decision record is empty. The dagger keeps its meaning for whatever earns it next.
- Spec §10.3 and §11 said "snaps back" and are wrong; they are corrected where the sentence lives
  and dated, rather than left to contradict the code (index amendments, 2026-09-12).
- The brand bar now carries a focusable control on every admin page, so every admin page has an
  interactive element ahead of its heading in tab order. A mild cost, accepted: the alternative
  charges the same tab stops to a navigation.
- The share-link name rule is now two rules — one for minting, one for everything else — which is a
  thing to remember when the importer is built (feature 67). An imported legacy link with no
  `permission` becomes `write` per spec §7.6; an imported legacy link with no *name* must be
  accepted, because import is not minting.
- Nothing in this ADR changes code. All three behaviours are as built.

## Alternatives considered

**Leave all three to the code's TSDoc and the parity audit.** Rejected, and it is what this ADR
exists to undo: under ADR 0027 the TSDoc is the only comment allowed, so an argument parked there is
an argument in the wrong place, and the audit records the mark rather than the reasoning. A stale or
absent record is then the one place a design error can hide, which is the rationale the index's
amendment policy already states.

**Three ADRs, one per behaviour.** Rejected. Each is two paragraphs of argument, none constrains
either of the others, and three files of that size make the index harder to read than the decisions
are to find.

**Build all three back to legacy.** Considered per item and rejected per item: snapping back lies to
assistive technology; an unnamed credential cannot be revoked with confidence; and a single-page
Sign out was an artifact of a surface that no longer exists. One half *is* built back to legacy on
purpose — the "Unnamed link" render — because production data forces it.

**Refuse a blank name everywhere, and normalise the one production blank on import.** Rejected twice
over. There is no importer yet (feature 67), so the rule would refuse to load data that exists
today; and writing to `data/` to make a validation rule true is the wrong direction of fit. The
record describes the data, not the data the record would prefer.

**Put Sign out in the layout but hide it on the index, so it appears exactly once per session's
worth of pages.** Rejected as soon as it is written down: it makes the control's presence depend on
which page you are on, which is the legacy behaviour with an extra rule.
