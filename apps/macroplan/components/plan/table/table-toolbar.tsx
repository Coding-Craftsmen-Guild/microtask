import Link from 'next/link'
import { columnsFor } from './columns'
import { ColumnRow, TableFilter, type FilterOption } from './table-controls'
import { TABLE, TABLE_WORDS } from './table-css'

/** Props for {@link TableToolbar}. */
export interface TableToolbarProps {
  /** Every rail in the plan, for the rail filter. */
  readonly rails: readonly FilterOption[]

  /** Every group in the plan, for the group filter. */
  readonly groups: readonly FilterOption[]

  /** Whether the actions column exists, so the menu does not offer a checkbox for a column with no cells. */
  readonly mayEdit: boolean

  /** Where a new rail is added, or `null` on a surface that may not add one. */
  readonly newRailHref: string | null
}

/**
 * The strip over the table: a search, two filters, the column menu, and the one thing a table can add.
 *
 * ### Why every control here is server markup
 *
 * The filters are built from the plan's own rails and groups, and a client component under
 * `components/plan` may be handed primitives, an unbound function or `null` and nothing else
 * (`../module-boundaries.test.tsx`). An array of rails is none of those. So the whole strip is rendered
 * by the server and `./table-root.tsx` listens over it by delegation — the same shape
 * `sidebar/sidebar-search.tsx` has, and for the same reason.
 *
 * ### Why the column menu needs no JavaScript to hide a column
 *
 * Each checkbox is a real `<input>` with an `id` the generated sheet keys a `:has()` rule on, so
 * unchecking one hides that column outright (`./table-css.ts`). Only the two **move** buttons need the
 * client root, because reordering cells in a table is the one thing CSS cannot express: `order` does not
 * apply to table cells, and the alternative — dropping `<table>` for a grid — would cost the semantics
 * ADR 0056 says this rendering exists for.
 *
 * Two buttons rather than a draggable header: it is operable from a keyboard, it needs no pointer
 * sensing, and the menu is already where a reader goes to decide which columns they want.
 *
 * ### Why adding is here and deleting is not
 *
 * A new rail is the one thing that belongs to the plan rather than to a row, so it is the one add in the
 * strip; adding a feature belongs to a rail and adding an item to a feature, and both are links in their
 * row's own actions. Nothing destructive is here at all — a delete with the whole table selected is not a
 * gesture this product offers, and the per-row link goes to the confirm that already exists.
 */
export function TableToolbar({ rails, groups, mayEdit, newRailHref }: TableToolbarProps) {
  return (
    <div className={TABLE.toolbar} data-slot="table-toolbar">
      <input
        aria-label={TABLE_WORDS.search}
        className={TABLE.search}
        data-slot="table-search"
        placeholder={TABLE_WORDS.hint}
        type="search"
      />
      <TableFilter label={TABLE_WORDS.allRails} options={rails} which="rail" />
      <TableFilter
        extra={{ id: 'none', name: TABLE_WORDS.noGroup }}
        label={TABLE_WORDS.allGroups}
        options={groups}
        which="group"
      />
      <details className={TABLE.menu} data-slot="table-columns">
        <summary className={TABLE.menuHead}>{TABLE_WORDS.columns}</summary>
        <div className={TABLE.menuBody}>
          {columnsFor(mayEdit).map((column) => (
            <ColumnRow column={column} key={column.key} />
          ))}
        </div>
      </details>
      <span className={TABLE.spacer} />
      {newRailHref === null ? null : (
        <Link className={TABLE.action} href={newRailHref}>
          {TABLE_WORDS.newRail}
        </Link>
      )}
    </div>
  )
}
