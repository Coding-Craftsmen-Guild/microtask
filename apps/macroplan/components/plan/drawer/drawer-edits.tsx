import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DescriptionField } from './description-field'
import { EstimateField } from './estimate-field'
import { EDITS } from './field'
import { NameField } from './name-field'
import { PinField } from './pin-field'
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
   * Three of its members are read here: the name and the estimate each seed a field, and `pinSprint`
   * seeds the pin. `calendar` is read to be taken apart — the pin needs `rangeOfSprint` in the
   * browser to say what sprint it names, and what crosses that boundary has to be primitives, so the
   * three scheduling fields are handed over one at a time rather than as the object. `sizedByItems` is
   * the read half's and is not read here at all (`./drawer-facts.tsx`).
   */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which of these fields this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, of which this hands three to the browser. */
  readonly actions: PlanEditActions
}

/**
 * The fields a drawer edits one subject's own content with: its name, its estimate, its description.
 *
 * ### One boolean per field, and not one per form
 *
 * `PATCH .../features/{featureId}` authorises **every field the body carries** — `feature:rename` for
 * a name, `feature:estimate` for an estimate, `feature:pin` for a pin — and the first refusal writes
 * none of them (`lib/plan-capabilities.ts`). So these are two fields sending two requests rather than
 * one form sending one body: a `write` seat holds rename and estimate and not the pin, and a combined
 * body would lose the rename it was allowed in order to be refused the pin it was not. That is also
 * why the pin is absent here altogether — it is `manage`-only where these are `write`, so it belongs
 * to its own file drawn on its own boolean, not beside these two.
 *
 * The pin is the one of these three requests a `write` seat is refused, and it is drawn here rather
 * than in a file of its own: this file's own note below is that a control group is "a four-line child
 * here and a file of its own", and `./pin-field.tsx` is that file. What it is **not** is a fourth
 * field in the `pairFor` pair — that helper answers the two writes **both** kinds have, and there is
 * no `pinItem`: `PlanFeature` carries `pinSprint` and `PlanItem` does not
 * (`packages/contracts/src/plan.ts`), so the pin is asked for as `row.kind === 'feature'` and read
 * straight off `actions`. A `pairFor` widened to carry it would have to invent an item's pin or make
 * the member nullable, and both are claims the contract refuses.
 *
 * Each control answers **whether the field is on screen** and nothing else. The API is the gate, asked
 * again at the instant of the click, and a seat re-roled in between meets its 403 — which arrives as
 * the sentence under the field that refused it. Nothing here is load-bearing: all eighteen writes stay
 * wired on both surfaces whatever these booleans say (ADR 0038, ADR 0009).
 *
 * A surface that draws none of them draws no group either: every child being `null` leaves this
 * element childless, and `EDITS`'s `empty:hidden` is what keeps a read-only seat from being shown a
 * bordered box with nothing in it. A variant rather than a count, so the condition cannot fall out of
 * step with the three below it.
 *
 * ### Three actions cross to the browser, not eighteen
 *
 * This component is server-rendered and the three fields are not, so what it hands each of them is
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
 * ### Where this file splits next, and how a group mounts
 *
 * It splits by **control group**, one file per group, as each arrives: the pin, which has arrived and is
 * `./pin-field.tsx`; the dependency editor on its own, which is where `EDGE_SUFFIX` moves to from
 * `PlanTableRow`; delete on its own, being the only destructive one; and `placeFeature` and
 * `placeItem` together, a reorder a keyboard has to be able to drive.
 *
 * **The next group is where this file stops holding them all, and that is arithmetic rather than
 * taste.** The pin mounts as eleven lines and leaves this file in the high sixties of its eighty, and
 * four more groups are queued. So the group after this one starts a `./drawer-manage.tsx` and takes the
 * pin with it — one container per capability tier, which is the boundary the pin already makes visible:
 * `feature:pin`, `feature:depend`, `feature:place`, `item:place`, `feature:delete` and `item:delete`
 * are every one of them `manage`, and the three fields left here are every one of them `write`
 * (`packages/kernel/src/access/policy.ts`). It is not done now because a container holding one control
 * is a file with no second member to justify the shape of it, and because that file's own argument —
 * that a seat holding `write` and not `manage` sees exactly one of the two bands — cannot be written,
 * let alone tested, until there is more than one thing in the second band.
 *
 * A group **mounts as a child of this element** and takes the props this one takes: `planId`, `row`,
 * `values` where it edits one, `controls` and `actions`. It picks its own writes out of `actions` the
 * way `pairFor` does, so the kind is chosen once per group and never by a caller, and it draws its own
 * `null` when its boolean is false — the `empty:hidden` band above keeps counting for all of them. So
 * each new group is a four-line child here and a file of its own, and this file's own three fields
 * stay where they are.
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
      {row.kind === 'feature' && controls.pinFeature ? (
        <PinField
          featureId={row.id}
          pin={actions.pinFeature}
          pinSprint={values.pinSprint}
          planId={planId}
          sprintLengthDays={values.calendar.sprintLengthDays}
          startDate={values.calendar.startDate}
          timezone={values.calendar.timezone}
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
