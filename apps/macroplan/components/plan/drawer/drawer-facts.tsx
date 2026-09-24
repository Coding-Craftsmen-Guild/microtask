import type { TableRow } from '../table/rows'
import { LABEL } from './field'

const FACTS = 'grid gap-3 sm:grid-cols-3'

const VALUE = 'text-[13px]'

interface Fact {
  readonly label: string
  readonly value: string
}

const factsOf = (row: TableRow): readonly Fact[] => [
  { label: 'Epic', value: row.epic },
  ...(row.kind === 'item' ? [{ label: 'Feature', value: row.feature }] : []),
  { label: 'Estimate', value: row.estimate },
  { label: 'Sprint', value: row.sprint },
]

/** Props for {@link DrawerFacts}. */
export interface DrawerFactsProps {
  /** The one row this drawer is open on, every cell of it already worded (`../table/rows.ts`). */
  readonly row: TableRow
}

/**
 * Where one subject sits, as three or four label-and-value pairs the row already decided.
 *
 * The first thing out of `drawer-panel.tsx`, and it went first because it is the part of that panel
 * that words nothing and decides nothing: it lays out strings `tableRows` chose, so it could leave
 * without taking an argument with it. What stayed behind is the landmark, the heading and the close
 * link — the frame every control group is now drawn inside.
 *
 * **It words nothing, and that is the point.** Every value here is a string `rows.ts` decided, which
 * is where §3.2's estimate wording and the sprint label live. A panel that formatted `estimateDays`
 * itself would be a second opinion about the same field, and the two renderings of one plan would
 * disagree in the one place a reader compares them — `planned 40d · broken down to 5d · -35d` in the
 * table and `5d` here. `PlanTableRow` is this component's sibling in that respect: each is only cells
 * over one row's decided words.
 *
 * Which of the two kinds a row is is asked as `row.kind`, here and in every file of this drawer.
 * `TableRow` is not a discriminated union, so `row.item === null` and `row.item ?? row.feature` answer
 * the same question correctly and were each being used somewhere — three spellings of one test, one of
 * them reading a **name** to learn a **kind**. `kind` is the field that declares it.
 *
 * The estimate is therefore here **and** in the field beside it, and the two are not a duplicated
 * fact. This one is the schedule's reading — `effectiveEstimate` over a feature's items, worded as a
 * comparison when they disagree with what was authored — and the field holds the authored number the
 * API stores. On a feature with a breakdown they are visibly different, and each says the thing its
 * own half of the panel is for: what the plan makes of this work, and what someone claimed about it.
 *
 * The `<dl>` pairs each label with its value, which is what makes "Estimate: 5d" survive being read
 * aloud out of context. An item's panel names the feature it flows under and a feature's does not, the
 * heading having just said it. {@link LABEL} is one constant for these `<dt>`s, for the panel's kind
 * eyebrow and for every field caption, because they are one typographic thing — a small uppercase
 * label — and the same string under two names is a diff away from claiming they are two.
 *
 * **Dependencies are not drawn here**, and deliberately. The four things a stated dependency can turn
 * out to be each have a sentence, and those sentences live in `PlanTableRow`'s own `EDGE_SUFFIX`;
 * copying them here would be the second wording the paragraph above rules out, and moving them is the
 * business of the task that draws a dependency **editor**. `row.blockedBy` is on the prop and nothing
 * reads it, which is a fact a reader can check.
 */
export function DrawerFacts({ row }: DrawerFactsProps) {
  return (
    <dl className={FACTS}>
      {factsOf(row).map((fact) => (
        <div key={fact.label}>
          <dt className={LABEL}>{fact.label}</dt>
          <dd className={VALUE}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}
