import type { ProgressValue } from '@repo/contracts'
import { ProgressBar } from '@repo/ui/shell/progress-bar'
import type { PrincipalKind } from '../../lib/principal'
import { emptyProgressText } from './tab-copy'

/** Props for {@link TabProgressRow}. */
export interface TabProgressRowProps {
  /** The open tab's name. */
  name: string
  /** Its checklist count, live as the user types. */
  progress: ProgressValue
  /** Which surface is rendering, which picks the empty sentence. */
  audience: PrincipalKind
  /** Whether the viewer can edit, which picks between the two link sentences. */
  writable: boolean
}

/**
 * The open tab's progress: its name, `N / M completed`, and an unlabelled bar.
 *
 * With no checklist items it reads legacy's sentence for the viewer — `No checklist items in this
 * tab` to the admin, `No checklist items yet` to a link that can edit, `Nothing to tick here` to
 * one that cannot. The admin page still drew a zero-width bar there and the share page drew none,
 * and both are kept.
 *
 * It sits between the strip and the editor rather than between the toolbar and the document as
 * legacy's did, because the toolbar belongs to the editor island; it is drawn as the top of the
 * same card, so strip, row and editor still read as one object.
 */
export function TabProgressRow({ name, progress, audience, writable }: TabProgressRowProps) {
  const empty = progress.total === 0
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-x bg-card px-[26px] py-2.5 text-[13px] text-muted-foreground max-sm:px-4"
      data-slot="tab-progress"
    >
      <strong className="font-semibold text-foreground">{name}</strong>
      <span>{empty ? emptyProgressText(audience, writable) : `${String(progress.done)} / ${String(progress.total)} completed`}</span>
      {empty && audience === 'link' ? null : <ProgressBar done={progress.done} label={false} total={progress.total} />}
    </div>
  )
}
