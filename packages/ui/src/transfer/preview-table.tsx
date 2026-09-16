import { PreviewRow } from './preview-row'
import type { TransferGroup } from './vocabulary'

const TABLE = 'w-full border-collapse text-left text-[13px]'
const HEAD = 'px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const COLUMNS = ['Dropped at', 'Shape', 'Tasks', 'Share links', 'Outcome']

/** Props for {@link PreviewTable}. */
export interface PreviewTableProps {
  /** One row per dropped directory group, in the order the preview listed them. */
  groups: readonly TransferGroup[]
}

/**
 * The §7.3 preview: every dropped group named, whatever became of it.
 *
 * Every group gets a row, including the ones that will not import. That is the whole point of
 * ADR 0018 — the bug it was written about was a drop that silently discarded task files behind a
 * preview that truthfully reported the projects it did keep — so nothing is filtered out here.
 */
export function PreviewTable({ groups }: PreviewTableProps) {
  return (
    <table aria-label="Import preview" className={TABLE} data-slot="preview-table">
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th className={HEAD} key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <PreviewRow group={group} key={group.path} />
        ))}
      </tbody>
    </table>
  )
}
