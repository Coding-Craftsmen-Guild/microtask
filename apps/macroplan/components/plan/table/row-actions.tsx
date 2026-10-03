import { PlanLink } from '../nav/plan-nav'
import { TABLE, TABLE_WORDS } from './table-css'

/** The fragment the drawer's add-a-child field answers to, which is that field's own `id`. */
export const ADD_ANCHOR = 'plan-drawer-new-item'

/** The fragment the drawer's delete control answers to. */
export const DELETE_ANCHOR = 'plan-drawer-delete'

/** Props for {@link RowActions}. */
export interface RowActionsProps {
  /** Where this row's own entity opens. */
  readonly href: string

  /** Whether this row can have something added under it: a feature can, an item cannot. */
  readonly mayAdd: boolean

  readonly mayRemove: boolean
}

/**
 * The three things a row offers: open it, add under it, delete it.
 *
 * ### Why all three are links into the drawer
 *
 * Because of what the alternatives cost. A delete **button** per row is either a client island per row —
 * two thousand of them, which is the thing ADR 0058 exists to prevent — or a bare form posting a
 * destructive write with no confirmation, which `../drawer/delete-control.tsx` deliberately does not
 * offer. The drawer already holds the rename, the estimate, the add-a-child field and the delete with
 * its confirm dialog, and it is **one** island whichever of two thousand rows opened it.
 *
 * So each link goes to the control that does the thing rather than to the top of a panel: the add lands
 * on the field that adds, and the delete lands on the control that deletes. That is what the fragments
 * are for, and they are the ids those two controls already carry — `ADD_ANCHOR` is the `fieldId`
 * `CreateControls` gives its item field, which `FieldShell` puts on the input itself.
 *
 * A row for an **item** offers no add. An item holds nothing, so there would be nothing for the link to
 * land on; the honest rendering is two links rather than three, and `rows.ts`'s `kind` is what says which
 * kind of row this is.
 */
export function RowActions({ href, mayAdd, mayRemove }: RowActionsProps) {
  return (
    <span className={TABLE.actions} data-slot="row-actions">
      <PlanLink className={TABLE.action} href={href}>
        {TABLE_WORDS.edit}
      </PlanLink>
      {mayAdd ? (
        <PlanLink className={TABLE.action} href={`${href}#${ADD_ANCHOR}`}>
          {TABLE_WORDS.add}
        </PlanLink>
      ) : null}
      {mayRemove ? (
        <PlanLink className={TABLE.action} href={`${href}#${DELETE_ANCHOR}`}>
          {TABLE_WORDS.remove}
        </PlanLink>
      ) : null}
    </span>
  )
}
