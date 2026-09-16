import type { FileFailure } from './stage-drop'

const SECTION = 'grid gap-2 rounded-md bg-destructive/10 px-3 py-2 ring-1 ring-destructive/50'
const HEADING = 'text-[13px] font-semibold text-destructive'
const LIST = 'grid gap-1 text-[13px]'
const PATH = 'font-mono text-[12px]'

const headline = (count: number): string =>
  count === 1 ? '1 file was not staged' : `${String(count)} files were not staged`

/** Props for {@link UploadFailures}. */
export interface UploadFailuresProps {
  /** Every file the drop could not stage, each with its own reason. */
  failures: readonly FileFailure[]
}

/**
 * Every file that did not make it into the session, named one by one with its own reason.
 *
 * Per file and never as a count, because the preview below simply will not carry a row for a
 * file that was never staged — and a drop that reports fewer files than it contained, with
 * nothing saying which, is precisely the failure ADR 0018 was written about. One refusal does
 * not end the session, so this list sits *beside* a plan that describes everything that did land
 * rather than in place of it. Each failure keeps its own reason: two files can fail differently
 * in one drop, and one sentence standing for both would hide whichever was not chosen.
 *
 * The key carries the row's position as well as its path. A path is *nearly* unique — a session
 * stages each normalised path once — but a harvest can carry two files at one path before any of
 * them reaches a session, and React would then drop the second row silently, which is the one
 * failure mode this component exists to prevent.
 */
export function UploadFailures({ failures }: UploadFailuresProps) {
  if (failures.length === 0) return null
  return (
    <section className={SECTION} data-slot="upload-failures" role="alert">
      <h3 className={HEADING}>{headline(failures.length)}</h3>
      <ul className={LIST}>
        {failures.map((failure, position) => (
          <li key={`${String(position)} ${failure.path}`}>
            <span className={PATH} data-slot="failed-path">
              {failure.path}
            </span>
            {' — '}
            <span data-slot="failed-reason">{failure.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
