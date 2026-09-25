import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DescriptionField } from './description-field'
import { EstimateField } from './estimate-field'
import { EDITS } from './field'
import { NameField } from './name-field'
import { pairFor } from './subject-writes'
import type { DrawerValues } from './values'

/** Props for {@link DrawerEdits}. */
export interface DrawerEditsProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The subject: its `kind` chooses the actions, and its `id` is what they are sent for. */
  readonly row: TableRow

  /**
   * The same subject's values, resolved out of the same plan (`./subject.ts`).
   *
   * **Two** of its members are read here: the name and the estimate, each seeding one field. The
   * other three belong to the two surfaces beside this one — `pinSprint` and the `plan` group to the
   * `manage` band (`./drawer-manage.tsx`), `sizedByItems` to the read half (`./drawer-facts.tsx`) —
   * and the whole object arrives all the same, because it is the one prop the panel hands down and a
   * band that took only what it read would change shape every time a control arrived.
   */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which of these fields this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, of which this hands at most two to the browser. */
  readonly actions: PlanEditActions
}

/**
 * The `write`-tier fields a drawer edits one subject with: its name, its estimate, its description.
 *
 * ### One boolean per field, and not one per form
 *
 * `PATCH .../features/{featureId}` authorises **every field the body carries** — `feature:rename` for
 * a name, `feature:estimate` for an estimate, `feature:pin` for a pin — and the first refusal writes
 * none of them (`lib/plan-capabilities.ts`). So these are separate fields sending separate requests
 * rather than one form sending one body: a `write` seat holds rename and estimate and not the pin, and a
 * combined body would lose the rename it was allowed in order to be refused the pin it was not. Each
 * field is drawn on its own boolean for that reason.
 *
 * The pin is what that argument was first written about, and it is no longer here: every control a
 * `write` seat is refused is now `./drawer-manage.tsx`'s, which is the band beside this one. The
 * three fields left are every one of them `write`-tier — `feature:rename`, `feature:estimate` and
 * `item:describe` — so the split between the two files **is** the role line, and neither has to test
 * a condition the other could contradict (`packages/kernel/src/access/policy.ts`).
 *
 * Each control answers **whether the field is on screen** and nothing else. The API is the gate, asked
 * again at the instant of the click, and a seat re-roled in between meets its 403 — which arrives as
 * the sentence under the field that refused it. Nothing here is load-bearing: all eighteen writes stay
 * wired on both surfaces whatever these booleans say (ADR 0038, ADR 0009).
 *
 * A surface that draws none of them draws no group either: every child being `null` leaves this
 * element childless, and `EDITS`'s `empty:hidden` is what keeps a read-only seat from being shown a
 * bordered box with nothing in it. A variant rather than a count, so the condition cannot fall out of
 * step with the three below it — and `./drawer-manage.tsx` draws the same band for the same reason,
 * so a `write` seat is shown this box and not that one.
 *
 * ### Two actions cross to the browser, not eighteen
 *
 * Three children are written below and no subject is ever handed more than two of them, the
 * description being an item's alone. This
 * component is server-rendered and none of the three is, so what it hands each of them is
 * what the Flight payload carries: one action reference, two ids and one value. `PlanEditActions`
 * itself stays on the server — with `pairFor`, which names it (`./subject-writes.ts`) — which is why
 * the fields take a `SubjectWrite`, the shape all five of these writes already have, instead of the
 * interface. None of them can reach a second action, and none of them is bound to anything, so nothing
 * rides along inside a closure (ADR 0040).
 *
 * The description is an **item's** alone: `PlanManifest` is "everything about a plan except its item
 * descriptions", there is no `describeFeature` among the eighteen, and no epic, feature or plan schema
 * carries a `description` field. The item's does appear in three, which is not the same claim as "one
 * schema has it": `ItemDocument` is the file that stores it (`plan.ts`), `ItemView` is the item record
 * with that text joined back on for a read — which is what `read-description.ts` beside this drawer
 * projects (`plan-views.ts`) — and `DescriptionPayload` is the body that replaces it
 * (`structure-payloads.ts`). A `null` means the text was not read — a feature,
 * or an item whose file the API would not answer for — and draws no box, because an empty box over a
 * description nobody saw would replace it with nothing on the first blur. The **kind** is checked as
 * well as the text, rather than trusting a caller to pass `null` for a feature: `describeItem` would
 * otherwise be sent a `featureId` as its item, which the type cannot rule out because both ids are
 * strings.
 *
 * ### Where the groups still queued go, which is no longer here
 *
 * It split by **control group**, one file per group, and then by **capability tier** once there was a
 * second `manage`-tier control to make that cut real: the pin is `./pin-field.tsx`, what a feature
 * waits on is `./dependency-editor.tsx`, and both are mounted by `./drawer-manage.tsx`. The two groups
 * still queued — delete, being the only destructive one, and `placeFeature` with `placeItem` together,
 * a reorder a keyboard has to be able to drive — are `manage`-tier as well, so they land in **that**
 * file and not in this one. This file is finished at three fields unless a fourth `write`-tier action
 * appears, and there is none left among the eighteen.
 *
 * That was arithmetic rather than taste, and it is worth keeping the figures: a group costs four lines
 * of scaffolding — the ternary, the element, its close and the `: null` — plus one per prop, which
 * made the pin's seven props eleven lines. This file stood at 62 of its 80 with the pin in it and
 * three groups still queued against 18 free lines, so the second band had to open before the third
 * group, not after it. What it was waiting for was a **second member**: a container holding one
 * control cannot make the argument that a seat holding `write` and not `manage` sees exactly one of
 * the two bands, let alone have it tested.
 *
 * A group takes the props this one takes — `planId`, `row`, `values` where it edits one, `controls`
 * and `actions` — picks its own writes out of `actions` the way `pairFor` does, so the kind is chosen
 * once per group and never by a caller, and draws its own `null` when its boolean is false.
 *
 * **Create is the exception, and it is not subject-scoped.** `createItem` needs a parent feature and
 * `createFeature` a rail, so neither is a write *about* the subject this component is handed — a
 * drawer open on an item cannot mount "add an item" without inventing which feature it means. Create
 * is therefore a sibling group mounted by `./drawer-panel.tsx` beside this one, on the row's
 * `featureId`-shaped context rather than on its subject, and it is the one group that does not belong
 * under here.
 *
 * What must **not** split is this file by row kind: a feature's fields and an item's answer the same
 * questions about different subjects, and `rows.ts` refuses the same split for the same reason.
 */
export function DrawerEdits({ planId, row, values, description, controls, actions }: DrawerEditsProps) {
  const pair = pairFor(row.kind, controls, actions)
  return (
    <div className={EDITS}>
      {pair.renamable ? (
        <NameField
          kind={row.kind}
          name={values.name}
          planId={planId}
          rename={pair.rename}
          subjectId={row.id}
        />
      ) : null}
      {pair.estimable ? (
        <EstimateField
          estimate={pair.estimate}
          estimateDays={values.estimateDays}
          kind={row.kind}
          planId={planId}
          subjectId={row.id}
        />
      ) : null}
      {row.kind === 'item' && description !== null && controls.describeItem ? (
        <DescriptionField
          describe={actions.describeItem}
          description={description}
          itemId={row.id}
          planId={planId}
        />
      ) : null}
    </div>
  )
}
