import { ResultRow } from './result-row'
import type { TransferProjectResult } from './vocabulary'

const TABLE = 'w-full border-collapse text-left text-[13px]'
const HEAD = 'px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'
const COLUMNS = ['Project', 'Choice', 'Tasks', 'Share links', 'Outcome']

/** Props for {@link ResultTable}. */
export interface ResultTableProps {
  /** One row per project the confirm handled. */
  results: readonly TransferProjectResult[]
}

/**
 * What a confirm did, project by project.
 *
 * Cross-project atomicity is not claimed and does not have to be: a failure on the seventh
 * project is not grounds for discarding the six that landed, so every project gets a row saying
 * which of the five things happened to it and an admin acts on the rows that did not land.
 */
export function ResultTable({ results }: ResultTableProps) {
  return (
    <table className={TABLE} data-slot="result-table">
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
        {results.map((result) => (
          <ResultRow key={result.path} result={result} />
        ))}
      </tbody>
    </table>
  )
}
