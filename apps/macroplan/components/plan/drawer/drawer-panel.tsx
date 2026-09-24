import Link from 'next/link'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DrawerEdits } from './drawer-edits'
import { DrawerFacts } from './drawer-facts'
import { LABEL } from './field'
import type { DrawerValues } from './values'

const PANEL = 'grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10'

const TITLE = 'text-base font-semibold'

const CLOSE = 'text-[13px] text-brand'

const TITLE_ID = 'plan-drawer-title'

const KINDS: Readonly<Record<TableRow['kind'], string>> = { feature: 'Feature', item: 'Item' }

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

  /** The same subject's editable values, from the same lookup of the same plan (`./subject.ts`). */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which fields this surface draws — content answers only; a drawer asks nothing about seats. */
  readonly controls: PlanContentControls

  /** Every write of plan content, handed in by the page that read the credential. */
  readonly actions: PlanEditActions

  /** Where Close goes: the plan's own path, which is this same address with nothing selected. */
  readonly closeHref: string
}

/**
 * One feature or one item, drawn beside the plan it belongs to — read on the left, edited on the right.
 *
 * ### The frame, and the two things drawn inside it
 *
 * What is left here is the landmark, the heading, the kind eyebrow and the close link. The facts `<dl>`
 * is `./drawer-facts.tsx` and the fields are `./drawer-edits.tsx`, both extracted when the fields
 * arrived and in that order: the facts word nothing and decide nothing, so they left without taking an
 * argument with them, and the fields are where every remaining control group will land.
 *
 * `treatment` rides along as `data-treatment` for the reason that row carries it too: two subjects may
 * legitimately render the same words, and neither the paint nor a colour may be the only thing telling
 * them apart.
 *
 * ### Two shapes of the same subject, neither derived from the other
 *
 * `row` is worded **for display** and `values` are raw, and both are real needs: a `<dd>` wants
 * `planned 40d · broken down to 5d · -35d`, and a field wants `40`. They are not two sources of truth
 * for one fact — `./subject.ts` resolves both in one lookup of one plan, so they cannot name two
 * records, and the panel neither formats a value nor parses a sentence. `./drawer-facts.tsx` argues why
 * an estimate legitimately appears in both halves: one is the schedule's reading of this work, the
 * other is the number someone authored.
 *
 * ### A landmark, a heading and no dialog
 *
 * It is an `<aside>` named by its own heading, so a reader can jump to it and hear what is open, and an
 * `<h2>` because the `<h1>` one level up is the plan's name — the layout renders both, so the two
 * cannot be out of order. It claims no `role="dialog"` and traps no focus: this is a **route**, not an
 * overlay. The thing that closes it is a `Link` back to the plan's path and never a button, so Back, a
 * bookmark and Close all mean the same thing, and no JavaScript is needed for any of them. The heading
 * keeps naming the subject even where the name field is drawn under it: the heading is what this
 * landmark **is**, and a field's value is not an accessible name.
 *
 * ### This file, if it grows, and where it splits
 *
 * It is the frame now, so the next control group is a file beside `./drawer-edits.tsx` rather than a
 * block in here — the pin, the dependency editor, delete, and the two place actions, each on its own
 * boolean, which is the list that file keeps, and each mounted as a child of that one.
 *
 * **Create is the exception this file mounts itself.** `createFeature` needs a rail and `createItem` a
 * parent feature, so neither is a write about the subject `./drawer-edits.tsx` is handed — a group
 * scoped to *this* item cannot mount "add an item" without inventing which feature it means. So a
 * create group is a **sibling** of the edits band here, taking the row for its context rather than as
 * its subject, and that is the one control group the frame gains rather than passes down.
 *
 * Two things here would move before anything else did: the
 * kind eyebrow and the heading, as one `./drawer-heading.tsx` taking the row, if a subtitle or a badge
 * ever joins them; and `KINDS`, which goes with them, being the only wording this file still owns. What
 * must **not** split is this file by row kind: a feature panel and an item panel answer the same
 * questions about different subjects, and `rows.ts` refuses the same split for the same reason.
 */
export function DrawerPanel({
  planId,
  row,
  values,
  description,
  controls,
  actions,
  closeHref,
}: DrawerPanelProps) {
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
      <DrawerFacts row={row} />
      <DrawerEdits
        actions={actions}
        controls={controls}
        description={description}
        planId={planId}
        row={row}
        values={values}
      />
      <Link className={CLOSE} href={closeHref}>
        Close
      </Link>
    </aside>
  )
}
