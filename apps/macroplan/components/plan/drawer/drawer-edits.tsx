import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DescriptionField } from './description-field'
import { EstimateField } from './estimate-field'
import { NameField } from './name-field'
import type { DrawerValues, SubjectKind, SubjectWrite } from './field'

const EDITS = 'grid gap-3 border-t border-foreground/10 pt-3 empty:hidden'

interface Pair {
  readonly renamable: boolean
  readonly rename: SubjectWrite<string>
  readonly estimable: boolean
  readonly estimate: SubjectWrite<number | null>
}

const pairFor = (
  kind: SubjectKind,
  controls: PlanContentControls,
  actions: PlanEditActions,
): Pair =>
  kind === 'feature'
    ? {
        renamable: controls.renameFeature,
        rename: actions.renameFeature,
        estimable: controls.estimateFeature,
        estimate: actions.estimateFeature,
      }
    : {
        renamable: controls.renameItem,
        rename: actions.renameItem,
        estimable: controls.estimateItem,
        estimate: actions.estimateItem,
      }

/** Props for {@link DrawerEdits}. */
export interface DrawerEditsProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The subject: its `kind` chooses the actions, and its `id` is what they are sent for. */
  readonly row: TableRow

  /** The same subject's editable values, resolved out of the same plan (`./subject.ts`). */
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
 * Each control answers **whether the field is on screen** and nothing else. The API is the gate, asked
 * again at the instant of the click, and a seat re-roled in between meets its 403 — which arrives as
 * the sentence under the field that refused it. Nothing here is load-bearing: all eighteen writes stay
 * wired on both surfaces whatever these booleans say (ADR 0038, ADR 0009).
 *
 * A surface that draws none of them draws no group either: every child being `null` leaves this
 * element childless, and `empty:hidden` is what keeps a read-only seat from being shown a bordered
 * box with nothing in it. A variant rather than a count, so the condition cannot fall out of step with
 * the three below it.
 *
 * ### Three actions cross to the browser, not eighteen
 *
 * This component is server-rendered and the three fields are not, so what it hands each of them is
 * what the Flight payload carries: one action reference, two ids and one value. `PlanEditActions`
 * itself stays on the server, which is why the fields take a `SubjectWrite` — the shape all five of
 * these writes already have — instead of the interface. None of them can reach a second action, and
 * none of them is bound to anything, so nothing rides along inside a closure (ADR 0040).
 *
 * The description is an **item's** alone: `PlanManifest` is "everything about a plan except its item
 * descriptions", there is no `describeFeature` among the eighteen, and `ItemDocument` is the only
 * schema in the product with a `description` at all. A `null` means the text was not read — a feature,
 * or an item whose file the API would not answer for — and draws no box, because an empty box over a
 * description nobody saw would replace it with nothing on the first blur. The **kind** is checked as
 * well as the text, rather than trusting a caller to pass `null` for a feature: `describeItem` would
 * otherwise be sent a `featureId` as its item, which the type cannot rule out because both ids are
 * strings.
 *
 * ### Where this file splits next
 *
 * It is **at** the 80-line cap already, so the next group has nowhere else to go. It splits by
 * **control group**, one file per group, as each arrives: the pin on its own, `feature:pin` being
 * `manage` where these two are `write`; the dependency editor on its own, which is where `EDGE_SUFFIX`
 * moves to from `PlanTableRow`; delete on its own, being the only destructive one; and `placeFeature`
 * and `placeItem` together, a reorder a keyboard has to be able to drive. What must **not** split is
 * this file by row kind: a feature's fields and an item's answer the same questions about different
 * subjects, and `rows.ts` refuses the same split for the same reason.
 */
export function DrawerEdits({
  planId,
  row,
  values,
  description,
  controls,
  actions,
}: DrawerEditsProps) {
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
