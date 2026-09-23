import type { Plan } from '@repo/api-client'
import { tableRows } from './rows'
import { PlanTableRow } from './table-row'

const TABLE = 'w-full border-collapse text-left text-[13px]'

const HEAD = 'px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const CAPTION = 'pb-2 text-left text-[12px] text-muted-foreground'

const COLUMNS = ['Epic', 'Feature', 'Item', 'Estimate', 'Sprint', 'Blocked by']

const PROGRESS_NOTE =
  'No progress column yet: a percentage here is only ever counted from a linked Microtask task, and the bridge that links one is phase 4.'

/** Props for {@link PlanTable}. */
export interface PlanTableProps {
  /** The plan and the schedule derived from it, exactly as `GET /plans/{planId}` answered. */
  readonly plan: Plan
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
 * ### Six columns, and the seventh
 *
 * §5 names seven: "epic, feature, item, estimate, sprint, progress, blocked-by". Six are here.
 * **`progress` is absent rather than empty**, and that is a decision and not an omission: §7.2 fixes
 * what a progress number may be — "an item's percentage is the linked task's `{ done, total }`. An
 * unlinked item has a manual status only — not a manual percentage — so a number on screen is always
 * a counted number" — and nothing is linked in phase 2. `linkedTaskId` is reserved on every item and
 * is `null`, and §9 puts "derived progress" in phase 4 with the Microtask bridge. The three choices
 * were a column of 2,000 identical dashes, an invented number, or the honest one: leave it out and
 * **say so in the table itself**, which the `<caption>` below does — where an admin auditing the plan
 * reads it, and where it travels with the table rather than in a release note. It is not claimed as
 * the announcement a screen reader is guaranteed: a caption paired with an `aria-label` loses the name
 * computation, and some readers then skip it. The record for a reader of the code is this note. Phase
 * 4 adds the column and deletes the caption.
 *
 * `blocked-by` **is** here, because `dependsOn` is on the wire — but never as a bare list of names:
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
export function PlanTable({ plan }: PlanTableProps) {
  return (
    <table aria-label={`Table of ${plan.name}`} className={TABLE} data-slot="plan-table">
      <caption className={CAPTION}>{PROGRESS_NOTE}</caption>
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
          <PlanTableRow key={row.id} row={row} />
        ))}
      </tbody>
    </table>
  )
}
