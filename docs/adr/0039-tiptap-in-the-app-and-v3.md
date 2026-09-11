# ADR 0039 — The Tiptap editor lives in the app, and what Tiptap 3 changed

**Status:** Accepted · 2026-09-11

## Context

The checklist document editor is the centre of Microtask: a tab holds one Tiptap ProseMirror JSON
document, and the product's only real metric — progress — is a count of `taskItem` nodes whose
`attrs.checked` is truthy (ADR 0007). Two questions about it were filed as implementation detail in
the design spec. Both are decisions with evidence behind them, and ADR 0027's own rule is that if a
decision needs explaining it is a decision and belongs here.

The first is **where the editor lives**. ADR 0001 sorted the codebase into what is shared and what is
not, and its context listed "the editor" among the parts worth sharing. That was written before
anyone asked what Macroplan would do with it.

The second is **which Tiptap**. The app being replaced pins `^2.27.3` across seven `@tiptap/*`
packages (`apps/legacy/package.json`) and bundles them with esbuild into
`apps/legacy/public/vendor/tiptap.js`. Current is `3.31.3`. A major version under a stored-document
format, where the document *is* the user's data and the metric is computed from it, is not something
to port by transcription — so it was not. Every fact in Decision two below was produced by executing
against the two real production files in `data/projects/`, not read from a changelog.

## Decision

### One — the editor lives in `apps/microtask`, not in `packages/ui`

Tiptap is the Microtask checklist document editor. Macroplan is a different product with a different
document model, and nothing in it needs a ProseMirror schema of task lists. ADR 0001's rule decides
this once stated plainly: an app holds what is not shared, and this is not shared. ADR 0001's context
sentence naming the editor as shareable is corrected there.

The rule is not the only reason, and the second one is why this is worth an ADR rather than a line in
the spec. A shared Tiptap **permanently** creates a duplicate-ProseMirror hazard. `@tiptap/pm`
re-exports the ProseMirror libraries, and `prosemirror-model` compares node types and schemas by
`instanceof`; two copies in one process therefore fail at schema construction rather than degrading.
Under pnpm, two apps depending on a shared `packages/editor` at different `@tiptap/*` versions is a
routine way to get exactly that. Keeping the dependency in one app means the bad state has no way to
arise — one consumer cannot disagree with itself about a version.

### Two — the Tiptap 3 configuration is load-bearing, setting by setting

**Stored documents are compatible, and this is the single most important finding.** `taskList`,
`taskItem` and the boolean `attrs.checked` are unchanged from 2.27.3 to 3.31.3: both node specs were
read (v2 `taskItem` is `name: 'taskItem'`, `defining: true`, content `paragraph+` or
`paragraph block*` when nested, one attribute `checked` with `default: false` and
`keepOnSplit: false`; v3 is the same spec, moved to `@tiptap/extension-list`), and the production
documents were round-tripped through `getSchema(extensions).nodeFromJSON(doc).check()`. No migration
step, and every progress number is identical. Measured over `data/projects/`: five tabs across two
projects, **12 `taskItem` nodes, 12 checked**, before and after. That equality is the licence for
everything else here — had it failed, the rest of this ADR would be a migration plan instead.

**`trailingNode: false` is required.** StarterKit 3 bundles `TrailingNode`, which v2 had no
equivalent of. It appends an empty trailing paragraph on the **first transaction** against any
document that does not end in a paragraph. Both production *checklist* tabs — `Go-live` and
`General` of "ACME Website" — end in a `taskList`; the other three tabs end in a paragraph and would
never have shown it. Measured on those two: root children **before 2, after 3** with the extension
on, and **2 → 2** with `trailingNode: false`. Left on, the user's first keystroke produces a document
diff they did not type, a dirty flag they did not earn, and an autosave they never caused — against a
conditional write (ADR 0016) that will then bump `updatedAt` for every other viewer. It changes **no
`taskItem` count**, which is precisely why it would have shipped unnoticed: the progress numbers, the
thing anyone would check, stay right while the document quietly grows.

**The `Link` options move inside `StarterKit.configure`.** StarterKit 3 bundles `Link`. The legacy
editor passes `StarterKit.configure({ ... })` *and* a separate `Link.configure({ openOnClick:
!editable, ... })` (`apps/legacy/public/js/editor.js`), which under v3 logs `Duplicate extension
names found: [link]` and races two configurations of one mark. Ported as written, whether
`openOnClick` is honoured depends on extension order.

**`Underline` is new in the schema.** StarterKit 3 bundles it; v2 had no concept of the mark. Any
validation that checks a stored document *against a schema* must therefore accept it — including the
round-trip above, which is the test that would otherwise reject a document the editor just produced.
It does not change ADR 0029: `assertSafeDocument` is deliberately schema-free, so the boundary guard
needs no edit, and that is a point in favour of how ADR 0029 was written.

**`History` is now `UndoRedo`, and the StarterKit option key is `undoRedo`.** A `history` key is
silently ignored rather than rejected, so a transcribed v2 configuration loses its undo settings
without a warning anywhere.

**Packages consolidated.** `TaskList` and `TaskItem` come from `@tiptap/extension-list`,
`Placeholder` from `@tiptap/extensions`. The old `@tiptap/extension-task-list`, `-task-item` and
`-placeholder` still publish at 3.31.3, and each `dist` is a two-line re-export shim — so importing
them works, teaches the next reader the wrong package boundary, and adds three dependencies that
exist only to forward.

**Every `@tiptap/*` v3 package peer-pins its siblings to the exact string `3.31.3`,** not a range.
So the set is catalogued at one version in `pnpm-workspace.yaml` and bumped as a unit; a partial bump
is an install error rather than a mixed graph, now that peer enforcement is actually in effect (ADR
0024's amendment).

**`immediatelyRender: false` is required under the App Router,** because rendering the editor during
the server pass throws. It also selects the `Editor | null` TypeScript overload of `useEditor`, and
that overload is the honest one: the value genuinely *is* `null` on first render. Leaving the flag
off gives a non-null type over a null value — the type system agreeing with the wrong model of
runtime, which is worse than the error it hides.

**`shouldRerenderOnTransaction` now defaults to `false`.** The legacy toolbar refreshes its active
state from `onSelectionUpdate` and `onTransaction` handlers. Ported naively to React those handlers
fire and the buttons never light up, because the component does not re-render. Toolbar state comes
from `useEditorState({ editor, selector })`.

**`@tiptap/html` is avoided.** It carries a non-optional `happy-dom` peer — a second DOM
implementation pulled into an app that has one — and `@tiptap/core` exports `generateHTML` and
`generateJSON` anyway.

## Consequences

- Macroplan cannot import the editor, and if it ever needs rich text the decision is reopened
  deliberately rather than by adding a dependency. The reopening test is ADR 0001's: does it need
  *this* schema, or its own?
- `packages/ui` keeps no ProseMirror dependency, so the duplicate-copy failure has no path into the
  shared package both apps consume. This is the concrete case ADR 0001 predicted when it said
  `packages/ui` growing into an app shell is the test of whether the rule is real.
- **The compatibility claim is a test, not a paragraph.** The production documents are fixtures, and
  the round-trip plus the progress count runs in CI — because "the format is unchanged" is exactly
  the kind of statement that stays true in an ADR while a dependency bump quietly falsifies it.
- **`trailingNode: false` needs a test that fails when it is removed**: apply one transaction to a
  document ending in a `taskList` and assert the child count is unchanged. Without that test the
  setting reads like a style preference and will eventually be deleted by someone tidying options.
- Upgrading Tiptap is one catalogue edit and one unit, never a per-package bump. The cost is that a
  patch to a single `@tiptap/*` package cannot be taken alone.
- Toolbar state is derived through `useEditorState` selectors, so the component re-renders on
  selector output rather than on every transaction. That is faster than the legacy behaviour and it
  is also the only thing that works; the performance is incidental.
- Every editor access needs a null guard, in exchange for a type that matches reality.

## Alternatives considered

**`packages/editor`, shared, with `@tiptap/*` as peer dependencies.** The conventional answer, and it
would let Macroplan adopt rich text later for free. Rejected on the duplicate-ProseMirror hazard:
peers make the version the consumer's problem, and two consumers are then free to disagree in a way
that fails at schema construction instead of at install. It buys reuse nobody has asked for at the
price of a failure mode that is hard to diagnose and impossible to unit-test for.

**Extract only the toolbar into `packages/ui`.** Tempting, because a button row is the part that
looks generic. Rejected: its state comes from `useEditorState` over a Tiptap `Editor`, so the
"generic" component has the whole schema in its type signature. What is genuinely shared is the
underlying shadcn primitives, and those are already in `packages/ui` (ADR 0025).

**Stay on Tiptap 2.27.3 for the port,** changing one thing at a time. Seriously considered, since it
removes a variable from a restructure that has many. Rejected once the round-trip showed the document
format identical: the port rewrites every call site anyway — vanilla DOM to React — so writing those
call sites against a version already a major behind buys nothing and pays for the migration twice.
The compatibility measurement is what turned this from a risk into a non-event.

**Take StarterKit 3's defaults and treat the differences as cosmetic.** Rejected, and this ADR exists
largely to record why: the default that would have caused real damage — `TrailingNode` — is invisible
in every metric the product displays. Defaults were compared item by item because one of them
silently edits the user's data.

**Write a migration to normalise stored documents** — append the trailing paragraph everywhere, so
`TrailingNode` becomes a no-op. Rejected: it is a data rewrite to accommodate an extension the app
does not need, and `trailingNode: false` achieves the same end with no write at all.
