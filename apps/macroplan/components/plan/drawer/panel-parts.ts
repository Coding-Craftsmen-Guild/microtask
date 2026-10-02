import type { ReactNode } from 'react'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import type { DrawerValues } from './values'

/**
 * Everything the panel's columns are built from, which is the panel's own props minus its chrome.
 *
 * One record rather than four parameter lists, because the columns take overlapping subsets of exactly
 * these seven and `max-params` is four. It is also what keeps `./drawer-panel.tsx` a frame: it
 * destructures nothing and hands this object on, so a column that grows a reading does not change the
 * file that lays the columns out.
 */
export interface PanelParts {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The one subject this panel is open on, as `tableRows` already worded it. */
  readonly row: TableRow

  /** The same subject's values, from the same lookup of the same plan (`./subject.ts`). */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which fields this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, handed in by the page that read the credential. */
  readonly actions: PlanEditActions

  /**
   * The plan's own path: where Close goes, and the root every link to a sibling drawer hangs off.
   *
   * Two jobs for one string, and they are the same fact: this is the address with nothing selected, so
   * `<closeHref>/i/<id>` is that item's drawer on both surfaces. It is why the items list and the
   * dependency chips can link without any page handing this panel a route builder
   * (`lib/drawer-routes.ts`).
   */
  readonly closeHref: string

  /** This item's link to a Microtask task, built by the page that read the bridge; `null` otherwise. */
  readonly link: ReactNode
}
