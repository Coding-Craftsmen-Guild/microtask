import { progressWords, type Counted } from '../bridge/progress-words'
import type { BlockedBy, EdgeState, TableRow } from './rows'

const CELL = 'border-t border-border px-3 py-2 align-top'

const NAME_CELL = 'border-t border-border px-3 py-2 text-left align-top font-semibold'

const EDGES = 'grid list-none gap-0.5 p-0'

const EDGE_SUFFIX: Readonly<Record<EdgeState, string>> = {
  honoured: '',
  'set-aside': ' · set aside to keep rail order',
  unknown: ' · names nothing in this plan',
  unplaced: ' · not placed, so it gave this no date',
}

const edgeText = (edge: BlockedBy): string => `${edge.name}${EDGE_SUFFIX[edge.state]}`

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
 * A feature row's item cell is **empty** rather than a dash. The row is about a feature; a dash is a
 * glyph a reader has to interpret, and `data-kind` already says what the row is for a test.
 *
 * ### The group cell, and the attribute beside it
 *
 * The cell names the group in **words**, and `data-label-id` on the row carries the same fact as an id.
 * Two spellings of one thing because they are read by different things and only one of them is paint:
 * the chips beside the plan’s name dim every row not in the chosen group by a generated rule matching
 * that attribute (`../labels/group-css.ts`), and a reader who cannot see dimming has the words. An item
 * row carries its **feature's** group, for the reason the epic and feature cells are repeated on every
 * row: a spanned or blank cell is announced once and then silently inherited, so a reader landing
 * mid-table could not ask which phase a line belongs to.
 *
 * The attribute is `undefined` and not `null` for a feature in no group, so the attribute is **absent**
 * rather than empty — `[data-label-id]` is what the generated rule selects on, so a row with an empty
 * one would be dimmed by every group instead of by none.
 *
 * ### `blockedBy`
 *
 * Every dependency the feature states is listed, and each one says in **words** what became of it —
 * `set aside to keep rail order` for an edge `ignoredEdges` names, and its own sentence for an edge
 * that pointed at nothing or at something unplaced. `data-edge` carries the same fact for a test, for
 * the reason `PreviewRow` carries `data-outcome`: an honoured edge and a dropped one render the same
 * name, and neither the paint nor a colour may be the only thing telling them apart. A feature that
 * states no dependency gets an empty cell, because it is blocked by nothing.
 */
export function PlanTableRow({ row, progress }: PlanTableRowProps) {
  return (
    <tr
      data-kind={row.kind}
      data-label-id={row.labelId ?? undefined}
      data-slot="plan-table-row"
      data-testid={`row-${row.id}`}
      data-treatment={row.treatment}
    >
      <td className={CELL}>{row.epic}</td>
      {row.kind === 'feature' ? (
        <th className={NAME_CELL} scope="row">
          {row.feature}
        </th>
      ) : (
        <td className={CELL}>{row.feature}</td>
      )}
      {row.item === null ? (
        <td className={CELL} />
      ) : (
        <th className={NAME_CELL} scope="row">
          {row.item}
        </th>
      )}
      <td className={CELL} data-slot="group">
        {row.group}
      </td>
      <td className={CELL}>{row.estimate}</td>
      <td className={CELL}>{row.sprint}</td>
      <td className={CELL} data-slot="progress">
        {progress === null ? null : progressWords(progress)}
      </td>
      <td className={CELL}>
        {row.blockedBy.length === 0 ? null : (
          <ul className={EDGES}>
            {row.blockedBy.map((edge) => (
              <li data-edge={edge.state} data-slot="blocked-by" key={edge.id}>
                {edgeText(edge)}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  )
}
