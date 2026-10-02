import type { ReactNode } from 'react'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { CreateControls } from './create-controls'
import { DrawerEdits } from './drawer-edits'
import { DrawerFacts } from './drawer-facts'
import { DrawerManage } from './drawer-manage'
import { PANEL_GRID } from './panel-css'
import type { DrawerValues } from './values'

/**
 * Everything all three columns are built from, which is the panel's own props minus its chrome.
 *
 * One record rather than three parameter lists, because the three columns take overlapping subsets of
 * exactly these six and `max-params` is four. It is also what keeps `./drawer-panel.tsx` a frame: it
 * destructures nothing and hands this object on, so a band that grows a prop does not change the file
 * that lays the bands out.
 */
export interface PanelParts {
  readonly planId: string

  readonly row: TableRow

  readonly values: DrawerValues

  readonly description: string | null

  readonly controls: PlanContentControls

  readonly actions: PlanEditActions

  readonly closeHref: string
}

/**
 * The first column: what the schedule made of this subject, and the fields that change it.
 *
 * The facts and the `write`-tier fields are together because they are the same subject read and then
 * written — a reader checks the estimate the timeline used and then corrects the one somebody
 * authored, and in the dock those two were separated by everything else the panel held.
 */
export function IdentityColumn({ parts }: { readonly parts: PanelParts }) {
  const { row, values, actions, controls, description, planId } = parts
  return (
    <div className={PANEL_GRID.column} data-slot="panel-identity">
      <DrawerFacts row={row} sizedByItems={values.sizedByItems} />
      <DrawerEdits
        actions={actions}
        controls={controls}
        description={description}
        planId={planId}
        row={row}
        values={values}
      />
    </div>
  )
}

/**
 * The second column: the `manage`-tier controls — the pin, the dependencies, the moves, the delete.
 *
 * A column of its own rather than a band under the first, which is the capability line drawn as
 * layout: `./drawer-manage.tsx` carries why every control in it is granted to `manage` alone, and a
 * seat holding `write` and not `manage` is shown an empty column rather than a gap mid-form.
 */
export function ManageColumn({ parts }: { readonly parts: PanelParts }) {
  const { row, values, actions, controls, planId, closeHref } = parts
  return (
    <div className={PANEL_GRID.column} data-slot="panel-manage">
      <DrawerManage
        actions={actions}
        closeHref={closeHref}
        controls={controls}
        planId={planId}
        row={row}
        values={values}
      />
    </div>
  )
}

/**
 * The third column: what this subject holds, and what it points at.
 *
 * The one group whose subject is **not** the panel's — adding a feature to this rail, adding an item
 * to this feature — plus the link to a Microtask task, which is about this item and is read from a
 * second request the panel is merely handed the result of (`./drawer-panel.tsx`'s `link`).
 */
export function ChildrenColumn({ parts, link }: { readonly parts: PanelParts; readonly link: ReactNode }) {
  const { values, actions, controls, planId } = parts
  return (
    <div className={PANEL_GRID.column} data-slot="panel-children">
      {link}
      <CreateControls
        createFeature={actions.createFeature}
        createItem={actions.createItem}
        featureId={values.place.featureId}
        newFeature={controls.createFeature}
        newItem={controls.createItem}
        planId={planId}
        railId={values.place.railId}
      />
    </div>
  )
}
