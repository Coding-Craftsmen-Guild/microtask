import { PREVIEW_LABEL, PREVIEW_TONE, taskCountLabel } from './outcomes'
import { ShareLinkList } from './share-link-list'
import type { TransferGroup } from './vocabulary'

const CELL = 'border-t border-border px-3 py-2 align-top'
const PATH = 'font-mono text-[12px] break-all'
const NAME = 'text-muted-foreground'
const REASONS = 'mt-1.5 grid list-disc gap-0.5 pl-4 text-[12px] text-muted-foreground'

/** Props for {@link PreviewRow}. */
export interface PreviewRowProps {
  /** The dropped group this row describes. */
  group: TransferGroup
}

/**
 * One dropped group's row: where it came from, what it was detected as, how its manifest and its
 * files agree, every link it asserts, and what will happen to it.
 *
 * The outcome is carried on `data-outcome` as well as in the badge's paint, so the three are
 * distinguishable by a reader who cannot see colour and by a test that must not pass because two
 * outcomes happen to render the same words.
 */
export function PreviewRow({ group }: PreviewRowProps) {
  return (
    <tr data-outcome={group.outcome} data-slot="preview-row">
      <td className={CELL}>
        <div className={PATH}>{group.path}</div>
        <div className={NAME}>{group.name === '' ? 'Unnamed project' : group.name}</div>
      </td>
      <td className={CELL}>{group.shape}</td>
      <td className={CELL}>{taskCountLabel(group)}</td>
      <td className={CELL}>
        <ShareLinkList links={group.shareLinks} />
      </td>
      <td className={CELL}>
        <span className={PREVIEW_TONE[group.outcome]} data-slot="outcome">
          {PREVIEW_LABEL[group.outcome]}
        </span>
        {group.reasons.length > 0 ? (
          <ul className={REASONS} data-slot="reasons">
            {group.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </td>
    </tr>
  )
}
