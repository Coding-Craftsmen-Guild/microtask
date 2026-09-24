import Link from 'next/link'
import type { TableRow } from '../table/rows'

const PANEL = 'grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10'

const TITLE = 'text-base font-semibold'

const FACTS = 'grid gap-3 sm:grid-cols-3'

const LABEL = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

const VALUE = 'text-[13px]'

const CLOSE = 'text-[13px] text-brand'

const TITLE_ID = 'plan-drawer-title'

const KINDS: Readonly<Record<TableRow['kind'], string>> = { feature: 'Feature', item: 'Item' }

interface Fact {
  readonly label: string
  readonly value: string
}

const factsOf = (row: TableRow): readonly Fact[] => [
  { label: 'Epic', value: row.epic },
  ...(row.item === null ? [] : [{ label: 'Feature', value: row.feature }]),
  { label: 'Estimate', value: row.estimate },
  { label: 'Sprint', value: row.sprint },
]

/** Props for {@link DrawerPanel}. */
export interface DrawerPanelProps {
  /**
   * The one subject this drawer is open on, as `tableRows` already worded it.
   *
   * A {@link TableRow} and **not** the plan, the feature record or the item record: the page that
   * resolved the URL hands over one row, so nothing under here can reach a second subject, and a
   * share token is doubly unrepresentable — the row holds six strings and the plan it came from was
   * a `PlanScreenModel` before that (ADR 0033).
   */
  readonly row: TableRow

  /** Where Close goes: the plan's own path, which is this same address with nothing selected. */
  readonly closeHref: string
}

/**
 * One feature or one item, drawn beside the plan it belongs to.
 *
 * ### It words nothing, and that is the point
 *
 * Every value here is a string `tableRows` decided (`../table/rows.ts`), which is where §3.2's
 * estimate wording and the sprint label live. A panel that formatted `estimateDays` itself would be
 * a second opinion about the same field, and the two renderings of one plan would disagree in the
 * one place a reader compares them — `planned 5d · broken down to 4d · -1d` in the table and `5d`
 * here. `PlanTableRow` is this component's sibling in that respect: both are "only cells" over one
 * row's decided words.
 *
 * `treatment` rides along as `data-treatment` for the reason that row carries it too: two subjects
 * may legitimately render the same words, and neither the paint nor a colour may be the only thing
 * telling them apart.
 *
 * **Dependencies are not drawn here yet**, and deliberately. The four things a stated dependency can
 * turn out to be each have a sentence, and those sentences live in `PlanTableRow`'s own
 * `EDGE_SUFFIX`; copying them into this file would be the second wording the paragraph above rules
 * out, and moving them is the business of the task that draws a dependency **editor** rather than
 * this one. `row.blockedBy` is on the prop and nothing reads it, which is a fact a reader can check.
 *
 * ### A landmark, a heading and no dialog
 *
 * It is a `<aside>` named by its own heading, so a reader can jump to it and hear what is open, and
 * an `<h2>` because the `<h1>` one level up is the plan's name — the layout renders both, so the two
 * cannot be out of order. It claims no `role="dialog"` and traps no focus: this is a **route**, not
 * an overlay. The thing that closes it is a `Link` back to the plan's path and never a button, so
 * Back, a bookmark and Close all mean the same thing, and no JavaScript is needed for any of them.
 *
 * The `<dl>` pairs each label with its value, which is what makes "Estimate: 5d" survive being read
 * aloud out of context; an item's panel names the feature it flows under and a feature's does not,
 * the heading having just said it. `LABEL` is one constant for the kind eyebrow and for every `<dt>`,
 * because they are one typographic thing — a small uppercase label — and the same string under two
 * names is a diff away from claiming they are two. A control group that needs a label unlike this one
 * gets its own name then, not in advance.
 */
export function DrawerPanel({ row, closeHref }: DrawerPanelProps) {
  return (
    <aside
      aria-labelledby={TITLE_ID}
      className={PANEL}
      data-kind={row.kind}
      data-slot="drawer-panel"
      data-treatment={row.treatment}
    >
      <p className={LABEL}>{KINDS[row.kind]}</p>
      <h2 className={TITLE} id={TITLE_ID}>
        {row.item ?? row.feature}
      </h2>
      <dl className={FACTS}>
        {factsOf(row).map((fact) => (
          <div key={fact.label}>
            <dt className={LABEL}>{fact.label}</dt>
            <dd className={VALUE}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <Link className={CLOSE} href={closeHref}>
        Close
      </Link>
    </aside>
  )
}
