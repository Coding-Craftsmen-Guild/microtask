import { progressWords, type Counted } from '../bridge/progress-words'
import { TABLE } from './table-css'
import { RowActions } from './row-actions'
import { BlockedCell, CELL, NameCell, sortAttributes } from './row-cells'
import type { TableRow } from './rows'
import type { TableWrites } from './plan-table'

/** Props for {@link PlanTableRow}. */
export interface PlanTableRowProps {
  /** The row, with every cell's words already decided by `tableRows`. */
  readonly row: TableRow

  /**
   * What this row's linked task counts, or `null` when there is no counted number for it.
   *
   * `null` covers every reason at once, and on purpose: the item is linked to nothing, its rail is bound
   * to nothing, its rail's token no longer resolves, the bridge read did not land, or this is a feature
   * row, which never has a number of its own. Design §7.2 makes all of those one outcome — "an unlinked
   * item has a manual status only — not a manual percentage — so a number on screen is always a counted
   * number" — so the cell is **empty** rather than a dash or a zero. A dash would say "nothing done" and
   * a zero would say it more strongly; both are numbers nobody counted.
   */
  readonly progress: Counted | null

  /** Where this row's own entity opens, which is every action's destination. */
  readonly href: string

  /** Whether the actions column exists on this surface at all. */
  readonly mayEdit: boolean

  readonly writes: TableWrites
}

/**
 * One row of the plan table: a feature, or one item flowing under one.
 *
 * ### What a screen reader announces, and why the row header moves
 *
 * The cell naming the row's **own subject** is a `<th scope="row">` — the feature's name on a feature
 * row, the item's name on an item row — so every value in the row is associated with what the row is
 * about as well as with its column, and the two kinds of row are distinguishable by structure rather
 * than by indentation, which is paint. The header is in column two or column three depending on which
 * kind of row it is, so on an item row the epic and feature cells are read before it; `scope="row"`
 * governs association and not order, and the repetition below is what makes that harmless. The epic
 * and the feature are repeated on every row rather than spanned with `rowspan`: a spanned cell is
 * announced once and then silently inherited, so a reader landing mid-table on "3d, S1" has no way to
 * ask which feature it belongs to. Repetition is verbose and unambiguous, and unambiguous is what an
 * audit needs.
 *
 * `./row-cells.tsx` is where that lives, so this component is the row's own attributes and the order of
 * its cells — which is all a row is once the cells know how to draw themselves.
 *
 * ### `data-col` on every cell
 *
 * One key per column, on the header cell and on every body cell alike. It is what the visibility rule
 * hides and what the reordering moves, and it is a key rather than a position precisely because
 * reordering exists: an index would be invalidated by the first move.
 *
 * ### What the row carries for the toolbar
 *
 * `data-block` is the feature this row belongs to — its own, on a feature row — and it is the unit a
 * filter keeps and a sort moves, so an item is never separated from the feature it flows under.
 * `data-search` is everything the row can be found by, pre-lowered by the server. `data-rail` is the
 * rail filter's key, an **id** rather than the name in the cell beside it, for the reason
 * `data-label-id` is an id: two rails may legitimately share a name, and a filter on the name would
 * sometimes show two rails and never say which.
 *
 * The six `data-sort-*` are on a **feature** row only, because a block is ordered by the feature that
 * heads it. They are the numbers `rows.ts` worded the cells from rather than the words themselves: the
 * sort would otherwise have to parse `planned 5d · broken down to 6d · +1d` back into a number it
 * already had.
 *
 * ### The group cell, and the attribute beside it
 *
 * The cell names the group in **words**, and `data-label-id` on the row carries the same fact as an id.
 * Two spellings of one thing because they are read by different things and only one of them is paint:
 * the chips beside the plan's name dim every row not in the chosen group by a generated rule matching
 * that attribute (`../labels/group-css.ts`), and a reader who cannot see dimming has the words. An item
 * row carries its **feature's** group, for the reason the epic and feature cells are repeated on every
 * row: a spanned or blank cell is announced once and then silently inherited, so a reader landing
 * mid-table could not ask which phase a line belongs to.
 *
 * The attribute is `undefined` and not `null` for a feature in no group, so the attribute is **absent**
 * rather than empty — `[data-label-id]` is what the generated rule selects on, so a row with an empty
 * one would be dimmed by every group instead of by none.
 *
 * ### The actions cell
 *
 * Present only where this surface draws one at all, and an **add** only on a feature row: an item holds
 * nothing, so there would be nothing for that link to land on. `./row-actions.tsx` carries why all three
 * are links into a drawer rather than controls of their own.
 */
export function PlanTableRow({ row, progress, href, mayEdit, writes }: PlanTableRowProps) {
  return (
    <tr
      className={row.kind === 'feature' ? TABLE.block : TABLE.row}
      data-block={row.block}
      data-kind={row.kind}
      data-label-id={row.labelId ?? undefined}
      data-rail={row.railId}
      data-search={row.search}
      data-slot="plan-table-row"
      data-testid={`row-${row.id}`}
      data-treatment={row.treatment}
      {...sortAttributes(row)}
    >
      <td className={CELL} data-col="epic">
        {row.epic}
      </td>
      <NameCell column="feature" mine={row.kind === 'feature'} name={row.feature} />
      <NameCell column="item" mine name={row.item} />
      <td className={CELL} data-col="group" data-slot="group">
        {row.group}
      </td>
      <td className={CELL} data-col="estimate">
        {row.estimate}
      </td>
      <td className={CELL} data-col="sprint">
        {row.sprint}
      </td>
      <td className={CELL} data-col="progress" data-slot="progress">
        {progress === null ? null : progressWords(progress)}
      </td>
      <BlockedCell edges={row.blockedBy} />
      {mayEdit ? (
        <td className={CELL} data-col="actions">
          <RowActions href={href} mayAdd={writes.add && row.kind === 'feature'} mayRemove={writes.remove} />
        </td>
      ) : null}
    </tr>
  )
}
