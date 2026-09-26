import type { PlanBridge } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import { tableRows } from './rows'
import { PlanTableRow } from './table-row'

const TABLE = 'w-full border-collapse text-left text-[13px]'

const HEAD = 'px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const COLUMNS = ['Epic', 'Feature', 'Item', 'Group', 'Estimate', 'Sprint', 'Progress', 'Blocked by']

/** Props for {@link PlanTable}. */
export interface PlanTableProps {
  /**
   * The plan and the schedule derived from it, as `GET /plans/{planId}` answered it minus the seats.
   *
   * A {@link PlanScreenModel} rather than a `Plan`, for the reason `PlanCanvasProps.plan` records:
   * the type a share token cannot be represented in is this component's own floor, so it holds for a
   * surface mounted beside `PlanScreen` as well as under it.
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
}

/**
 * The plan as a real table, and the canvas's accessible peer: §5's "first-class second rendering of
 * the same data, not an afterthought".
 *
 * `PlanCanvas` ships `role="img"` with one `aria-label` and names nothing inside it, deliberately —
 * "announcing 2,000 unnamed rects would be worse than announcing none" — so this is not a convenience
 * beside the picture, it is **the only rendering of a plan a screen reader can read**. §5: "An
 * SVG-only plan is unreadable to a screen reader, and the table is also the fastest way to audit a
 * plan someone else drew." `PlanScreen` therefore keeps it mounted whichever view is selected.
 *
 * It names every feature and every item the plan's derived order reaches, which is a superset of what
 * the canvas draws; `tableRows` argues what that includes and what it cannot.
 *
 * ### Eight columns
 *
 * §5 names seven: "epic, feature, item, estimate, sprint, progress, blocked-by". All seven are here —
 * `progress` arrived with the phase-4 bridge, which is what deleted the `<caption>` that used to explain
 * its absence — and `Group` is the eighth, which §5 does not name because groups are not in it.
 *
 * The group column is the table's half of "select a group and they are all selected". The chips beside
 * the plan’s name dim the bars of every feature not in the chosen group, and they dim these rows by the
 * same generated rule, because a row carries `data-label-id` exactly as a bar does
 * (`labels/group-css.ts`). Dimming is paint, so the **words** are what a reader who cannot see it has:
 * naming the group in a cell of its own is what makes a grouped plan auditable by a screen reader, and it
 * is why this is a column rather than a colour on the row.
 *
 * `blocked-by` is here because `dependsOn` is on the wire — but never as a bare list of names:
 * `rows.ts` argues the four things a stated dependency can turn out to be.
 *
 * ### The accessible name
 *
 * `aria-label`, not the caption, and it is `Table of <plan>` against the canvas's `Timeline of
 * <plan>`, so the two renderings of one plan are told apart by what they are rather than by which
 * happens to come first. There is no `eslint-plugin-jsx-a11y` and no `axe` in this repo, so the whole
 * mechanism is a role-based assertion with the reason in the test name: `plan-table.test.tsx` reaches
 * this table only through `getByRole('table', { name })` and asserts `scope` on every header cell.
 */
export function PlanTable({ plan, progress = [] }: PlanTableProps) {
  const counted = new Map(progress.map((row) => [row.itemId, row.progress]))
  return (
    <table aria-label={`Table of ${plan.name}`} className={TABLE} data-slot="plan-table">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th className={HEAD} key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableRows(plan).map((row) => (
          <PlanTableRow key={row.id} progress={counted.get(row.id) ?? null} row={row} />
        ))}
      </tbody>
    </table>
  )
}
