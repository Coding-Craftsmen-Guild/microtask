import Link from 'next/link'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { CreateControls } from './create-controls'
import { DrawerEdits } from './drawer-edits'
import { DrawerFacts } from './drawer-facts'
import { DrawerHeading, TITLE_ID } from './drawer-heading'
import { DrawerManage } from './drawer-manage'
import type { DrawerValues } from './values'

const PANEL = 'grid gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10'

const CLOSE = 'text-[13px] text-brand'

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

  /**
   * The same subject's values, from the same lookup of the same plan (`./subject.ts`).
   *
   * Every value the three bands below need arrives in this one prop, which is what keeps the panel's
   * own props stable as each of them grows: `sizedByItems` goes to the facts, the name and the
   * estimate to the `write` fields, the pin and the `plan` group — its calendar and its features — to
   * the `manage` band, and this file reads exactly one member itself: `values.sizedByItems`.
   */
  readonly values: DrawerValues

  /** The item's stored description, or `null` on a feature and on an item whose file went unread. */
  readonly description: string | null

  /** Which fields this surface draws — content answers only; a drawer asks nothing about seats. */
  readonly controls: PlanContentControls

  /** Every write of plan content, handed in by the page that read the credential. */
  readonly actions: PlanEditActions

  /**
   * Where Close goes: the plan's own path, which is this same address with nothing selected.
   *
   * It is also where a **delete** lands, and that is why it is threaded down to the `manage` band
   * rather than read off `planId` there: this prop comes from the page that knows which surface it is
   * rendering, and a seat holder sent to `/plans/<planId>` would meet a cookie surface and a login with
   * no password behind it (`./delete-control.tsx`, ADR 0032).
   */
  readonly closeHref: string
}

/**
 * One feature or one item, drawn beside the plan it belongs to — read on the left, edited on the right.
 *
 * ### The frame, and the four things drawn inside it
 *
 * What is left here is the landmark, the close link and the arrangement. The heading and its kind
 * eyebrow are `./drawer-heading.tsx`, the facts `<dl>` is `./drawer-facts.tsx`, and the controls are
 * three groups beside them: `./drawer-edits.tsx` holds the `write`-tier fields about the subject,
 * `./drawer-manage.tsx` the `manage`-tier ones, and `./create-controls.tsx` the one group that is about
 * a **parent** instead. The facts went first, when the fields arrived, because they word nothing and
 * decide nothing and so left without taking an argument with them.
 *
 * The two control bands are **siblings** here rather than one nested in the other, and that is the
 * capability line drawn as file layout: every control in the second band is granted to `manage` alone
 * and every field in the first to `write`, so a seat holding `write` and not `manage` is shown exactly
 * one of them (`packages/kernel/src/access/policy.ts`, and `./drawer-manage.tsx` argues it). Each
 * draws its own `EDITS` band with its own `empty:hidden`, so a tier a surface may write nothing in is
 * a tier it is shown no bordered box for — and a read-only seat is shown neither. They take the same
 * props out of this one set — `planId`, `row`, `values`, `controls`, `actions`, `description` for the
 * band that holds the one control an item's text is edited by, and `closeHref` for the band that holds
 * the one control that leaves the page — which is what keeps this file's own props stable as either
 * grows.
 *
 * The create group is the **third** sibling and the exception to that split, because it is the one group
 * whose subject is not the panel's: it is `write`-tier work that does not belong in the `write`-tier band
 * about this subject. It is also the one group this file picks props for rather than handing its own set
 * down — two actions, two booleans and the two parents out of `values.place` — since a client component
 * may be handed primitives, an unbound function or `null` and nothing else
 * (`../module-boundaries.test.tsx`), and `./create-controls.tsx` is one.
 *
 * The read half is two elements rather than one: the facts `<dl>` and, under it,
 * `./breakdown-line.tsx`'s one sentence about which of a feature's two estimates the timeline used.
 * Both are `./drawer-facts.tsx`'s, which is why this file hands it that one boolean and not the line.
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
 * ### A landmark, a named heading and no dialog
 *
 * It is an `<aside>` named by its own heading — `aria-labelledby` naming the `TITLE_ID` that
 * `./drawer-heading.tsx` puts on the `<h2>` — so a reader can jump to it and hear what is open. The two
 * halves of that name are in two files and the exported constant is what keeps them one string. It
 * claims no `role="dialog"` and traps no focus: this is a **route**, not an overlay. The thing that
 * closes it is a `Link` back to the plan's path and never a button, so Back, a bookmark and Close all
 * mean the same thing, and no JavaScript is needed for any of them.
 *
 * ### This file, if it grows, and where it splits
 *
 * It is the frame now, so a control group is a file beside `./drawer-edits.tsx` rather than a block in
 * here. The pin, the dependency editor and the delete have arrived and are `./drawer-manage.tsx`'s; the
 * two place actions are `manage`-tier as well and land in that same band, so this file gains no further
 * mount for them.
 *
 * **Create is the exception this file mounts itself**, and it has arrived. `createFeature` needs a rail
 * and `createItem` a parent feature, so neither is a write about the subject `./drawer-edits.tsx` is
 * handed — a group scoped to *this* item cannot mount "add an item" without inventing which feature it
 * means. So `./create-controls.tsx` is a **sibling** of the two bands here, taking the subject's place in
 * the plan rather than the subject, and that is the one control group the frame gains rather than passes
 * down.
 *
 * The heading was what this file said would move first, and the create mount is what moved it: prose is
 * free under `max-lines` (`skipComments`), so a paragraph carried out of here buys **nothing** — what
 * this file had left to give was the one part of it that read the row and chose words, which is exactly
 * what `./drawer-heading.tsx` is. Nothing of the frame went with it. What must **not** split is this file
 * by row kind: a feature panel and an item panel answer the same questions about different subjects, and
 * `rows.ts` refuses the same split for the same reason.
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
      <DrawerHeading row={row} />
      <DrawerFacts row={row} sizedByItems={values.sizedByItems} />
      <DrawerEdits
        actions={actions}
        controls={controls}
        description={description}
        planId={planId}
        row={row}
        values={values}
      />
      <DrawerManage
        actions={actions}
        closeHref={closeHref}
        controls={controls}
        planId={planId}
        row={row}
        values={values}
      />
      <CreateControls
        createFeature={actions.createFeature}
        createItem={actions.createItem}
        featureId={values.place.featureId}
        newFeature={controls.createFeature}
        newItem={controls.createItem}
        planId={planId}
        railId={values.place.railId}
      />
      <Link className={CLOSE} href={closeHref}>
        Close
      </Link>
    </aside>
  )
}
