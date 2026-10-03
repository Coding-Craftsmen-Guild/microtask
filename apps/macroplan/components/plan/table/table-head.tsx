import type { PlanColumn } from './columns'
import { TABLE } from './table-css'
import type { Sorted } from './table-order'

/** Props for {@link TableHead}. */
export interface TableHeadProps {
  /** The columns this surface draws, which is `columnsFor(mayEdit)`. */
  readonly columns: readonly PlanColumn[]

  /** The sort, which its own header states as `aria-sort` — the attribute `./table-css.ts` draws the arrow from. */
  readonly sorted?: Sorted | null
}

const ariaSortOf = (sorted: Sorted | null, key: string): 'ascending' | 'descending' | undefined => {
  if (sorted === null || sorted.column !== key) return undefined
  return sorted.direction === 'asc' ? 'ascending' : 'descending'
}

/**
 * The header row: a button where the column can be ordered, and plain words where it cannot.
 *
 * ### Why six of nine are buttons and three are not
 *
 * `./columns.ts` carries the rule: a column is sortable when it has **one value per feature**, and `Item`
 * and `Progress` are per-item — a block of rows has several of each, so ordering blocks by one of them
 * would be a number nobody can point at. Rendering those two as plain text is how a reader is told,
 * rather than finding out by clicking a button that does nothing. `Actions` is three links.
 *
 * The arrow is an empty span and the glyph is `content` generated from `aria-sort` (`./table-css.ts`), so
 * which column is sorted is stated **once**, in the attribute a screen reader reads, and no second copy
 * in the markup can disagree with it.
 *
 * Every cell carries `data-col`, which is what the visibility rule hides and what the reordering moves —
 * so the header and two thousand bodies are addressed by one key rather than by a column index that
 * reordering would invalidate.
 */
export function TableHead({ columns, sorted = null }: TableHeadProps) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th aria-sort={ariaSortOf(sorted, column.key)} className={TABLE.head} data-col={column.key} key={column.key} scope="col">
            {column.sortable ? (
              <button className={TABLE.sortButton} data-sort-col={column.key} type="button">
                {column.head}
                <span aria-hidden="true" className={TABLE.arrow} data-slot="sort-arrow" />
              </button>
            ) : (
              column.head
            )}
          </th>
        ))}
      </tr>
    </thead>
  )
}
