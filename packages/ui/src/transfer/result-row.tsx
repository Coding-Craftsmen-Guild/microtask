import { CHOICE_LABEL, RESULT_LABEL, RESULT_TONE } from './outcomes'
import type { TransferProjectResult } from './vocabulary'

const CELL = 'border-t border-border px-3 py-2 align-top'
const PATH = 'font-mono text-[12px] break-all'
const WRITTEN = 'text-muted-foreground'
const REASONS = 'mt-1.5 grid list-disc gap-0.5 pl-4 text-[12px] text-muted-foreground'

/** Props for {@link ResultRow}. */
export interface ResultRowProps {
  /** What the confirm did with one project. */
  result: TransferProjectResult
}

/**
 * One confirmed project's row, carrying the four counts §7.4 requires an admin be able to check.
 *
 * `writtenProjectId` is shown beside the path rather than instead of it, because an
 * `import as new` is exactly the case where the id the admin chose against is not the id on disk
 * afterwards, and a row carrying only one of the two leaves them unable to find what they just
 * imported.
 */
export function ResultRow({ result }: ResultRowProps) {
  return (
    <tr data-outcome={result.outcome} data-slot="result-row">
      <td className={CELL}>
        <div className={PATH}>{result.path}</div>
        {result.writtenProjectId === null ? null : (
          <div className={WRITTEN}>written as {result.writtenProjectId}</div>
        )}
      </td>
      <td className={CELL}>{result.choice === null ? 'No choice needed' : CHOICE_LABEL[result.choice]}</td>
      <td className={CELL}>
        {String(result.tasksWritten)} written · {String(result.tasksRemoved)} removed
      </td>
      <td className={CELL}>
        {String(result.shareLinksReminted)} reminted · {String(result.shareLinksStranded)} stranded
      </td>
      <td className={CELL}>
        <span className={RESULT_TONE[result.outcome]} data-slot="outcome">
          {RESULT_LABEL[result.outcome]}
        </span>
        {result.reasons.length > 0 ? (
          <ul className={REASONS} data-slot="reasons">
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  )
}
