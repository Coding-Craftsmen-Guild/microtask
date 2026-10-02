import type { ReactNode } from 'react'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DeleteControl } from './delete-control'
import { DrawerDock } from './drawer-dock'
import { EdgesColumn } from './edges-column'
import { FIELD_CSS } from './field-css'
import { IdentityColumn } from './identity-column'
import { ItemsColumn } from './items-column'
import { OrderColumn } from './order-column'
import { PANEL_GRID } from './panel-css'
import { PanelTabs } from './panel-tabs'
import type { PanelParts } from './panel-parts'
import { removalFor } from './subject-writes'
import type { TabView } from './tab-view'
import type { DrawerValues } from './values'

/** Props for {@link DrawerPanel}. */
export interface DrawerPanelProps {
  /** The plan this subject belongs to, which is what every write below is addressed at. */
  readonly planId: string

  /**
   * The one subject this drawer is open on, as `tableRows` already worded it.
   *
   * A {@link TableRow} and **not** the plan, the feature record or the item record: the page that
   * resolved the URL hands over one row, so nothing under here can reach a second subject, and a
   * share token is doubly unrepresentable — the row holds six strings and the plan it came from was
   * a `PlanScreenModel` before that (ADR 0033).
   */
  readonly row: TableRow

  /**
   * The same subject's values, from the same lookup of the same plan (`./subject.ts`).
   *
   * Every value the three columns need arrives in this one prop, which is what keeps the panel's own
   * props stable as each of them grows: the authored estimate and the pin go to the fields row, the
   * dates and the scheduled sprint to the readings beside them, `panel.family` to the items column,
   * `panel.candidates` and `panel.unblocks` to the dependency column, and `plan.features` to the cycle
   * check that greys a row of the search.
   */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which fields this surface draws — content answers only; a drawer asks nothing about seats. */
  readonly controls: PlanContentControls

  /** Every write of plan content, handed in by the page that read the credential. */
  readonly actions: PlanEditActions

  /**
   * The plan's own path: where Close goes, and the root every link to a sibling drawer hangs off.
   *
   * It is also where a **delete** lands, and that is why it is threaded down rather than rebuilt from
   * `planId`: this prop comes from the page that knows which surface it is rendering, and a seat holder
   * sent to `/plans/<planId>` would meet a cookie surface and a login with no password behind it
   * (`./delete-control.tsx`, ADR 0032). The items list and the dependency chips build their links off
   * the same string, which is what keeps this panel free of a route builder (`lib/drawer-routes.ts`).
   */
  readonly closeHref: string

  /**
   * This item's link to a Microtask task, or `null` — on a feature, and on any surface without a bridge.
   *
   * A **slot** rather than props, and the reason is the same one `PlanScreen`'s four slots have: what it
   * needs is not derivable from anything else this panel holds. The link field's state comes from the
   * *bridge* read — whether the rail resolved, what its token is worth today, what the task is called —
   * and this panel is handed a plan and a row. A page reads both and builds the element; nothing under
   * here has to learn that a second read exists.
   */
  readonly link: ReactNode

  /** What is wrong with this subject, as a callout over its columns. Nothing when it is fine. */
  readonly attention: ReactNode

  /**
   * Every tab open in the strip, the active one being this subject.
   *
   * Resolved by the page rather than here, for the reason `values` is: a tab carries a name and a hue
   * and two addresses, and this panel is handed one subject. The page reads the plan once and words the
   * whole strip out of it (`./tab-view.ts`), which is also why a tab naming a subject the plan no longer
   * holds never reaches this file.
   */
  readonly tabs: readonly TabView[]
}

/**
 * One feature or one item, drawn under the plan it belongs to, as columns rather than a stack.
 *
 * ### The two layouts, and why they are different shapes
 *
 * A feature is `1.45fr 1fr 1fr`: what it is, what it waits on, what it holds. An item is `1.45fr 2fr`:
 * what it is, and where it sits in its feature. That is not a stylistic difference — an item has no
 * items and no dependencies of its own, so a third column would be an empty column, and the order
 * controls that *are* its second subject need the width to name both neighbours.
 *
 * The first column is the same on both, which is what makes the panel readable when a reader clicks
 * from a feature to one of its items: the meta line, the name and the fields row stay where they were,
 * and only the columns beside them change.
 *
 * ### What this file is
 *
 * The frame, the tab and the arrangement. Each column is a file — `./identity-column.tsx`,
 * `./edges-column.tsx`, `./items-column.tsx`, `./order-column.tsx` — and each takes the same
 * {@link PanelParts} record rather than a parameter list of its own, so a column that grows a reading
 * does not change this file (`./panel-parts.ts`).
 *
 * Delete is the one control this file places itself, and it is on the **tab** rather than in a column:
 * it is an action on the thing the tab names rather than a value of it, and a destructive button at the
 * foot of a column of inputs is a destructive button in tab order after every one of them.
 *
 * `FIELD_CSS` is two focus rings and a hidden marker — the three things a `summary` and an `sr-only`
 * radio cannot be given with a class. It is emitted here, once per panel, rather than per field.
 *
 * ### Two shapes of the same subject, neither derived from the other
 *
 * `row` is worded **for display** and `values` are raw, and both are real needs: the reading under the
 * fields wants `planned 40d · broken down to 5d · -35d`, and the stepper wants `40`. They are not two
 * sources of truth for one fact — `./subject.ts` resolves both in one lookup of one plan, so they
 * cannot name two records, and this panel neither formats a value nor parses a sentence. What the row
 * contributes that no field does is the schedule's verdict; `./panel-words.ts` prints it only where it
 * differs from the number in the field, since a panel that printed `2d` under a stepper showing `2`
 * would be charging a line for a fact already on screen (ADR 0051).
 *
 * ### A landmark, a named heading and no dialog
 *
 * It is an `<aside>` named by its own heading — `aria-labelledby` naming the `TITLE_ID` that
 * `./drawer-dock.tsx` puts on the `<h2>` in the tab — so a reader can jump to it and hear what is open.
 * It claims no `role="dialog"` and traps no focus: this is a **route**, not an overlay. The thing that
 * closes it is a `Link` back to the plan's path and never a button, so Back, a bookmark and Close all
 * mean the same thing, and no JavaScript is needed for any of them.
 */
export function DrawerPanel(props: DrawerPanelProps) {
  const { row, closeHref, attention } = props
  const parts: PanelParts = {
    actions: props.actions,
    closeHref,
    controls: props.controls,
    description: props.description,
    link: props.link,
    planId: props.planId,
    row,
    stack: props.tabs.map((tab) => ({ id: tab.id, kind: tab.kind })),
    values: props.values,
  }
  const feature = row.kind === 'feature'
  const removal = removalFor(row.kind, props.controls, props.actions)
  return (
    <DrawerDock
      tab={<PanelTabs tabs={props.tabs} />}
      tools={
        removal.deletable ? (
          <DeleteControl
            closeHref={closeHref}
            kind={row.kind}
            name={props.values.name}
            planId={props.planId}
            remove={removal.remove}
            subjectId={row.id}
          />
        ) : null
      }
    >
      <style>{FIELD_CSS}</style>
      <div
        className={feature ? PANEL_GRID.root : PANEL_GRID.pair}
        data-kind={row.kind}
        data-slot="drawer-panel"
        data-treatment={row.treatment}
      >
        {attention === null ? null : <div className={PANEL_GRID.wide}>{attention}</div>}
        <IdentityColumn parts={parts} />
        {feature ? <EdgesColumn parts={parts} /> : <OrderColumn parts={parts} />}
        {feature ? <ItemsColumn parts={parts} /> : null}
      </div>
    </DrawerDock>
  )
}
