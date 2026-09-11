import type { ProgressValue } from '@repo/contracts'
import { OverallProgress } from '../projects/overall-progress'
import { SHARED_WORKSPACE } from './copy'

/**
 * The client head's progress: `Overall progress: N%` and an unlabelled bar, or — with no
 * checklist items at all — `A shared project workspace` and no bar.
 *
 * The admin head says `No tasks yet` in the same place; the app being replaced worded the two
 * surfaces differently, and this keeps the client's wording (parity inventory, row 51).
 */
export function LinkProgress({ done, total }: ProgressValue) {
  if (total === 0) return <span className="text-[13px] text-muted-foreground">{SHARED_WORKSPACE}</span>
  return <OverallProgress done={done} total={total} />
}
