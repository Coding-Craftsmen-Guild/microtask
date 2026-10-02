import type { BlockedBy, EdgeState, TableRow } from './rows'

/**
 * The shared cell padding, so a body cell and a row header line up.
 *
 * It carried the row's rule as a `border-t` of its own, which is what a table does when nothing above
 * it owns a row. The `<tr>` owns one now (`./table-css.ts`'s `row`), so a hover tints a whole row
 * rather than nine boxes with rules between them, and the rule is drawn once instead of nine times.
 */
export const CELL = 'px-3 py-1.5 align-top'

const NAME_CELL = 'px-3 py-1.5 text-left align-top font-semibold'

const EDGES = 'grid list-none gap-0.5 p-0'

const EDGE_SUFFIX: Readonly<Record<EdgeState, string>> = {
  honoured: '',
  'set-aside': ' · set aside to keep rail order',
  unknown: ' · names nothing in this plan',
  unplaced: ' · not placed, so it gave this no date',
}

const edgeText = (edge: BlockedBy): string => `${edge.name}${EDGE_SUFFIX[edge.state]}`

/**
 * The six `data-sort-*` a **feature** row carries, and nothing on an item's.
 *
 * A block is ordered by the feature that heads it, so an item row has nothing to contribute and carries
 * no key at all rather than a copy of its feature's. The numbers are the ones `row-keys.ts` read off the
 * schedule, not the words in the cells beside them: a sort would otherwise have to parse
 * `planned 5d · broken down to 6d · +1d` back into a number that was already in hand.
 */
export const sortAttributes = (row: TableRow): Readonly<Record<string, string>> =>
  row.sort === null
    ? {}
    : {
        'data-sort-epic': row.sort.epic,
        'data-sort-feature': row.sort.feature,
        'data-sort-group': row.sort.group,
        'data-sort-estimate': String(row.sort.estimate),
        'data-sort-sprint': String(row.sort.sprint),
        'data-sort-blocked': String(row.sort.blocked),
      }

/** Props for {@link NameCell}. */
export interface NameCellProps {
  /** Which column this is, which lands as `data-col` and is what hides and moves it. */
  readonly column: string

  /** The words, or `null` for a cell that is about nothing — a feature row's item cell. */
  readonly name: string | null

  /** Whether this cell names the row's own subject, and so is the row's header. */
  readonly mine: boolean
}

/**
 * One naming cell: a `<th scope="row">` where it names the row's own subject, and a `<td>` otherwise.
 *
 * That is what makes a feature row and an item row distinguishable by **structure** rather than by
 * indentation, which is paint: every value in a row is associated with what the row is about as well as
 * with its column. `table-row.tsx` carries why the header moves between column two and column three and
 * why that is harmless.
 *
 * `null` draws an empty cell rather than a dash. The row is about a feature; a dash is a glyph a reader
 * has to interpret, and `data-kind` already says what the row is for a test.
 */
export function NameCell({ column, name, mine }: NameCellProps) {
  if (name === null) return <td className={CELL} data-col={column} />
  if (!mine) {
    return (
      <td className={CELL} data-col={column}>
        {name}
      </td>
    )
  }
  return (
    <th className={NAME_CELL} data-col={column} scope="row">
      {name}
    </th>
  )
}

/**
 * The blocked-by cell: every dependency the feature states, each saying what became of it.
 *
 * `set aside to keep rail order` for an edge `ignoredEdges` names, and its own sentence for an edge that
 * pointed at nothing or at something unplaced. `data-edge` carries the same fact for a test, for the
 * reason `PreviewRow` carries `data-outcome`: an honoured edge and a dropped one render the same name,
 * and neither the paint nor a colour may be the only thing telling them apart.
 *
 * A feature that states no dependency gets an empty cell, because it is blocked by nothing.
 */
export function BlockedCell({ edges }: { readonly edges: readonly BlockedBy[] }) {
  return (
    <td className={CELL} data-col="blocked">
      {edges.length === 0 ? null : (
        <ul className={EDGES}>
          {edges.map((edge) => (
            <li data-edge={edge.state} data-slot="blocked-by" key={edge.id}>
              {edgeText(edge)}
            </li>
          ))}
        </ul>
      )}
    </td>
  )
}
