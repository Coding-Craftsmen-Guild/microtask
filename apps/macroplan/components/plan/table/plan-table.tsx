import type { PlanBridge } from '@repo/api-client'
import { railNames } from '../canvas/view'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import type { PlanScreenModel } from '../plan-screen-model'
import { columnsFor } from './columns'
import { tableRows } from './rows'
import { TABLE, TABLE_CSS } from './table-css'
import { TableHead } from './table-head'
import { PlanTableRow } from './table-row'
import { TableRoot } from './table-root'
import type { FilterOption } from './table-controls'
import { TableToolbar } from './table-toolbar'

/** What a viewer may do to a row, which is what decides whether there is an actions column at all. */
export interface TableWrites {
  /** Whether the drawer offers this viewer anything to change, which is what `Edit` promises. */
  readonly rename: boolean

  readonly add: boolean

  readonly remove: boolean
}

/** Props for {@link PlanTable}. */
export interface PlanTableProps {
  /**
   * The plan and the schedule derived from it, as `GET /plans/{planId}` answered it minus the seats.
   *
   * A {@link PlanScreenModel} rather than a `Plan`, for the reason `PlanCanvasProps.plan` records: the
   * type a share token cannot be represented in is this component's own floor, so it holds for a surface
   * mounted beside `PlanScreen` as well as under it.
   */
  readonly plan: PlanScreenModel

  /**
   * What each linked item's task counts, as the bridge answered it. `[]` when nothing is counted.
   *
   * Keyed on the **item** id and never on a feature's: spec §5 asks for a progress column and design §7.2
   * fixes what a number in it may be — "an item's percentage is the linked task's `{ done, total }`" — so
   * a feature has no number of its own here. Summing its items' counts would invent one: two tasks at 1 of
   * 2 and 3 of 4 are not "4 of 6 done" in any sense the linked tasks agree with, and a feature whose items
   * are linked to tasks in two different projects would be adding across products. A feature row's cell is
   * therefore **empty**, which is the same choice `TableRow.item` already makes for a feature's item cell.
   */
  readonly progress?: PlanBridge['items']

  /** The plan id or the seat token, whichever roots this surface's URLs. */
  readonly root?: string

  /**
   * How this surface addresses a drawer, or `null` where it has none.
   *
   * With {@link PlanTableProps.writes}, the pair that decides whether there is an actions column at all —
   * and both default to nothing, so a table mounted with neither draws the eight columns it always drew.
   * That default is the safe one in the direction it matters: a surface that forgot to hand over its
   * routes shows no actions rather than three links built on an empty root.
   */
  readonly routes?: DrawerRoutes | null

  /** What this viewer may do, which decides the actions column and the links inside it. */
  readonly writes?: TableWrites

  /** Where a new rail is added, or `null` on a surface that may not add one. */
  readonly newRailHref?: string | null
}

const NOTHING_WRITABLE: TableWrites = { rename: false, add: false, remove: false }

const hrefOf = (row: { readonly kind: string; readonly id: string }, root: string, routes: DrawerRoutes | null): string =>
  routes === null ? '' : row.kind === 'feature' ? routes.feature(root, row.id) : routes.item(root, row.id)

const optionsOf = (pairs: Iterable<readonly [string, string]>): readonly FilterOption[] =>
  [...pairs].map(([id, name]) => ({ id, name }))

/**
 * The plan as a real data table: searched, filtered, ordered, and with its columns under the reader's
 * control.
 *
 * It is also the canvas's accessible peer, and that has not changed and may not: `PlanCanvas` ships
 * `role="img"` with one `aria-label` and names nothing inside it, deliberately — "announcing 2,000
 * unnamed rects would be worse than announcing none" — so this is **the only rendering of a plan a
 * screen reader can read** (ADR 0056, §5). `PlanScreen` keeps it mounted whichever view is selected, and
 * every capability added here is additive to that: a `<table>` with `scope`d headers, a row header per
 * row, and nothing that depends on a pointer.
 *
 * ### What each part is, and what it costs
 *
 * The toolbar is **server markup**, because its filters are built from the plan's own rails and groups
 * and a client component here may not be handed either. Hiding a column is a **checkbox and a CSS rule**
 * (`./table-css.ts`), so it costs no island at all. Searching, sorting and moving a column are the three
 * things neither can express, and `./table-root.tsx` is what does them — one island over the whole panel,
 * reading the markup the way every client component on this page reads it.
 *
 * ### Nine columns
 *
 * §5 names seven; `Group` is ADR 0064's and `Actions` is this revision's. The group column is the
 * table's half of "select a group and they are all selected" — a row carries `data-label-id` exactly as a
 * bar does, and the words in the cell are what a reader who cannot see dimming has. `./columns.ts` holds
 * the list, which is the only place it exists: the header, the visibility checkboxes, the sheet and the
 * reordering all read it, so a column cannot be added to one of the four and missed from the others.
 *
 * ### The accessible name
 *
 * `aria-label`, and it is `Table of <plan>` against the canvas's `Timeline of <plan>`, so the two
 * renderings of one plan are told apart by what they are rather than by which comes first. There is no
 * `eslint-plugin-jsx-a11y` and no `axe` in this repo, so the whole mechanism is a role-based assertion
 * with the reason in the test name: `plan-table.test.tsx` reaches this table only through
 * `getByRole('table', { name })` and asserts `scope` on every header cell.
 */
export function PlanTable(props: PlanTableProps) {
  const { plan, progress = [], root = '', routes = null, newRailHref = null } = props
  const writes = props.writes ?? NOTHING_WRITABLE
  const counted = new Map(progress.map((row) => [row.itemId, row.progress]))
  const mayEdit = routes !== null && (writes.rename || writes.add || writes.remove)
  return (
    <TableRoot>
      <style>{TABLE_CSS}</style>
      <TableToolbar
        groups={optionsOf(plan.labels.map((label) => [label.id, label.name] as const))}
        mayEdit={mayEdit}
        newRailHref={newRailHref}
        rails={optionsOf(railNames(plan))}
      />
      <div className={TABLE.scroller} data-slot="table-scroller">
        <table aria-label={`Table of ${plan.name}`} className={TABLE.table} data-slot="plan-table">
          <TableHead columns={columnsFor(mayEdit)} />
          <tbody>
            {tableRows(plan).map((row) => (
              <PlanTableRow
                href={hrefOf(row, root, routes)}
                key={row.id}
                mayEdit={mayEdit}
                progress={counted.get(row.id) ?? null}
                row={row}
                writes={writes}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TableRoot>
  )
}
