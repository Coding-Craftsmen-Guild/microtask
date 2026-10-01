# 0064 — A group is a plan-level label a feature points at, and selecting one is CSS

- **Status:** Accepted
- **Date:** 2026-09-26
- **Context:** [Macroplan design](../superpowers/specs/2026-09-22-macroplan-design.md) §3, §5, §7.1

## The problem

A plan's rails are one axis and its sprints are another, and neither answers the question a plan is
usually read for: *what is in phase 1?* Work in one phase sits on several rails by construction — a
release needs the API rail, the web rail and the infrastructure rail — so the grouping a reader wants
cuts across the one structure the model has. Nothing in the timeline could express it, and nothing on
screen could pick it out.

## The decision

A **label** is a plan-level record — `id · name · colour` — and a feature carries `labelId`, one id or
`null`. Four actions: `label:create`, `label:rename` and `label:delete` at `manage` against a new
`label` target; `feature:label` at `manage` against the feature, because the field is the feature's.

Selecting a group is a **native radio group and one generated CSS rule per group**. No JavaScript, no
state, no URL, no server round trip: the chips are a Server Component, and choosing one dims every
element carrying a `data-label-id` that is not the chosen one — bars, item marks and table rows alike.

## Why one label per feature, not a set

A group answers "which phase is this in", and a phase is one answer. A set per feature would turn the
feature into a tag cloud and the chips into a filter, which is a different product decision: it makes
"is this in phase 1" a question with a partial answer, and it makes the count on a chip stop adding up
to the plan. Nothing in the product has asked for the second, and `labelId` keeps assignment one field
change on one record — the same shape `epicId` and `pinSprint` already have.

The cost is real and accepted: a feature that is genuinely in "phase 1" *and* "at risk" cannot say both,
and the second such need is what would reopen this. `FeatureLabelPayload` is `{ labelId }`, so widening
it to a list later is an additive change to one route rather than a migration of the manifest.

## Why the colour is a swatch and never a fill

Spec §5 settles that **an epic owns hue and status owns treatment**, because "hue cannot carry two
meanings". A group has a colour, so it would be the third claimant — and the same argument that split
hue from treatment rules it out. So a group's colour is drawn as a chip and a swatch, beside a name,
which is a channel neither had taken; a bar's fill stays its rail's. What tells a reader on the canvas
which features are in the chosen group is **dimming everything else**, which is opacity rather than
colour and so takes no channel at all.

The colour schema is `RailColour` itself and not a parallel `LabelColour`. An alias export was the first
attempt and `contracts/index.test.ts` refused it outright: two exported schemas sharing one component id
is a reused OpenAPI component, a worse problem than the naming it was meant to fix.

## Why selecting is CSS rather than state, a URL, or a client component

Four mechanisms were available and three are ruled out by something structural.

**A URL** (`?group=…`) was the first choice and it cannot work here: the plan screen is rendered by
`app/(admin)/plans/[planId]/layout.tsx`, and a Next layout is not handed `searchParams`. Reaching one
would mean moving the canvas and the table out of the layout, which is exactly what ADR 0057 put them
there to avoid — a soft navigation would then rebuild 2,200 rows to highlight four bars.

**A client component** cannot reach the elements it must restyle. What changes is the appearance of
*other* subtrees — every rail, and every row of the table — and a client component that repainted them
would have to own them, which means hydrating the canvas ADR 0058 exists to keep on the server.

**An inline style** reaches only the element carrying it, and the whole point is the elements that were
*not* clicked.

So the mechanism is one `<style>` element holding one rule per group, keyed on the chosen radio through
`:has()` on the plan root. `:has()` rather than the `peer-checked` the view switch uses, and the
difference is reach: `peer-*` compiles to a sibling selector, so the view switch's radios must stay
siblings of the panels they control — the constraint that forbids wrapping any part of that markup. The
chips sit in the heading and the bars are inside the switch, two subtrees apart, so no sibling selector
could join them. `:has()` asks the question from a common ancestor instead.

Tailwind cannot generate these classes, for the reason `treatments.ts` already records about a rail's
`#rrggbb`: the scanner reads class names as text, and a group id exists only at runtime. So the rule is
written as CSS. Every id is interpolated into a selector, so `isStyleSafeId` refuses anything that is
not ULID-shaped and the group is simply not dimmable — a value reaching a stylesheet is a value that can
end the rule it is in, and although `PlanView`'s own `EntityId` already makes that unreachable, a
stylesheet is the wrong place to rely on it.

## What this costs

**A chosen group survives nothing.** Not a reload, not a shared link, not a navigation into the drawer
and back. It is a way of looking at the plan for a moment, which is what the chips are for, and the
alternative was the layout rewrite above.

**Dimming is paint, so the table carries the words.** A `Group` column names each row's group — on item
rows as well as feature rows, the same repetition the epic and feature cells make — because a reader who
cannot see opacity has nothing else. That column is the eighth, and spec §5 names seven; it is the one
column groups added.

## Consequences

- `PlanManifest` gains `labels`, bounded at `LIMITS.labelsPerPlan` (20), and `PlanFeature` gains
  `labelId`. No stored plan predates either: Macroplan's storage has never been deployed.
- Deleting a group **removes no feature** — it clears `labelId` off every feature that named it, in the
  one locked write, and answers the plan those features come back ungrouped in.
- The chips are mounted by `PlanHeading` from `plan.labels`, and **not** by the admin-only groups slot.
  They were, briefly, and it made the whole feature admin-only by accident: a seat holder saw the `Group`
  column naming phases with no way to select one. Selecting writes nothing, so it needs no credential and
  cannot be a page's decision.
- The schedule reads none of it. A group is a way of seeing a plan, never a constraint on it, so no bar
  moves because of a label and `@repo/schedule` is untouched.

## Amendment — 2026-10-01: a group owns hue, and its drawer fills it

Three parts of this ADR are superseded by product-owner instruction. The decision itself stands: a
group is still a plan-level `id · name · colour` that a feature points at with one `labelId`, and
selecting one is still a native radio group and one generated CSS rule, with no state, no URL and no
round trip.

**"Why the colour is a swatch and never a fill" is reversed.** A feature's hue is now its **group's**
colour, falling back to its **rail's** where it is in no group. The rule that argued the original
position — §5's "hue cannot carry two meanings" — is what keeps the new one honest: hue still carries
exactly one meaning, and what it names has changed. A group cuts across rails by construction, which
is why it is worth the channel; a rail is a lane the eye can already follow by position, and a phase
spread over four of them is a set nothing else on the canvas can pick out.

What it costs is real and accepted: on a plan where every feature is grouped, the canvas stops showing
rail membership in hue at all. The rail band, the names column and the sidebar swatch carry it instead.
`components/plan/canvas/view.ts`'s `hueOf` is the whole of the new rule.

**The dimming rule was defective, and selecting by attribute is replaced by selecting by slot.** The
rule was `[data-label-id]:not([data-label-id="X"])`. A feature in no group renders no `data-label-id`
at all, so it matched nothing and was never dimmed — the rule only quieted features in some *other*
group, and on a plan where most work is ungrouped, which is every new plan, choosing a group visibly
changed nothing. The rule now names the five slots a group reaches — `feature-bar`, `item-mark`,
`bar-label`, `arc` and `plan-table-row` — so "dim everything not in the chosen group" means all of it.
Bar labels and arcs gained a `data-label-id` for this and for nothing else; an arc takes the label of
the feature it *leaves*, so a chosen group keeps its own outgoing edges lit.

**"A group with a list of members here would be a second place to write the same pointer" no longer
rules out the group drawer's membership list.** The objection was about two places to *store* an
answer. The list sends `feature:label` against the feature's own `labelId` — the same single write the
feature's own drawer sends, against the same single record — so there is one place the answer lives and
two places to invoke the write, which is not the same thing. The cost that remains is real and is
stated in the panel rather than hidden: a feature holds one group, so ticking it here moves it out of
whatever group it was in, silently from this panel's point of view.

The chips also gained a `+ New group` pill and a double-click that opens a group's own drawer; see the
amendment to ADR 0058 for the delegation root that second gesture needed.
