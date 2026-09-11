import type { ProgressValue } from '@repo/contracts'
import { ProgressBar } from '@repo/ui/shell/progress-bar'

/**
 * The project header's `Overall progress: N%` and an unlabelled bar, or `No tasks yet`, as the
 * app being replaced drew it — summed here from the tasks' cached progress (ADR 0007).
 */
export function OverallProgress({ done, total }: ProgressValue) {
  if (total === 0) return <span className="text-[13px] whitespace-nowrap text-muted-foreground">No tasks yet</span>
  const percent = Math.round((done / total) * 100)
  return (
    <span className="flex items-center gap-2.5 text-[13px] whitespace-nowrap text-muted-foreground">
      <span>{`Overall progress: ${String(percent)}%`}</span>
      <ProgressBar done={done} label={false} total={total} />
    </span>
  )
}
