import { colId, type PlanColumn } from './columns'
import { TABLE, TABLE_WORDS } from './table-css'

/** One option of a filter: the id it matches rows on, and what it is called. */
export interface FilterOption {
  readonly id: string

  readonly name: string
}

/** Props for {@link TableFilter}. */
export interface FilterProps {
  /** Which filter this is — `rail` or `group` — which is how the root tells them apart. */
  readonly which: string
  readonly label: string
  readonly options: readonly FilterOption[]
  /** One option that is not a thing in the plan, which is how "in no group" is offered. */
  readonly extra?: FilterOption
}

/**
 * One filter: an "every one of them" option, then one option per thing in the plan.
 *
 * The empty value means **no filter** rather than a value nothing matches, so the first option both names
 * the column and is the way back out of it — a reader who has narrowed to one rail does not have to find a
 * separate reset.
 *
 * It carries `data-filter` rather than a `name`, because nothing here is submitted: `./table-root.tsx`
 * reads which filter changed off that attribute, and the select keeps its own value the way every control
 * in this strip does.
 */
export function TableFilter({ which, label, options, extra }: FilterProps) {
  return (
    <select aria-label={label} className={TABLE.select} data-filter={which} data-slot="table-filter">
      <option value="">{label}</option>
      {extra === undefined ? null : <option value={extra.id}>{extra.name}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}

/**
 * One row of the column menu: a checkbox that hides the column, and two buttons that move it.
 *
 * The checkbox is the whole of hiding — `./table-css.ts` keys a `:has()` rule on its `id`, so it needs no
 * JavaScript and survives every re-render. The buttons are the one thing CSS cannot do, and they are
 * buttons rather than a draggable header because a keyboard can press them.
 */
export function ColumnRow({ column }: { readonly column: PlanColumn }) {
  const move = (by: '-1' | '1', word: string, glyph: number) => (
    <button
      aria-label={`Move ${column.head} ${word}`}
      className={TABLE.menuMove}
      data-col-key={column.key}
      data-move={by}
      type="button"
    >
      {String.fromCharCode(glyph)}
    </button>
  )
  return (
    <div className={TABLE.menuRow} data-slot="column-row">
      <input defaultChecked id={colId(column.key)} type="checkbox" />
      <label className={TABLE.menuName} htmlFor={colId(column.key)}>
        {column.head}
      </label>
      {move('-1', TABLE_WORDS.left, 0x25c0)}
      {move('1', TABLE_WORDS.right, 0x25b6)}
    </div>
  )
}
