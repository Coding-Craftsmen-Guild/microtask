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
}

/**
 * One row of the plan table: a feature, or one item flowing under one.
 *
 * ### What a screen reader announces, and why the row header moves
 *
 * The cell naming the row's **own subject** is a `<th scope="row">` — the feature's name on a feature
 * row, the item's name on an item row — so a reader moving across a row is told what the row is about
 * before each value, and the two kinds of row are distinguishable by structure rather than by
 * indentation, which is paint. The epic and the feature are then repeated on every row rather than
 * spanned with `rowspan`: a spanned cell is announced once and then silently inherited, so a reader
 * landing mid-table on "3d, S1" has no way to ask which feature it belongs to. Repetition is verbose
 * and unambiguous, and unambiguous is what an audit needs.
 *
 * A feature row's item cell is **empty** rather than a dash. The row is about a feature; a dash is a
 * glyph a reader has to interpret, and `data-kind` already says what the row is for a test.
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
export function PlanTableRow({ row }: PlanTableRowProps) {
  return (
    <tr
      data-kind={row.kind}
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
      <td className={CELL}>{row.estimate}</td>
      <td className={CELL}>{row.sprint}</td>
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
